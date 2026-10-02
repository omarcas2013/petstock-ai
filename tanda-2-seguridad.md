# Tanda 2: seguridad, roles y funciones de la base (PetStock AI)

Lee este archivo completo antes de empezar. Viene de una auditoría del código y de la base de datos de Supabase (2 oct 2026).

## Reglas

1. Crea la rama `fix/tanda-2-seguridad` **desde `main` actualizado** (`git checkout main && git pull` primero; la tanda 1 ya está en `main`). Nunca hagas push ni merge a `main`.
2. **No ejecutes SQL contra Supabase.** Todo cambio de base va como archivo en `supabase/migrations/` (nombre `AAAAMMDDHHMMSS_descripcion.sql`). Yo lo audito y lo corro en el SQL Editor.
3. Cambios mínimos. No reestructures carpetas ni cambies diseño. No borres archivos sin mi aprobación.
4. Si una decisión no está aquí, pregúntame. No asumas.
5. Al terminar: `npx tsc --noEmit`, `npx eslint .` (sin errores nuevos) y `npm run build` deben pasar. Entrégame: tabla punto → archivos → qué cambiaste → cómo lo probaste, más el **orden exacto de despliegue**.
6. Next.js 16: lee `node_modules/next/dist/docs/` antes de escribir código (ver `AGENTS.md`).

## Contexto de la base (ya verificado)

Tengo en `Descargas` dos CSV exportados de Supabase: `funciones.csv` (código de todas las funciones) y el diagnóstico (columnas, políticas RLS, reglas CHECK y permisos). Pídeme la ruta si los necesitas. Resumen:

- **Las políticas RLS están bien**: filtran por `get_my_store_id()` y por rol con `get_my_role()`. Escritura owner/admin/manager; borrado owner/admin. Las tablas `purchases`, `purchase_items` y `receipts` solo tienen SELECT: se escriben únicamente vía funciones.
- **Todas las funciones de escritura son `SECURITY DEFINER`** y se saltan RLS. Salvo `register_sale`, **ninguna verifica `auth.uid()`, la tienda del usuario ni su rol**: confían en el `p_store_id` recibido.
- **Arreglo ya aplicado en producción** (hay que guardarlo como migración, punto 1):
  ```sql
  revoke execute on function <las 9 de escritura> from public, anon;
  grant execute on function <las 9 de escritura> to authenticated, service_role;
  ```
  Las 9 son: `create_purchase`, `receive_purchase` (2 versiones), `receive_purchase_at_scope`, `register_bulk_inventory`, `register_customer_return`, `register_inventory_movement`, `register_sale`, `transfer_inventory`.
- Columnas relevantes:
  - `inventory_movements`: `id, product_id, movement_type, quantity, reason, created_at, stock_before, stock_after` (**no tiene `store_id` ni usuario**).
  - `customer_return_items`: `id, return_id, product_id, sale_item_id, quantity, created_at` (**no tiene `unit_price` ni `subtotal`**).
  - `customer_returns.status` CHECK: solo `'confirmada'` o `'cancelada'`.
  - `profiles.role` CHECK: `owner, admin, manager, employee`.
- Stock y cantidades son **enteros** y se mantienen así.

## Matriz de roles (confirmada; coincide con RLS)

| Acción | owner | admin | manager | employee |
|---|---|---|---|---|
| Vender, devoluciones | ✓ | ✓ | ✓ | ✓ |
| Compras y recepciones | ✓ | ✓ | ✓ | |
| Movimientos manuales, ajustes, traslados, carga inicial/masiva, escáner con movimiento de stock | ✓ | ✓ | ✓ | |
| Crear/editar proveedores, almacenes, sucursales, ubicaciones, productos | ✓ | ✓ | ✓ | |
| Borrar proveedores, almacenes, sucursales, ubicaciones, productos | ✓ | ✓ | | |
| Ver costo de compra (`purchase_price`) | ✓ | ✓ | ✓ | |

---

## Parte A: migraciones SQL (solo archivos, no las ejecutes)

**Migración 1: `permisos_funciones`**
- El revoke/grant de arriba (idempotente).
- `alter default privileges for role postgres in schema public revoke execute on functions from public, anon;`, para que las funciones futuras no queden abiertas.

**Migración 2: `autorizacion_en_funciones`**
1. Crear `public.assert_store_role(p_store_id uuid, p_roles text[]) returns void`, `SECURITY DEFINER`, `search_path = public`. Lanza excepción si `auth.uid()` es null ("Sesión requerida"), si la tienda del perfil ≠ `p_store_id` ("No perteneces a esta tienda") o si el rol no está en `p_roles` ("No tienes permisos para esta acción"). Revocar execute de `public` y `anon`.
2. Separar `register_inventory_movement` en dos:
   - `_apply_inventory_movement(...)`: la lógica actual, **sin** grant a `anon` ni a `authenticated`. La usan internamente las funciones de recepción.
   - `register_inventory_movement(...)`: misma firma pública; llama `assert_store_role(p_store_id, '{owner,admin,manager}')` y luego `_apply_inventory_movement`.
   - `receive_purchase_at_scope` llama a `_apply_inventory_movement`.
3. Agregar `assert_store_role` al inicio de cada función, según la matriz:
   - `register_sale`: todos los roles. Además, **rechazar productos con `is_active = false`** ("El producto X está inactivo").
   - `register_customer_return`: todos los roles.
   - `create_purchase`, `receive_purchase_at_scope`, `register_bulk_inventory`, `transfer_inventory`: owner/admin/manager.
4. Las dos versiones viejas de `receive_purchase`: confirma con grep que el código no las usa y propón `drop function`. No las incluyas sin mi visto bueno.
5. `is_manager_or_admin()`: si nada la usa (revisa código y políticas), propón eliminarla; si se usa, agrégale `'owner'`.

**Migración 3: `devoluciones`**
- `alter table customer_return_items add column unit_price numeric, add column subtotal numeric;`
- Backfill de las filas existentes desde `sale_items.unit_price` (vía `sale_item_id`).
- `register_customer_return`: cambiar `'completada'` por `'confirmada'`, **tanto en el insert como en el cálculo de lo ya devuelto**.

**Migración 4: `carga_masiva`**
- `register_bulk_inventory`: quitar `store_id` del insert en `inventory_movements` (esa columna no existe y hoy la función falla siempre) y guardar `stock_before` y `stock_after`.

**Migración 5: `trazabilidad`**
- Agregar `created_by uuid default auth.uid() references auth.users(id)` a `inventory_movements`, `sales`, `purchases`, `customer_returns` e `inventory_transfers`. Verifica que `auth.uid()` funcione como default dentro de funciones `SECURITY DEFINER` llamadas con la sesión del usuario, y explícame cómo lo comprobaste.

---

## Parte B: código Next.js

6. **Helper `lib/auth/require-role.ts`**: obtiene el usuario y el perfil (`store_id`, `role`) con el cliente de sesión y responde 401/403 en JSON. Mueve aquí `INVENTORY_MANAGER_ROLES` (hoy en `lib/quantity.ts`) y define las constantes de la matriz.
7. **Aplicar el helper en todas las rutas de escritura**, según la matriz: `inventory/movements`, `barcode`, `returns`, `transfers`, `bulk`, `initial-load`, `stock` (POST/PUT/DELETE), `warehouses`, `branches`, `locations`, `products`, `products/[id]/lots`, `suppliers`, `purchases`, `purchases/[id]/receive` y `sales`.
8. **Eliminar el uso de `SUPABASE_SECRET_KEY`** en `initial-load`, `bulk`, `suppliers`, `products`, `sales/history` y cualquier otra ruta: usar el cliente de sesión, para que apliquen RLS y `auth.uid()`. Si alguna ruta realmente necesita la llave secreta, explícame por qué antes de dejarla.
9. **Costos**: en `products` GET y `products/[id]` GET, no devolver `purchase_price` al rol `employee`.
10. **Errores**: no devolver `error.details`, `hint` ni `code` de Postgres al cliente; registrarlos en el log del servidor. Los mensajes de las excepciones de las funciones (`RAISE EXCEPTION`) sí se pueden mostrar.
11. **Devoluciones**: `GET /api/inventory/returns` usa los nuevos `unit_price`/`subtotal` guardados, con fallback a `sale_items` si vienen null.
12. **UX de devoluciones**: si la venta tiene un solo producto, seleccionarlo automáticamente; si tiene varios, que las tarjetas se vean claramente seleccionables (cursor, borde al pasar el mouse, estado seleccionado).
13. **Escáner** (`barcode` POST): `.maybeSingle()` y, si hay más de un producto con el mismo código en la tienda, error claro ("Código de barras duplicado: …").

---

## Orden de despliegue (crítico)

Las migraciones que agregan `assert_store_role` **rompen cualquier ruta que siga usando la llave secreta**, porque con ella `auth.uid()` es null. Por eso el orden es:

1. Merge del código (Parte B): las rutas pasan a usar la sesión. Esto funciona con las funciones actuales.
2. Correr las migraciones 1, 3, 4 y 5 (no dependen del orden del código).
3. Correr la migración 2 al final.

Confírmame que este orden es correcto con tu implementación, o propón otro.

## Pruebas que debes dejarme documentadas

Un checklist para que yo pruebe en el preview de Vercel con un usuario **employee** y otro **manager**:
- employee: vende ✓, registra devolución ✓, intenta un ajuste de stock → 403, intenta recibir una compra → 403, no ve el costo de compra.
- manager: ajuste ✓, recepción ✓, traslado ✓, carga masiva ✓ (con stock antes/después en el reporte), no puede borrar un proveedor.
- Devolución completa: stock +1, aparece en el listado con precio y subtotal.
- Venta de un producto inactivo (vía API) → rechazada.

## Empieza

Rama `fix/tanda-2-seguridad` desde `main`. Primero entrégame **solo los 5 archivos SQL** para auditarlos. Después de mi aprobación, haz la Parte B.