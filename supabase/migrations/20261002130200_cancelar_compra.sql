-- =====================================================================
-- Migración tanda 3, A2: anular compras pendientes
-- =====================================================================

create or replace function public.cancel_purchase(
  p_store_id uuid,
  p_purchase_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_purchase public.purchases%rowtype;
  v_reason text;
  v_notes text;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_purchase_id is null then
    raise exception 'La compra es obligatoria.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'El motivo de la anulación es obligatorio.';
  end if;

  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if v_purchase.status = 'recibida' then
    raise exception 'No se puede anular una compra ya recibida.';
  end if;

  if v_purchase.status = 'cancelada' then
    raise exception 'La compra ya está cancelada.';
  end if;

  if v_purchase.status <> 'pendiente' then
    raise exception 'Solo se pueden anular compras pendientes.';
  end if;

  v_notes := trim(
    both E'\n' from
    coalesce(v_purchase.notes || E'\n', '') || 'Anulada: ' || v_reason
  );

  update public.purchases
  set
    status = 'cancelada',
    notes = v_notes
  where id = p_purchase_id
    and store_id = p_store_id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', p_purchase_id,
    'status', 'cancelada'
  );

end;
$function$;

revoke execute on function public.cancel_purchase(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_purchase(uuid, uuid, text) to authenticated, service_role;
