-- =====================================================================
-- Tanda 5: lotes y vencimientos (FEFO), devoluciones al lote y a
-- estantería.
--
-- Reglas:
-- - Los lotes se activan por negocio (stores.manages_lots, solo el
--   owner) y, dentro de un negocio con lotes, por producto
--   (products.manages_lots). Con el negocio apagado nada cambia.
-- - Lote opcional: lo que está en lotes activos nunca supera
--   products.stock; el resto son unidades "sin lote".
-- - Al vender o sacar: 1) lotes vigentes, del que vence antes al que
--   vence después; 2) unidades sin lote; 3) lotes vencidos. Vender
--   vencidos se permite: la venta devuelve un aviso.
-- - Cada unidad que sale de (o vuelve a) un lote queda en
--   lot_movements, para devolver al lote de la venta y rastrear lotes.
-- - Lotes y estanterías son independientes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Configuración por negocio y por producto
-- ---------------------------------------------------------------------

alter table public.stores
  add column if not exists manages_lots boolean not null default false;

update public.products set manages_lots = false where manages_lots is null;

alter table public.products
  alter column manages_lots set default false;


-- ---------------------------------------------------------------------
-- 2. Trazabilidad de lotes
-- ---------------------------------------------------------------------

create table if not exists public.lot_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  lot_id uuid not null references public.product_lots(id) on delete cascade,
  kind text not null check (kind in ('venta', 'salida', 'devolucion', 'recepcion', 'alta', 'ajuste')),
  delta integer not null check (delta <> 0),
  sale_item_id uuid references public.sale_items(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index if not exists lot_movements_sale_item_idx
  on public.lot_movements (sale_item_id) where sale_item_id is not null;

create index if not exists lot_movements_lot_idx
  on public.lot_movements (lot_id);

create index if not exists product_lots_product_idx
  on public.product_lots (product_id, expiration_date);

alter table public.lot_movements enable row level security;

drop policy if exists lot_movements_select_same_store on public.lot_movements;

create policy lot_movements_select_same_store
  on public.lot_movements
  for select
  to authenticated
  using (store_id = get_my_store_id());

-- Solo las funciones escriben lotes y su historial.
revoke insert, update, delete on table public.lot_movements from authenticated, anon;
revoke insert, update, delete on table public.product_lots from authenticated, anon;


-- ---------------------------------------------------------------------
-- 3. Ayudantes internos
-- ---------------------------------------------------------------------

-- ¿El producto usa lotes? (negocio con lotes Y producto con lotes)
create or replace function public._product_uses_lots(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (select s.manages_lots and coalesce(p.manages_lots, false)
     from public.products p
     join public.stores s on s.id = p.store_id
     where p.id = p_product_id),
    false
  );
$function$;

-- Fecha de hoy en Colombia (para saber qué está vencido).
create or replace function public._today_bogota()
returns date
language sql
stable
as $function$
  select (now() at time zone 'America/Bogota')::date;
$function$;

-- Descuenta p_quantity unidades de los lotes del producto con FEFO.
-- Debe llamarse con el producto ya bloqueado (FOR UPDATE) y ANTES de
-- bajar products.stock. p_stock_before es el stock antes de la salida.
-- Devuelve la lista de lotes usados: [{lot_id, lot_number, quantity,
-- expired}]. Las unidades que salen "sin lote" no aparecen.
create or replace function public._consume_lots(
  p_product_id uuid,
  p_quantity integer,
  p_stock_before integer,
  p_kind text,
  p_sale_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_store_id uuid;
  v_today date := public._today_bogota();
  v_remaining integer := p_quantity;
  v_lotted integer;
  v_unlotted integer;
  v_take integer;
  v_lot record;
  v_used jsonb := '[]'::jsonb;
begin
  if not public._product_uses_lots(p_product_id) then
    return v_used;
  end if;

  select store_id into v_store_id from public.products where id = p_product_id;

  -- Bloquear los lotes del producto.
  perform 1
  from public.product_lots
  where product_id = p_product_id and is_active
  for update;

  select coalesce(sum(quantity), 0)
  into v_lotted
  from public.product_lots
  where product_id = p_product_id and is_active;

  v_unlotted := greatest(coalesce(p_stock_before, 0) - v_lotted, 0);

  -- 1) Lotes vigentes, del que vence antes al que vence después.
  for v_lot in
    select id, lot_number, quantity, expiration_date
    from public.product_lots
    where product_id = p_product_id
      and is_active
      and quantity > 0
      and (expiration_date is null or expiration_date >= v_today)
    order by expiration_date asc nulls last, created_at, id
  loop
    exit when v_remaining <= 0;

    v_take := least(v_lot.quantity, v_remaining);

    update public.product_lots
    set quantity = quantity - v_take, updated_at = now()
    where id = v_lot.id;

    insert into public.lot_movements (store_id, product_id, lot_id, kind, delta, sale_item_id)
    values (v_store_id, p_product_id, v_lot.id, p_kind, -v_take, p_sale_item_id);

    v_used := v_used || jsonb_build_object(
      'lot_id', v_lot.id, 'lot_number', v_lot.lot_number,
      'quantity', v_take, 'expired', false);

    v_remaining := v_remaining - v_take;
  end loop;

  -- 2) Unidades sin lote.
  if v_remaining > 0 then
    v_take := least(v_unlotted, v_remaining);
    v_remaining := v_remaining - v_take;
  end if;

  -- 3) Lotes vencidos, del más viejo al más nuevo.
  for v_lot in
    select id, lot_number, quantity, expiration_date
    from public.product_lots
    where product_id = p_product_id
      and is_active
      and quantity > 0
      and expiration_date < v_today
    order by expiration_date asc, created_at, id
  loop
    exit when v_remaining <= 0;

    v_take := least(v_lot.quantity, v_remaining);

    update public.product_lots
    set quantity = quantity - v_take, updated_at = now()
    where id = v_lot.id;

    insert into public.lot_movements (store_id, product_id, lot_id, kind, delta, sale_item_id)
    values (v_store_id, p_product_id, v_lot.id, p_kind, -v_take, p_sale_item_id);

    v_used := v_used || jsonb_build_object(
      'lot_id', v_lot.id, 'lot_number', v_lot.lot_number,
      'quantity', v_take, 'expired', true);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Stock insuficiente para descontar de los lotes.';
  end if;

  return v_used;
end;
$function$;

revoke execute on function public._product_uses_lots(uuid) from public, anon, authenticated;
revoke execute on function public._consume_lots(uuid, integer, integer, text, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Triggers: lo que está en lotes nunca supera el stock
-- ---------------------------------------------------------------------

-- Lotes anteriores a esta tanda: eran un registro manual que no se
-- descontaba ni cuadraba con el stock. Se desactivan (se conservan como
-- historial) para que no rompan la regla cuando se activen los lotes.
update public.product_lots
set is_active = false, updated_at = now()
where is_active
  and not public._product_uses_lots(product_id);

create or replace function public.check_stock_covers_lots()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_lotted integer;
begin
  if coalesce(new.stock, 0) >= coalesce(old.stock, 0) then
    return new;
  end if;

  -- Solo aplica a productos que usan lotes (negocio + producto).
  if not public._product_uses_lots(new.id) then
    return new;
  end if;

  select coalesce(sum(quantity), 0)
  into v_lotted
  from public.product_lots
  where product_id = new.id and is_active;

  if coalesce(new.stock, 0) < v_lotted then
    raise exception
      'El producto % quedaría con % unidades, pero tiene % en lotes. Primero ajusta la cantidad de los lotes.',
      new.name, coalesce(new.stock, 0), v_lotted;
  end if;

  return new;
end;
$function$;

drop trigger if exists check_stock_covers_lots_trigger on public.products;

create trigger check_stock_covers_lots_trigger
after update of stock on public.products
for each row
execute function public.check_stock_covers_lots();


create or replace function public.check_lots_within_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_stock integer;
  v_name text;
  v_lotted integer;
begin
  if tg_op = 'UPDATE'
     and new.product_id is not distinct from old.product_id
     and (case when new.is_active then coalesce(new.quantity, 0) else 0 end)
         <= (case when old.is_active then coalesce(old.quantity, 0) else 0 end) then
    return new;
  end if;

  if not public._product_uses_lots(new.product_id) then
    return new;
  end if;

  select coalesce(stock, 0), name
  into v_stock, v_name
  from public.products
  where id = new.product_id
  for update;

  select coalesce(sum(quantity), 0)
  into v_lotted
  from public.product_lots
  where product_id = new.product_id and is_active;

  if v_lotted > v_stock then
    raise exception
      'No hay suficientes unidades sin lote: el producto % tiene % en total y quedarían % en lotes.',
      v_name, v_stock, v_lotted;
  end if;

  return new;
end;
$function$;

drop trigger if exists check_lots_within_stock_trigger on public.product_lots;

create trigger check_lots_within_stock_trigger
after insert or update of quantity, is_active, product_id on public.product_lots
for each row
execute function public.check_lots_within_stock();


-- No se puede quitar "maneja lotes" a un producto con lotes que tengan
-- unidades, ni activarlo si el negocio no maneja lotes.
create or replace function public.check_product_lots_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_old boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_old := coalesce(old.manages_lots, false);
  end if;

  if coalesce(new.manages_lots, false)
     and not v_old
     and not coalesce((select manages_lots from public.stores where id = new.store_id), false) then
    raise exception 'Activa primero el manejo de lotes del negocio en Configuración.';
  end if;

  -- Al activar lotes en el producto, desactiva lotes viejos que no
  -- cuadren (por ejemplo, de antes de apagar y volver a encender).
  if coalesce(new.manages_lots, false) and not v_old and tg_op = 'UPDATE' then
    update public.product_lots
    set is_active = false, updated_at = now()
    where product_id = new.id
      and is_active
      and coalesce(quantity, 0) > 0
      and (select coalesce(sum(quantity), 0) from public.product_lots
           where product_id = new.id and is_active) > coalesce(new.stock, 0);
  end if;

  if not coalesce(new.manages_lots, false)
     and v_old
     and exists (
       select 1 from public.product_lots
       where product_id = new.id and is_active and quantity > 0
     ) then
    raise exception
      'El producto % tiene lotes con unidades. Desactiva o vacía sus lotes antes de quitar el manejo de lotes.',
      new.name;
  end if;

  return new;
end;
$function$;

drop trigger if exists check_product_lots_flag_trigger on public.products;

create trigger check_product_lots_flag_trigger
before insert or update of manages_lots on public.products
for each row
execute function public.check_product_lots_flag();

revoke execute on function public.check_stock_covers_lots() from public, anon, authenticated;
revoke execute on function public.check_lots_within_stock() from public, anon, authenticated;
revoke execute on function public.check_product_lots_flag() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Configuración del negocio (solo owner)
-- ---------------------------------------------------------------------

create or replace function public.set_store_manages_lots(
  p_store_id uuid,
  p_enabled boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.assert_store_role(p_store_id, array['owner']);

  if p_enabled is null then
    raise exception 'Indica si el negocio maneja lotes.';
  end if;

  if not p_enabled and exists (
    select 1 from public.product_lots
    where store_id = p_store_id and is_active and quantity > 0
  ) then
    raise exception
      'Hay lotes con unidades. Desactiva o vacía esos lotes antes de apagar el manejo de lotes.';
  end if;

  update public.stores
  set manages_lots = p_enabled
  where id = p_store_id;

  -- Al apagarlo, ningún producto queda marcado con lotes.
  if not p_enabled then
    update public.products
    set manages_lots = false
    where store_id = p_store_id and manages_lots;
  end if;

  return json_build_object('ok', true, 'manages_lots', p_enabled);
end;
$function$;

revoke execute on function public.set_store_manages_lots(uuid, boolean) from public, anon;
grant execute on function public.set_store_manages_lots(uuid, boolean) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. Crear y editar lotes (manager+)
-- ---------------------------------------------------------------------

-- Crea un lote con unidades que hoy están "sin lote" (no cambia el
-- stock total).
create or replace function public.create_product_lot(
  p_store_id uuid,
  p_product_id uuid,
  p_lot_number text,
  p_expiration_date date,
  p_manufacturing_date date,
  p_quantity integer
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_stock integer;
  v_name text;
  v_lotted integer;
  v_lot_id uuid;
begin
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if nullif(trim(p_lot_number), '') is null then
    raise exception 'El número de lote es obligatorio.';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'La cantidad del lote no puede ser negativa.';
  end if;

  if p_manufacturing_date is not null
     and p_expiration_date is not null
     and p_manufacturing_date > p_expiration_date then
    raise exception 'La fecha de fabricación no puede ser posterior al vencimiento.';
  end if;

  select coalesce(stock, 0), name
  into v_stock, v_name
  from public.products
  where id = p_product_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Producto no encontrado.';
  end if;

  if not public._product_uses_lots(p_product_id) then
    raise exception 'El producto % no maneja lotes.', v_name;
  end if;

  if exists (
    select 1 from public.product_lots
    where product_id = p_product_id
      and is_active
      and lower(trim(lot_number)) = lower(trim(p_lot_number))
  ) then
    raise exception 'Ya existe el lote % para este producto: edita su cantidad.', trim(p_lot_number);
  end if;

  select coalesce(sum(quantity), 0)
  into v_lotted
  from public.product_lots
  where product_id = p_product_id and is_active;

  if v_lotted + p_quantity > v_stock then
    raise exception
      'Solo hay % unidades sin lote de %.',
      greatest(v_stock - v_lotted, 0), v_name;
  end if;

  insert into public.product_lots (
    store_id, product_id, lot_number, manufacturing_date,
    expiration_date, quantity, is_active
  )
  values (
    p_store_id, p_product_id, trim(p_lot_number), p_manufacturing_date,
    p_expiration_date, p_quantity, true
  )
  returning id into v_lot_id;

  if p_quantity > 0 then
    insert into public.lot_movements (store_id, product_id, lot_id, kind, delta)
    values (p_store_id, p_product_id, v_lot_id, 'alta', p_quantity);
  end if;

  return json_build_object('ok', true, 'lot_id', v_lot_id);
end;
$function$;

revoke execute on function public.create_product_lot(uuid, uuid, text, date, date, integer) from public, anon;
grant execute on function public.create_product_lot(uuid, uuid, text, date, date, integer) to authenticated, service_role;


-- Cambia la cantidad o el vencimiento de un lote, o lo desactiva. Bajar
-- la cantidad pasa unidades a "sin lote"; subirla toma unidades "sin
-- lote". Desactivar deja el lote en 0.
create or replace function public.update_product_lot(
  p_store_id uuid,
  p_lot_id uuid,
  p_quantity integer,
  p_expiration_date date,
  p_is_active boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_lot record;
  v_new_quantity integer;
begin
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  select product_id
  into v_lot
  from public.product_lots
  where id = p_lot_id and store_id = p_store_id;

  if not found then
    raise exception 'Lote no encontrado.';
  end if;

  -- Orden de bloqueo: producto y luego lote.
  perform 1 from public.products where id = v_lot.product_id for update;

  select *
  into v_lot
  from public.product_lots
  where id = p_lot_id
  for update;

  if coalesce(p_is_active, true) = false then
    v_new_quantity := 0;
  else
    v_new_quantity := coalesce(p_quantity, v_lot.quantity);
  end if;

  if v_new_quantity < 0 then
    raise exception 'La cantidad del lote no puede ser negativa.';
  end if;

  if coalesce(p_is_active, true) and not public._product_uses_lots(v_lot.product_id) then
    raise exception 'El producto no maneja lotes.';
  end if;

  update public.product_lots
  set
    quantity = v_new_quantity,
    expiration_date = coalesce(p_expiration_date, expiration_date),
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  where id = p_lot_id;

  if v_new_quantity <> coalesce(v_lot.quantity, 0) then
    insert into public.lot_movements (store_id, product_id, lot_id, kind, delta)
    values (p_store_id, v_lot.product_id, p_lot_id, 'ajuste',
            v_new_quantity - coalesce(v_lot.quantity, 0));
  end if;

  return json_build_object('ok', true, 'lot_id', p_lot_id, 'quantity', v_new_quantity);
end;
$function$;

revoke execute on function public.update_product_lot(uuid, uuid, integer, date, boolean) from public, anon;
grant execute on function public.update_product_lot(uuid, uuid, integer, date, boolean) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 7. Recepción de compras con lotes
-- ---------------------------------------------------------------------

-- Recibe la compra (receive_purchase_at_scope, sin cambios) y, en la
-- misma transacción, asigna lotes a los ítems que los traen.
-- p_lots: [{ "purchase_item_id": "...", "lot_number": "...",
--            "expiration_date": "AAAA-MM-DD" }]
create or replace function public.receive_purchase_with_lots(
  p_store_id uuid,
  p_purchase_id uuid,
  p_scope text,
  p_branch_id uuid default null,
  p_warehouse_id uuid default null,
  p_location_id uuid default null,
  p_lots jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result json;
  v_entry jsonb;
  v_item record;
  v_lot_number text;
  v_expiration date;
  v_lot record;
  v_lot_id uuid;
begin
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  v_result := public.receive_purchase_at_scope(
    p_store_id, p_purchase_id, p_scope,
    p_branch_id, p_warehouse_id, p_location_id
  );

  if p_lots is null or jsonb_typeof(p_lots) <> 'array' then
    return v_result;
  end if;

  if (select count(*) from jsonb_array_elements(p_lots) e
      where nullif(trim(e->>'lot_number'), '') is not null)
     <> (select count(distinct e->>'purchase_item_id') from jsonb_array_elements(p_lots) e
         where nullif(trim(e->>'lot_number'), '') is not null) then
    raise exception 'Cada producto de la compra puede tener un solo lote en la recepción.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_lots)
  loop
    v_lot_number := nullif(trim(v_entry->>'lot_number'), '');

    continue when v_lot_number is null;

    begin
      v_expiration := nullif(v_entry->>'expiration_date', '')::date;
    exception
      when others then
        raise exception 'Fecha de vencimiento inválida en el lote %.', v_lot_number;
    end;

    select pi.id, pi.product_id, pi.quantity, p.name
    into v_item
    from public.purchase_items pi
    join public.products p on p.id = pi.product_id
    where pi.id = nullif(v_entry->>'purchase_item_id', '')::uuid
      and pi.purchase_id = p_purchase_id;

    if not found then
      raise exception 'Un lote no corresponde a ningún producto de esta compra.';
    end if;

    if not public._product_uses_lots(v_item.product_id) then
      raise exception 'El producto % no maneja lotes.', v_item.name;
    end if;

    continue when coalesce(v_item.quantity, 0) <= 0;

    perform 1 from public.products where id = v_item.product_id for update;

    select id, expiration_date
    into v_lot
    from public.product_lots
    where product_id = v_item.product_id
      and is_active
      and lower(trim(lot_number)) = lower(v_lot_number)
    for update;

    if found then
      if v_expiration is not null
         and v_lot.expiration_date is not null
         and v_lot.expiration_date <> v_expiration then
        raise exception
          'El lote % de % ya existe con otro vencimiento (%).',
          v_lot_number, v_item.name, v_lot.expiration_date;
      end if;

      update public.product_lots
      set
        quantity = quantity + v_item.quantity,
        expiration_date = coalesce(expiration_date, v_expiration),
        updated_at = now()
      where id = v_lot.id;

      v_lot_id := v_lot.id;
    else
      insert into public.product_lots (
        store_id, product_id, lot_number, expiration_date, quantity, is_active
      )
      values (
        p_store_id, v_item.product_id, v_lot_number, v_expiration, v_item.quantity, true
      )
      returning id into v_lot_id;
    end if;

    insert into public.lot_movements (store_id, product_id, lot_id, kind, delta, purchase_id)
    values (p_store_id, v_item.product_id, v_lot_id, 'recepcion', v_item.quantity, p_purchase_id);
  end loop;

  return v_result;
end;
$function$;

revoke execute on function public.receive_purchase_with_lots(uuid, uuid, text, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.receive_purchase_with_lots(uuid, uuid, text, uuid, uuid, uuid, jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 8. Devoluciones: al lote de la venta y, si se elige, a una estantería
-- ---------------------------------------------------------------------

-- Ubica unidades en una sucursal/almacén/ubicación (sin cambiar el
-- total). Uso interno: valida que el destino sea de la tienda y esté
-- activo. Suma a la existencia si ya existe.
create or replace function public._place_in_location(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_existing uuid;
begin
  if p_branch_id is null and p_warehouse_id is null and p_location_id is null then
    return;
  end if;

  if p_branch_id is not null then
    if p_warehouse_id is not null or p_location_id is not null then
      raise exception 'El destino no es válido.';
    end if;

    if not exists (select 1 from public.branches
                   where id = p_branch_id and store_id = p_store_id and is_active) then
      raise exception 'La sucursal de destino no existe o está inactiva.';
    end if;
  else
    if p_warehouse_id is null then
      raise exception 'Una ubicación debe indicar también su almacén.';
    end if;

    if not exists (select 1 from public.warehouses
                   where id = p_warehouse_id and store_id = p_store_id and is_active) then
      raise exception 'El almacén de destino no existe o está inactivo.';
    end if;

    if p_location_id is not null and not exists (
      select 1 from public.locations
      where id = p_location_id and store_id = p_store_id
        and warehouse_id = p_warehouse_id and is_active
    ) then
      raise exception 'La ubicación de destino no existe o está inactiva.';
    end if;
  end if;

  select id
  into v_existing
  from public.inventory_stock
  where store_id = p_store_id
    and product_id = p_product_id
    and branch_id is not distinct from p_branch_id
    and warehouse_id is not distinct from p_warehouse_id
    and location_id is not distinct from p_location_id
  for update;

  if v_existing is not null then
    update public.inventory_stock
    set quantity = coalesce(quantity, 0) + p_quantity, updated_at = now()
    where id = v_existing;
  else
    insert into public.inventory_stock (
      store_id, branch_id, warehouse_id, location_id, product_id, quantity
    )
    values (
      p_store_id, p_branch_id, p_warehouse_id, p_location_id, p_product_id, p_quantity
    );
  end if;
end;
$function$;

revoke execute on function public._place_in_location(uuid, uuid, integer, uuid, uuid, uuid) from public, anon, authenticated;


create or replace function public.register_return(
  p_store_id uuid,
  p_sale_id uuid,
  p_sale_item_id uuid,
  p_quantity integer,
  p_reason text default null,
  p_branch_id uuid default null,
  p_warehouse_id uuid default null,
  p_location_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result json;
  v_product_id uuid;
  v_store uuid;
  v_remaining integer := p_quantity;
  v_lot record;
  v_take integer;
  v_lots jsonb := '[]'::jsonb;
begin
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager', 'employee']);

  -- Registra la devolución (stock +, movimiento, detalle). Bloquea el
  -- producto.
  v_result := public.register_customer_return(
    p_store_id, p_sale_id, p_sale_item_id, p_quantity, p_reason
  );

  v_product_id := (v_result->>'product_id')::uuid;
  v_store := p_store_id;

  -- Al lote de la venta: primero los lotes vigentes (el que vence más
  -- tarde primero), luego los vencidos. Solo hasta lo que salió de cada
  -- lote en esta venta menos lo ya devuelto. Lo que salió "sin lote"
  -- vuelve "sin lote".
  for v_lot in
    select
      l.id,
      l.lot_number,
      l.expiration_date,
      public._product_uses_lots(l.product_id) as uses_lots,
      -sum(m.delta) filter (where m.kind = 'venta')
        - coalesce(sum(m.delta) filter (where m.kind = 'devolucion'), 0) as pending
    from public.lot_movements m
    join public.product_lots l on l.id = m.lot_id
    where m.sale_item_id = p_sale_item_id
      and l.is_active
    group by l.id, l.product_id, l.lot_number, l.expiration_date
    order by
      (l.expiration_date is not null and l.expiration_date < public._today_bogota()),
      l.expiration_date desc nulls first
  loop
    exit when v_remaining <= 0;
    -- Si el producto ya no usa lotes, lo devuelto queda "sin lote".
    exit when not v_lot.uses_lots;
    continue when coalesce(v_lot.pending, 0) <= 0;

    v_take := least(v_lot.pending, v_remaining);

    update public.product_lots
    set quantity = quantity + v_take, updated_at = now()
    where id = v_lot.id;

    insert into public.lot_movements (store_id, product_id, lot_id, kind, delta, sale_item_id)
    values (v_store, v_product_id, v_lot.id, 'devolucion', v_take, p_sale_item_id);

    v_lots := v_lots || jsonb_build_object('lot_number', v_lot.lot_number, 'quantity', v_take);
    v_remaining := v_remaining - v_take;
  end loop;

  -- A la estantería elegida (opcional).
  perform public._place_in_location(
    p_store_id, v_product_id, p_quantity,
    p_branch_id, p_warehouse_id, p_location_id
  );

  return (v_result::jsonb || jsonb_build_object('lots', v_lots))::json;
end;
$function$;

revoke execute on function public.register_return(uuid, uuid, uuid, integer, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.register_return(uuid, uuid, uuid, integer, text, uuid, uuid, uuid) to authenticated, service_role;

-- Nota de despliegue: la app vieja (en producción hasta el merge) sigue
-- llamando register_customer_return, así que NO se revoca aquí. Después
-- del merge se corre 20261004130000_lotes_cierre.sql.


-- ---------------------------------------------------------------------
-- 9. Ventas y salidas descuentan de los lotes (FEFO)
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

  v_sale_item_id uuid;
  v_lots jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_expired integer;

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
    )
    returning id into v_sale_item_id;


    -- Tanda 5: lotes (FEFO). Solo si el negocio y el producto manejan
    -- lotes; antes de bajar products.stock.
    v_lots := public._consume_lots(
      v_product_id, v_quantity, v_stock, 'venta', v_sale_item_id
    );

    select coalesce(sum((l->>'quantity')::integer), 0)
    into v_expired
    from jsonb_array_elements(v_lots) l
    where (l->>'expired')::boolean;

    if v_expired > 0 then
      v_warnings := v_warnings || to_jsonb(format(
        'Se vendieron %s unidades vencidas de %s.',
        v_expired, v_product_name
      ));
    end if;


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
    'total', v_subtotal,
    'warnings', v_warnings
  );

end;

$function$;

CREATE OR REPLACE FUNCTION public._apply_inventory_movement(p_product_id uuid, p_movement_type text, p_quantity integer, p_reason text, p_store_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare
  v_current_stock integer;
  v_new_stock integer;
  v_movement_id uuid;
  v_product_store_id uuid;

begin

  if p_product_id is null then
    raise exception 'El producto es obligatorio';
  end if;

  if p_store_id is null then
    raise exception 'La tienda es obligatoria';
  end if;

  if p_movement_type not in (
    'entrada',
    'salida',
    'ajuste'
  ) then
    raise exception 'Tipo de movimiento no válido';
  end if;

  if p_quantity is null then
    raise exception 'La cantidad es obligatoria';
  end if;

  if p_movement_type = 'ajuste' then

    if p_quantity < 0 then
      raise exception 'El nuevo stock no puede ser negativo';
    end if;

  else

    if p_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor que 0';
    end if;

  end if;

  select
    store_id,
    coalesce(stock, 0)
  into
    v_product_store_id,
    v_current_stock
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if v_product_store_id is distinct from p_store_id then
    raise exception 'El producto no pertenece a la tienda indicada';
  end if;

  if p_movement_type = 'entrada' then

    v_new_stock := v_current_stock + p_quantity;

  elsif p_movement_type = 'salida' then

    if v_current_stock < p_quantity then
      raise exception 'Stock insuficiente';
    end if;

    v_new_stock := v_current_stock - p_quantity;

    -- Tanda 5: lotes (FEFO), antes de bajar products.stock.
    perform public._consume_lots(
      p_product_id, p_quantity, v_current_stock, 'salida', null
    );

  else

    v_new_stock := p_quantity;

  end if;

  update public.products
  set
    stock = v_new_stock,
    updated_at = now()
  where id = p_product_id
    and store_id = p_store_id;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    reason,
    stock_before,
    stock_after
  )
  values (
    p_product_id,
    p_movement_type,
    p_quantity,
    p_reason,
    v_current_stock,
    v_new_stock
  )
  returning id
  into v_movement_id;

  return json_build_object(
    'ok', true,
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'movement_type', p_movement_type,
    'quantity', p_quantity,
    'stock_before', v_current_stock,
    'stock_after', v_new_stock
  );

end;

$function$;

revoke execute on function public._apply_inventory_movement(uuid, text, integer, text, uuid) from public, anon, authenticated;
