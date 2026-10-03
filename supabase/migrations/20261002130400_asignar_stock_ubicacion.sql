-- =====================================================================
-- Migración tanda 3, A4: stock por ubicación sin "unidades fantasma"
--
-- Hoy /api/inventory/stock POST crea una fila en inventory_stock sin
-- comprobar que la suma de lo ya localizado para ese producto, más lo
-- nuevo, no supere products.stock. Esta función sí lo hace, para los
-- 3 niveles que permite inventory_stock_scope_check:
--
-- - Sucursal:            branch_id solo.
-- - Almacén sin ubicación: warehouse_id solo.
-- - Almacén + ubicación:   warehouse_id y location_id.
--
-- p_branch_id, p_warehouse_id y p_location_id son opcionales; la
-- función determina el nivel según cuáles vienen, igual que ya hace
-- POST /api/inventory/stock hoy en el código.
--
-- No hay una restricción UNIQUE conocida sobre
-- (store_id, product_id, branch_id, warehouse_id, location_id) en
-- diagnostico.csv (solo aparecen las reglas CHECK; no sé si existe una
-- UNIQUE o un índice único que no haya quedado registrado ahí). Por
-- eso esta función no depende de capturar un unique_violation: bloquea
-- primero la fila del producto (FOR UPDATE), y esa misma fila serializa
-- cualquier otra llamada concurrente para el mismo producto -incluida
-- la comprobación de duplicado-, así que la comprobación posterior es
-- segura sin necesidad de esa restricción.
-- =====================================================================

create or replace function public.assign_location_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_branch_id uuid default null,
  p_warehouse_id uuid default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_scope text;
  v_product_stock integer;
  v_branch_active boolean;
  v_warehouse_active boolean;
  v_location_warehouse_id uuid;
  v_location_active boolean;
  v_already_assigned integer;
  v_existing_id uuid;
  v_stock_id uuid;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_product_id is null then
    raise exception 'El producto es obligatorio.';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'La cantidad debe ser un número entero mayor o igual a 0.';
  end if;

  -- =========================================================
  -- DETERMINAR NIVEL (igual que inventory_stock_scope_check)
  -- =========================================================

  if p_branch_id is not null then

    if p_warehouse_id is not null or p_location_id is not null then
      raise exception
        'Una existencia por sucursal no puede incluir almacén ni ubicación.';
    end if;

    v_scope := 'branch';

  elsif p_warehouse_id is not null and p_location_id is not null then

    v_scope := 'location';

  elsif p_warehouse_id is not null then

    v_scope := 'warehouse';

  elsif p_location_id is not null then

    raise exception 'Una ubicación debe indicar también su almacén.';

  else

    raise exception
      'Debes indicar sucursal, almacén o almacén + ubicación.';

  end if;

  -- Bloquear el producto: serializa cualquier otra asignación
  -- concurrente para el mismo producto (ver nota de cabecera).
  select stock
  into v_product_stock
  from public.products
  where id = p_product_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Producto no encontrado.';
  end if;

  -- =========================================================
  -- VALIDAR SUCURSAL
  -- =========================================================

  if v_scope = 'branch' then

    select is_active
    into v_branch_active
    from public.branches
    where id = p_branch_id
      and store_id = p_store_id;

    if not found then
      raise exception 'Sucursal no encontrada.';
    end if;

    if not v_branch_active then
      raise exception
        'No puedes asignar inventario a una sucursal inactiva.';
    end if;

  end if;

  -- =========================================================
  -- VALIDAR ALMACÉN
  -- =========================================================

  if v_scope in ('warehouse', 'location') then

    select is_active
    into v_warehouse_active
    from public.warehouses
    where id = p_warehouse_id
      and store_id = p_store_id;

    if not found then
      raise exception 'Almacén no encontrado.';
    end if;

    if not v_warehouse_active then
      raise exception
        'No puedes asignar inventario a un almacén inactivo.';
    end if;

  end if;

  -- =========================================================
  -- VALIDAR UBICACIÓN
  -- =========================================================

  if v_scope = 'location' then

    select warehouse_id, is_active
    into v_location_warehouse_id, v_location_active
    from public.locations
    where id = p_location_id
      and store_id = p_store_id;

    if not found or v_location_warehouse_id is distinct from p_warehouse_id then
      raise exception
        'La ubicación no existe o no pertenece a este almacén.';
    end if;

    if not v_location_active then
      raise exception
        'No puedes asignar inventario a una ubicación inactiva.';
    end if;

  end if;

  -- ¿Ya existe una existencia para este producto en este nivel exacto?
  select id
  into v_existing_id
  from public.inventory_stock
  where store_id = p_store_id
    and product_id = p_product_id
    and branch_id is not distinct from p_branch_id
    and warehouse_id is not distinct from p_warehouse_id
    and location_id is not distinct from p_location_id;

  if v_existing_id is not null then
    raise exception
      'Ya existe una existencia para este producto en este nivel de inventario.';
  end if;

  -- Suma de TODO lo ya localizado para este producto en la tienda,
  -- sin importar el nivel (sucursal, almacén o ubicación).
  select coalesce(sum(quantity), 0)
  into v_already_assigned
  from public.inventory_stock
  where store_id = p_store_id
    and product_id = p_product_id;

  if v_already_assigned + p_quantity > v_product_stock then
    raise exception
      'La suma localizada (%) superaría el stock total del producto (%).',
      v_already_assigned + p_quantity,
      v_product_stock;
  end if;

  insert into public.inventory_stock (
    store_id,
    branch_id,
    warehouse_id,
    location_id,
    product_id,
    quantity
  )
  values (
    p_store_id,
    p_branch_id,
    p_warehouse_id,
    p_location_id,
    p_product_id,
    p_quantity
  )
  returning id into v_stock_id;

  return jsonb_build_object(
    'ok', true,
    'scope', v_scope,
    'stock_id', v_stock_id,
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'warehouse_id', p_warehouse_id,
    'location_id', p_location_id,
    'quantity', p_quantity,
    'product_stock', v_product_stock,
    'total_assigned', v_already_assigned + p_quantity
  );

end;
$function$;

revoke execute on function public.assign_location_stock(uuid, uuid, integer, uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_location_stock(uuid, uuid, integer, uuid, uuid, uuid) to authenticated, service_role;
