-- =====================================================================
-- Migración tanda 3, A1.1: compras y recepciones solo para manager+
--
-- RLS filtra filas (por tienda), no columnas: hoy cualquier rol
-- autenticado de la tienda puede leer purchases, purchase_items,
-- receipts y receipt_items directo contra Supabase, incluido
-- purchase_items.unit_cost y los totales de purchases. La matriz de
-- roles no le da "compras y recepciones" a employee.
--
-- Se agrega la condición de rol a las políticas SELECT existentes.
-- Las políticas de escritura no cambian: ya solo se escribe vía
-- funciones (create_purchase, receive_purchase_at_scope), que no
-- tienen políticas de INSERT/UPDATE para el cliente.
-- =====================================================================

drop policy if exists purchases_select_same_store on public.purchases;

create policy purchases_select_same_store
  on public.purchases
  for select to authenticated
  using (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
  );

drop policy if exists purchase_items_select_same_store on public.purchase_items;

create policy purchase_items_select_same_store
  on public.purchase_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_items.purchase_id
        and p.store_id = public.get_my_store_id()
    )
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
  );

drop policy if exists receipts_select_store on public.receipts;

create policy receipts_select_store
  on public.receipts
  for select to authenticated
  using (
    store_id = public.get_my_store_id()
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
  );

-- receipt_items_select_same_store la creó la migración
-- 20261002120500_politicas_lectura (tanda 2); aquí se le agrega el rol.
drop policy if exists receipt_items_select_same_store on public.receipt_items;

create policy receipt_items_select_same_store
  on public.receipt_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.store_id = public.get_my_store_id()
    )
    and public.get_my_role() = any (array['owner', 'admin', 'manager'])
  );
