# Tanda 3: costos protegidos, integridad de inventario y limpieza (PetStock AI)

Lee este archivo completo antes de empezar. Continúa las tandas 1 y 2, que ya están en `main` y en producción (2 oct 2026).

## Reglas (las mismas de la tanda 2)

1. Rama `fix/tanda-3` **desde `main` actualizado** (`git checkout main && git pull`). Nunca hagas push ni merge a `main`.
2. **No ejecutes SQL contra Supabase.** Los cambios de base van como archivos en `supabase/migrations/` (`AAAAMMDDHHMMSS_descripcion.sql`). Yo los audito y los pruebo antes de que se corran.
3. Parte de `supabase/referencia/funciones.csv` y `diagnostico.csv` como esquema base, **más** las migraciones de la tanda 2 que ya están en `supabase/migrations/` (ya aplicadas en producción). Toda función que modifiques debe partir de su versión vigente (la de la migración `..._autorizacion_en_funciones.sql`), no del CSV.
4. Toda función de escritura nueva: `SECURITY DEFINER`, `set search_path = public`, `perform public.assert_store_role(...)` al inicio según la matriz, y `revoke execute ... from public, anon`.
5. Toda ruta nueva o modificada: `requireUser`/`requireRole` de `lib/auth/require-role.ts`, `rpcErrorMessage` para los errores de RPC, y nada de llave secreta.
6. Cambios mínimos. **No borres archivos ni muevas rutas sin mi aprobación** (en la Parte C te digo cuáles están aprobados).
7. Si algo no está claro, pregunta. No asumas.
8. Al terminar cada parte: `npx tsc --noEmit`, `npx eslint .` (sin errores nuevos contra `main`) y `npm run build`. Entrégame: tabla punto → archivos → cambio → cómo lo probaste, el **orden de despliegue** y el diff.

## Matriz de roles (vigente)

| Acción | owner | admin | manager | employee |
|---|---|---|---|---|
| Vender, devoluciones | ✓ | ✓ | ✓ | ✓ |
| Compras, recepciones, anular compras | ✓ | ✓ | ✓ | |
| Movimientos, ajustes, traslados, carga inicial/masiva, asignar stock a ubicaciones | ✓ | ✓ | ✓ | |
| Crear/editar catálogo (productos, proveedores, almacenes, sucursales, ubicaciones) | ✓ | ✓ | ✓ | |
| Borrar catálogo | ✓ | ✓ | | |
| Ver costos (precio de compra, costo unitario, totales de compras) | ✓ | ✓ | ✓ | |
| Reportes | ✓ | ✓ | ✓ | |

---

## Parte A: base de datos (solo archivos SQL; entrégamelos primero y detente)

### A1. Costos fuera del alcance del employee (prioridad 1)

Hoy RLS filtra filas, no columnas: un employee con su sesión puede pedir `products.purchase_price`, `purchase_items.unit_cost`, `purchases.total`, etc. directo a Supabase.

1. **Compras y recepciones solo para manager+**: cambia las políticas SELECT de `purchases`, `purchase_items`, `receipts` y `receipt_items` para exigir `get_my_role() in ('owner','admin','manager')`, además de la tienda.
2. **Precio de compra del producto en tabla aparte**:
   - Nueva tabla `product_costs (product_id uuid primary key references products(id) on delete cascade, store_id uuid not null, purchase_price numeric not null default 0, updated_at timestamptz default now(), updated_by uuid default auth.uid() references auth.users(id) on delete set null)`.
   - RLS: SELECT, INSERT y UPDATE solo para la misma tienda y rol owner/admin/manager. DELETE solo owner/admin.
   - Backfill desde `products.purchase_price`.
   - **Despliegue en dos fases**:
     - Migración A1-a: crea la tabla, sus políticas y el backfill. **No toca `products`.**
     - Migración A1-b (se corre después del merge del código): vuelve a sincronizar con un upsert desde `products.purchase_price` (por si alguien editó un costo entre A1-a y el merge) y luego `alter table products drop column purchase_price`.
   - Antes de escribir A1-b, busca en todo el código y en las funciones SQL cualquier uso de `purchase_price` y lístamelos.

### A2. Anular compras pendientes

`cancel_purchase(p_store_id uuid, p_purchase_id uuid, p_reason text)`: manager+, solo si la compra está `'pendiente'` (bloqueo `FOR UPDATE`), la pasa a `'cancelada'` y guarda el motivo en `notes` (concatenado). Error claro si ya está recibida o cancelada.

### A3. Carga inicial atómica e idempotente

1. Tabla `processed_requests (request_id uuid primary key, store_id uuid not null, kind text not null, created_at timestamptz default now(), created_by uuid default auth.uid())`, con RLS activo y **sin políticas** (solo la escriben las funciones).
2. Nueva función `register_initial_load(p_store_id uuid, p_items jsonb, p_request_id uuid)`: manager+. Valida **todos** los ítems antes de modificar nada (como `register_bulk_inventory`) y aplica todo en una sola transacción, usando `_apply_inventory_movement` con tipo `'ajuste'`. Si `p_request_id` ya existe en `processed_requests`, lanza un error claro ("Esta carga ya fue procesada") sin aplicar nada.
3. `register_bulk_inventory`: agrega el parámetro `p_request_id uuid default null` con la misma lógica de idempotencia. Como cambia la firma, crea la nueva versión, actualiza los grants y elimina la vieja **en la misma migración** (verifica que nada más la use).

### A4. Stock por ubicación sin "unidades fantasma"

Nueva función `assign_location_stock(p_store_id, p_product_id, p_warehouse_id, p_location_id, p_quantity)`: manager+. Asigna existencias a una ubicación **sin cambiar el stock total**: valida que la suma de existencias localizadas del producto (incluida la nueva cantidad) no supere `products.stock`, con bloqueo `FOR UPDATE` del producto. Respeta `inventory_stock_scope_check`. Si propones otra regla, explícamela antes de escribirla.

### A5. Funciones de reporte (para dejar de traer todas las filas al navegador)

Funciones `STABLE`, `SECURITY DEFINER`, manager+, con fechas en `America/Bogota` (`p_desde date`, `p_hasta date`, ambas inclusivas):
- `report_sales_summary(p_store_id, p_desde, p_hasta)`: total vendido, número de ventas, ticket promedio, ventas por día y top productos (cantidad e ingreso).
- `report_movements_summary(p_store_id, p_desde, p_hasta)`: entradas, salidas, variación por ajustes (`stock_after - stock_before`) y variación neta.

Antes de escribirlas, revisa qué muestran hoy `app/reportes/ventas` y `app/reportes/movimientos`, para que las funciones devuelvan exactamente esos datos.

### A6. `create_purchase` sin ocultar errores

Quita el bloque `EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;`: convierte cualquier error técnico en un mensaje de negocio (`P0001`) que la API muestra al usuario.

### A7. No desactivar ni borrar con existencias

En las funciones o políticas que correspondan, o en la API si es más simple (dime cuál eliges): no permitir desactivar ni borrar un almacén, sucursal o ubicación que tenga `inventory_stock.quantity > 0`.

**Entrega de la Parte A:** los archivos SQL, el orden en que se deben correr y qué partes dependen del código nuevo. Detente ahí.

---

## Parte B: código (después de que apruebe la Parte A)

1. **Costos (A1)**: todas las rutas que leen o escriben `purchase_price` pasan a `product_costs`. El formulario de producto sigue mostrando y guardando el precio de compra para manager+. El employee no lo ve ni lo recibe. Las compras usan el costo de `product_costs` como valor sugerido.
2. **Página de compras y recepciones**: si la API responde 403, mostrar "No tienes acceso a Compras" en lugar del formulario vacío.
3. **Anular compra (A2)**: botón "Anular" en compras pendientes, con confirmación y motivo obligatorio.
4. **Carga inicial y masiva (A3)**: el cliente genera un `request_id` (`crypto.randomUUID()`) por cada envío y lo reutiliza en los reintentos de ese mismo envío. La ruta de carga inicial usa `register_initial_load`.
5. **Asignar stock (A4)**: `POST /api/inventory/stock` usa `assign_location_stock`.
6. **Reportes (A5)**: las páginas de reportes usan las nuevas funciones.
7. **Paginación real** en historiales de ventas, movimientos, compras y traslados: `limit`/`offset` (o cursor) con controles "Anterior / Siguiente" y total de registros. Quita `fetchAllRows` donde ya no haga falta y deja registro en el log si alguna lectura llega al tope.
8. **Devoluciones**: el máximo a devolver debe ser lo que **queda** por devolver (vendido menos ya devuelto), no lo vendido.
9. **Validaciones pendientes de la auditoría** (revisa si siguen y corrige):
   - `branches/[id]`: no ignorar campos cuando viene `is_active` y no poner en null los campos que no vienen.
   - `.ilike("name", ...)` en warehouses y branches: escapar `%` y `_`.
   - `products/[id]` PUT: si un campo no viene (`undefined`), conservar el valor actual.

---

## Parte C: navegación y limpieza (aprobado por mí)

1. **Menú**: agregar enlaces a Entradas (Compras, Recepciones, Devoluciones), Movimientos y Reportes, visibles según el rol (employee solo ve Devoluciones). Resaltar solo la opción más específica.
2. **Escáner**: mover `app/inventory/scanner` a `app/inventario/escaner`, con redirección desde la ruta vieja.
3. **Duplicados**:
   - Eliminar `app/inventario/cargue` (duplica el cargue CSV de `/inventario`).
   - Conservar `app/inventario/carga` (ajuste masivo en grilla) y enlazarla desde `/inventario` como "Ajuste masivo".
   - Eliminar `app/inventario/proveedores` y redirigir a `/proveedores`.
4. **APIs sin uso**: confirma si `/api/sales/history` sigue sin usarse. Si es así, propón eliminarla (no la borres sin mi visto bueno).

---

## Fuera de alcance (solo propuesta escrita, no implementar)

- **Lotes y vencimientos (FEFO)**: hoy los lotes no se descuentan en ventas, salidas ni traslados. Escríbeme una propuesta de diseño (tablas, funciones, cambios en ventas) en `docs/propuesta-lotes.md`.

## Decisión registrada

- Producto inactivo: bloquea ventas y traslados; **permite** entradas, ajustes y recepciones. No cambiar.

## Pruebas que debes dejarme documentadas

Checklist para el preview con employee, manager y owner, que cubra: el employee no puede leer costos ni compras (tampoco consultando Supabase directo), anular compra, carga inicial repetida con el mismo `request_id` (rechazada), asignación de stock que supere el total (rechazada), reportes con las mismas cifras que antes, y paginación.

## Empieza

Rama `fix/tanda-3` desde `main`. Entrégame **solo la Parte A** (archivos SQL + orden + dependencias) y detente.
