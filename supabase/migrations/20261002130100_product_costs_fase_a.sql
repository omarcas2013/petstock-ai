-- =====================================================================
-- Migración tanda 3, A1.2 — fase A: tabla product_costs
--
-- Primera de dos fases. Esta SOLO agrega la tabla nueva, sus políticas,
-- el backfill y un trigger de sincronización. NO toca
-- products.purchase_price todavía: products sigue teniendo esa
-- columna, y el código actual (que todavía la lee y la escribe) sigue
-- funcionando sin cambios hasta que se despliegue la Parte B.
--
-- La fase B (archivo product_costs_fase_b, aparte) se corre DESPUÉS
-- del merge del código, cuando ninguna ruta de Next.js lea ni escriba
-- products.purchase_price. Ver el orden de despliegue en la entrega.
--
-- CORRECCIÓN DE AUDITORÍA (probado en Postgres 16 real):
-- 1. Las políticas de INSERT/UPDATE originales solo comprobaban
--    store_id = tienda del usuario, sin verificar que ese store_id
--    coincidiera con la tienda real del producto. Un manager podía
--    insertar una fila de product_costs para un product_id ajeno,
--    usando su propio store_id, y esa fila (product_id es la PK)
--    bloqueaba para siempre a la tienda dueña del producto. Se agrega
--    la comprobación cruzada contra products.
-- 2. Faltaba "default auth.uid()" en updated_by (quedaba siempre null
--    salvo que el código lo pasara explícitamente).
-- 3. Mientras el código viejo siga desplegado (escribe
--    products.purchase_price, no product_costs), un trigger mantiene
--    product_costs sincronizada automáticamente. Sin esto, la fase B
--    tendría que volver a copiar desde products.purchase_price antes
--    de borrar la columna, y ese segundo backfill pisaría cualquier
--    costo que el código NUEVO ya hubiera escrito directo en
--    product_costs mientras tanto (reproducido: 1500 volvía a 1000).
-- =====================================================================

create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  store_id uuid not null,
  purchase_price numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);

alter table public.product_costs enable row level security;

drop policy if exists product_costs_select_manager_plus on public.product_costs;

create policy product_costs_select_manager_plus
  on public.product_costs
  for select to authenticated
  using (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
  );

drop policy if exists product_costs_insert_manager_plus on public.product_costs;

create policy product_costs_insert_manager_plus
  on public.product_costs
  for insert to authenticated
  with check (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
    and exists (
      select 1
      from public.products p
      where p.id = product_costs.product_id
        and p.store_id = product_costs.store_id
    )
  );

drop policy if exists product_costs_update_manager_plus on public.product_costs;

create policy product_costs_update_manager_plus
  on public.product_costs
  for update to authenticated
  using (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
  )
  with check (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
    and exists (
      select 1
      from public.products p
      where p.id = product_costs.product_id
        and p.store_id = product_costs.store_id
    )
  );

drop policy if exists product_costs_delete_admin_plus on public.product_costs;

create policy product_costs_delete_admin_plus
  on public.product_costs
  for delete to authenticated
  using (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin'])
  );

-- ---------------------------------------------------------------------
-- Backfill desde products.purchase_price.
--
-- Re-ejecutable: si se corre más de una vez, actualiza en vez de
-- fallar por el primary key.
-- ---------------------------------------------------------------------

insert into public.product_costs (product_id, store_id, purchase_price, updated_at)
select
  p.id,
  p.store_id,
  coalesce(p.purchase_price, 0),
  now()
from public.products p
on conflict (product_id) do update
  set
    purchase_price = excluded.purchase_price,
    updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------
-- Trigger de sincronización (temporal, mientras el código viejo siga
-- escribiendo products.purchase_price).
--
-- SECURITY DEFINER y sin execute para ningún rol de cliente: un
-- trigger no necesita que quien dispara el INSERT/UPDATE sobre
-- products tenga permiso para ejecutar esta función directamente (el
-- motor la invoca igual), así que revocarlo no rompe nada y evita que
-- alguien la llame por su cuenta vía RPC.
-- ---------------------------------------------------------------------

create or replace function public.sync_product_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin

  insert into public.product_costs (
    product_id,
    store_id,
    purchase_price,
    updated_at,
    updated_by
  )
  values (
    NEW.id,
    NEW.store_id,
    coalesce(NEW.purchase_price, 0),
    now(),
    auth.uid()
  )
  on conflict (product_id) do update
    set
      purchase_price = excluded.purchase_price,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return NEW;

end;
$function$;

revoke execute on function public.sync_product_costs() from public, anon, authenticated;

drop trigger if exists sync_product_costs_trigger on public.products;

create trigger sync_product_costs_trigger
  after insert or update of purchase_price on public.products
  for each row
  execute function public.sync_product_costs();
