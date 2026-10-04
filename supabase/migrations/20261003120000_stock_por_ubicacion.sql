-- =====================================================================
-- Tanda 4: stock por ubicación
--
-- Regla: lo ubicado (suma de inventory_stock del producto, en
-- cualquier nivel: sucursal, almacén o almacén + ubicación) nunca
-- puede superar products.stock. Ubicar sigue siendo opcional: un
-- producto puede tener todo o parte de su stock "sin ubicar".
--
-- Qué hace, en orden:
-- 1. Cuadra los descuadres existentes (lo ubicado > total), quitando
--    unidades de las ubicaciones con menos cantidad primero.
-- 2. Dos triggers que hacen cumplir la regla en TODOS los caminos
--    (ventas, salidas, ajustes, cargas masivas, asignaciones).
-- 3. register_sale: cada ítem puede traer "stock_id" (la fila de
--    inventory_stock de la que sale). Si no lo trae, la venta sale de
--    lo "sin ubicar" y debe alcanzar.
-- 4. register_inventory_movement: nuevo parámetro opcional p_stock_id
--    para salidas desde una ubicación (se elimina la firma vieja en la
--    misma migración para no dejar dos versiones).
-- 5. release_location_stock: pasa unidades de una ubicación a "sin
--    ubicar" sin cambiar el total (para poder hacer ajustes a la baja).
-- 6. assign_location_stock: si la existencia ya existe en ese nivel,
--    suma la cantidad en vez de rechazar.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cuadrar descuadres existentes
-- ---------------------------------------------------------------------

do $$
declare
  v_product record;
  v_row record;
  v_excess integer;
  v_take integer;
begin
  for v_product in
    select p.id, p.stock, sum(s.quantity)::integer as located
    from public.products p
    join public.inventory_stock s on s.product_id = p.id
    group by p.id, p.stock
    having sum(s.quantity) > coalesce(p.stock, 0)
  loop
    v_excess := v_product.located - coalesce(v_product.stock, 0);

    for v_row in
      select id, quantity
      from public.inventory_stock
      where product_id = v_product.id
        and quantity > 0
      order by quantity asc, id
    loop
      exit when v_excess <= 0;

      v_take := least(v_row.quantity, v_excess);

      update public.inventory_stock
      set quantity = quantity - v_take,
          updated_at = now()
      where id = v_row.id;

      v_excess := v_excess - v_take;
    end loop;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Triggers que hacen cumplir la regla
-- ---------------------------------------------------------------------

-- Al bajar products.stock: el nuevo total debe cubrir lo ubicado.
create or replace function public.check_stock_covers_located()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_located integer;
begin
  if coalesce(new.stock, 0) >= coalesce(old.stock, 0) then
    return new;
  end if;

  select coalesce(sum(quantity), 0)
  into v_located
  from public.inventory_stock
  where product_id = new.id;

  if coalesce(new.stock, 0) < v_located then
    raise exception
      'El producto % quedaría con % unidades, pero tiene % en ubicaciones. Primero descuenta o libera las unidades de las ubicaciones.',
      new.name, coalesce(new.stock, 0), v_located;
  end if;

  return new;
end;
$function$;

drop trigger if exists check_stock_covers_located_trigger on public.products;

create trigger check_stock_covers_located_trigger
after update of stock on public.products
for each row
execute function public.check_stock_covers_located();


-- Al subir lo ubicado: no puede superar el total del producto.
-- Bloquea el producto (FOR UPDATE) para no competir con una venta o
-- un ajuste simultáneo.
create or replace function public.check_located_within_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_stock integer;
  v_name text;
  v_located integer;
begin
  if tg_op = 'UPDATE'
     and new.product_id is not distinct from old.product_id
     and coalesce(new.quantity, 0) <= coalesce(old.quantity, 0) then
    return new;
  end if;

  select coalesce(stock, 0), name
  into v_stock, v_name
  from public.products
  where id = new.product_id
  for update;

  select coalesce(sum(quantity), 0)
  into v_located
  from public.inventory_stock
  where product_id = new.product_id;

  if v_located > v_stock then
    raise exception
      'No se puede ubicar: el producto % tiene % unidades en total y quedarían % en ubicaciones.',
      v_name, v_stock, v_located;
  end if;

  return new;
end;
$function$;

drop trigger if exists check_located_within_stock_trigger on public.inventory_stock;

create trigger check_located_within_stock_trigger
after insert or update of quantity, product_id on public.inventory_stock
for each row
execute function public.check_located_within_stock();

revoke execute on function public.check_stock_covers_located() from public, anon, authenticated;
revoke execute on function public.check_located_within_stock() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. register_sale con origen por ítem (stock_id opcional)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_sale(p_items jsonb, p_payment_method text, p_customer_name text, p_store_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare
  v_user_id uuid;
  v_user_store_id uuid;

  v_sale_id uuid;
  v_subtotal numeric := 0;

  v_item jsonb;

  v_product_id uuid;
  v_quantity integer;
  v_stock_id uuid;

  v_sale_price numeric;
  v_stock integer;
  v_new_stock integer;
  v_located integer;
  v_location_quantity integer;

  v_item_subtotal numeric;

  v_product_store_id uuid;

  v_product_name text;
  v_product_active boolean;

begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager', 'employee']);

  -- Usuario autenticado
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;


  -- Obtener tienda del usuario
  select store_id
  into v_user_store_id
  from public.profiles
  where id = v_user_id;

  if v_user_store_id is null then
    raise exception 'El usuario no tiene una tienda asignada';
  end if;


  -- Validar que la tienda solicitada sea la del usuario
  if p_store_id is null then
    raise exception 'La tienda es obligatoria';
  end if;

  if p_store_id is distinct from v_user_store_id then
    raise exception 'El usuario no pertenece a la tienda indicada';
  end if;


  -- Validar items
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then

    raise exception
      'La venta debe contener al menos un producto';

  end if;


  -- Validar método de pago
  if p_payment_method is null
     or trim(p_payment_method) = '' then

    raise exception
      'El método de pago es obligatorio';

  end if;


  -- Crear venta
  insert into public.sales (
    store_id,
    customer_name,
    payment_method,
    subtotal,
    total
  )
  values (
    v_user_store_id,
    nullif(trim(p_customer_name), ''),
    trim(p_payment_method),
    0,
    0
  )
  returning id into v_sale_id;


  -- Procesar productos
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    begin
      v_product_id :=
        (v_item->>'product_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'ID de producto inválido';
    end;


    if v_product_id is null then
      raise exception
        'Cada producto debe tener un product_id';
    end if;


    begin
      v_quantity :=
        (v_item->>'quantity')::integer;
    exception
      when invalid_text_representation then
        raise exception
          'La cantidad debe ser un número entero';
    end;


    if v_quantity is null
       or v_quantity <= 0 then

      raise exception
        'La cantidad debe ser mayor que 0';

    end if;


    -- Origen opcional: fila de inventory_stock de la que sale.
    begin
      v_stock_id :=
        nullif(v_item->>'stock_id', '')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Ubicación de origen inválida';
    end;


    -- Obtener producto y bloquearlo
    select
      sale_price,
      stock,
      store_id,
      name,
      is_active
    into
      v_sale_price,
      v_stock,
      v_product_store_id,
      v_product_name,
      v_product_active
    from public.products
    where id = v_product_id
    for update;


    if not found then
      raise exception
        'Producto no encontrado: %',
        v_product_id;
    end if;


    -- Validar tienda
    if v_product_store_id is distinct from v_user_store_id then
      raise exception
        'El producto no pertenece a la tienda actual';
    end if;


    -- Validar que el producto esté activo
    if v_product_active is false then
      raise exception
        'El producto % está inactivo',
        v_product_name;
    end if;


    -- Validar stock total
    if v_stock < v_quantity then
      raise exception
        'Stock insuficiente para el producto % (disponible: %)',
        v_product_name, v_stock;
    end if;


    if v_stock_id is null then

      -- Sale de lo "sin ubicar": debe alcanzar.
      select coalesce(sum(quantity), 0)
      into v_located
      from public.inventory_stock
      where product_id = v_product_id;

      if v_stock - v_located < v_quantity then
        raise exception
          'El producto % tiene unidades en ubicaciones: elige de qué ubicación sale (sin ubicar solo hay %).',
          v_product_name, greatest(v_stock - v_located, 0);
      end if;

    else

      -- Sale de una ubicación concreta.
      select quantity
      into v_location_quantity
      from public.inventory_stock
      where id = v_stock_id
        and product_id = v_product_id
        and store_id = v_user_store_id
      for update;

      if not found then
        raise exception
          'La ubicación elegida no tiene el producto %',
          v_product_name;
      end if;

      if coalesce(v_location_quantity, 0) < v_quantity then
        raise exception
          'En la ubicación elegida solo hay % unidades de %',
          coalesce(v_location_quantity, 0), v_product_name;
      end if;

      update public.inventory_stock
      set
        quantity = quantity - v_quantity,
        updated_at = now()
      where id = v_stock_id;

    end if;


    -- Calcular subtotal
    v_item_subtotal :=
      v_sale_price * v_quantity;

    v_subtotal :=
      v_subtotal + v_item_subtotal;


    -- Insertar detalle
    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_sale_price,
      v_item_subtotal
    );


    -- Calcular nuevo stock
    v_new_stock :=
      v_stock - v_quantity;


    -- Actualizar stock global
    update public.products
    set
      stock = v_new_stock,
      updated_at = now()
    where id = v_product_id
      and store_id = v_user_store_id;


    -- Registrar movimiento
    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      reason,
      stock_before,
      stock_after
    )
    values (
      v_product_id,
      'salida',
      v_quantity,
      'Venta',
      v_stock,
      v_new_stock
    );

  end loop;


  -- Actualizar totales
  update public.sales
  set
    subtotal = v_subtotal,
    total = v_subtotal
  where id = v_sale_id
    and store_id = v_user_store_id;


  -- Respuesta
  return json_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'store_id', v_user_store_id,
    'subtotal', v_subtotal,
    'total', v_subtotal
  );

end;

$function$;


-- ---------------------------------------------------------------------
-- 4. register_inventory_movement con salida desde ubicación
-- ---------------------------------------------------------------------

drop function if exists public.register_inventory_movement(uuid, text, integer, text, uuid);

create or replace function public.register_inventory_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text,
  p_store_id uuid,
  p_stock_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_location_quantity integer;
  v_product_name text;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_stock_id is not null then

    if p_movement_type is distinct from 'salida' then
      raise exception
        'Solo las salidas pueden indicar una ubicación de origen.';
    end if;

    if p_quantity is null or p_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor que 0';
    end if;

    -- Mismo orden de bloqueo que las ventas: producto y luego ubicación.
    select name
    into v_product_name
    from public.products
    where id = p_product_id
      and store_id = p_store_id
    for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    select quantity
    into v_location_quantity
    from public.inventory_stock
    where id = p_stock_id
      and product_id = p_product_id
      and store_id = p_store_id
    for update;

    if not found then
      raise exception
        'La ubicación elegida no tiene el producto %',
        v_product_name;
    end if;

    if coalesce(v_location_quantity, 0) < p_quantity then
      raise exception
        'En la ubicación elegida solo hay % unidades de %',
        coalesce(v_location_quantity, 0), v_product_name;
    end if;

    update public.inventory_stock
    set
      quantity = quantity - p_quantity,
      updated_at = now()
    where id = p_stock_id;

  end if;

  return public._apply_inventory_movement(
    p_product_id,
    p_movement_type,
    p_quantity,
    p_reason,
    p_store_id
  );

end;
$function$;

revoke execute on function public.register_inventory_movement(uuid, text, integer, text, uuid, uuid) from public, anon;
grant execute on function public.register_inventory_movement(uuid, text, integer, text, uuid, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. Liberar unidades de una ubicación (pasan a "sin ubicar")
-- ---------------------------------------------------------------------

create or replace function public.release_location_stock(
  p_store_id uuid,
  p_stock_id uuid,
  p_quantity integer
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_product_id uuid;
  v_quantity integer;
begin

  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad a liberar debe ser mayor que cero.';
  end if;

  select product_id
  into v_product_id
  from public.inventory_stock
  where id = p_stock_id
    and store_id = p_store_id;

  if not found then
    raise exception 'Existencia no encontrada.';
  end if;

  -- Mismo orden de bloqueo: producto y luego ubicación.
  perform 1
  from public.products
  where id = v_product_id
  for update;

  select quantity
  into v_quantity
  from public.inventory_stock
  where id = p_stock_id
  for update;

  if coalesce(v_quantity, 0) < p_quantity then
    raise exception
      'En esa ubicación solo hay % unidades.',
      coalesce(v_quantity, 0);
  end if;

  update public.inventory_stock
  set
    quantity = quantity - p_quantity,
    updated_at = now()
  where id = p_stock_id;

  return json_build_object(
    'ok', true,
    'stock_id', p_stock_id,
    'quantity', coalesce(v_quantity, 0) - p_quantity
  );

end;
$function$;

revoke execute on function public.release_location_stock(uuid, uuid, integer) from public, anon;
grant execute on function public.release_location_stock(uuid, uuid, integer) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. assign_location_stock: si la existencia ya existe, suma
-- ---------------------------------------------------------------------

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
    -- Tanda 4: si ya existe la fila (por ejemplo, quedó en 0 tras
    -- ventas o liberaciones), se suma a ella en vez de rechazar.
    perform 1 from public.inventory_stock where id = v_existing_id for update;
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

  if v_existing_id is not null then
    update public.inventory_stock
    set
      quantity = coalesce(quantity, 0) + p_quantity,
      updated_at = now()
    where id = v_existing_id
    returning id into v_stock_id;
  else
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
  end if;

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


-- ---------------------------------------------------------------------
-- 7. inventory_stock solo se escribe vía funciones
--
-- La app ya no escribe esta tabla directo (todo pasa por
-- assign_location_stock, release_location_stock, transfer_inventory,
-- recepciones y ventas, que son SECURITY DEFINER). Quitar la escritura
-- directa evita que un cliente salte el orden de bloqueo
-- (producto -> existencia) y provoque un deadlock con una venta.
-- La lectura (SELECT por tienda) no cambia.
-- ---------------------------------------------------------------------

revoke insert, update, delete on table public.inventory_stock from authenticated, anon;
