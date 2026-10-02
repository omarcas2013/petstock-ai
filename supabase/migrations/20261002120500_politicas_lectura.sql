-- Migración 6: políticas de lectura faltantes.
-- inventory_transfers y receipt_items tienen RLS activo pero ninguna política:
-- con la sesión del usuario, cualquier SELECT devuelve vacío.
-- Las escrituras siguen siendo solo vía funciones (SECURITY DEFINER).

drop policy if exists inventory_transfers_select_same_store on public.inventory_transfers;
create policy inventory_transfers_select_same_store
  on public.inventory_transfers
  for select to authenticated
  using (store_id = public.get_my_store_id());

drop policy if exists receipt_items_select_same_store on public.receipt_items;
create policy receipt_items_select_same_store
  on public.receipt_items
  for select to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.store_id = public.get_my_store_id()
    )
  );
