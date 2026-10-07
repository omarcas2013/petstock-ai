-- =====================================================================
-- Tanda 6: reporte de sugeridos de compra.
--
-- report_purchase_suggestions(p_store_id, p_days, p_coverage_days)
--
-- Por cada producto activo de la tienda calcula:
--
--   demanda neta   = unidades vendidas − unidades devueltas (confirmadas)
--                    en los últimos p_days días (hora Bogotá, hoy incluido)
--   demanda diaria = demanda neta / p_days
--   en riesgo      = unidades en lotes que vencen antes de terminar la
--                    cobertura y que, vendiendo con FEFO al ritmo de la
--                    demanda diaria, no alcanzan a salir antes de vencer
--                    (los lotes ya vencidos cuentan completos). Solo
--                    aplica si el negocio y el producto manejan lotes.
--   disponible     = stock − en riesgo
--   pendiente      = unidades en compras con estado 'pendiente'
--   objetivo       = demanda diaria × p_coverage_days + stock mínimo
--   sugerido       = techo(objetivo − disponible − pendiente), mínimo 0;
--                    si el producto tiene stock máximo (> 0), el sugerido
--                    no deja el inventario por encima de ese máximo.
--
-- Solo lectura. Roles: owner, admin, manager (los que ven costos y
-- crean compras).
-- =====================================================================

-- Unidades en lotes que no alcanzan a venderse antes de vencer.
-- Simula FEFO a ritmo constante p_daily desde hoy: los lotes que vencen
-- antes de p_horizon se venden en orden de vencimiento; cada uno solo
-- puede vender en el tiempo que queda hasta su vencimiento (incluido
-- ese día) después de lo ya vendido de los anteriores. Los vencidos
-- cuentan completos. Los lotes que vencen después del horizonte y las
-- unidades sin lote no están en riesgo dentro de la cobertura.
create or replace function public._lots_at_risk(
  p_product_id uuid,
  p_daily numeric,
  p_today date,
  p_horizon date
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_lot record;
  v_sold numeric := 0;   -- vendido hasta ahora de los lotes recorridos
  v_take numeric;
  v_risk numeric := 0;
begin
  for v_lot in
    select l.quantity, l.expiration_date
    from public.product_lots l
    where l.product_id = p_product_id
      and l.is_active
      and l.quantity > 0
      and l.expiration_date is not null
      and l.expiration_date < p_horizon
    order by l.expiration_date, l.id
  loop
    v_take := least(
      v_lot.quantity,
      greatest(
        coalesce(p_daily, 0) * greatest(v_lot.expiration_date - p_today + 1, 0)
          - v_sold,
        0
      )
    );

    v_sold := v_sold + v_take;
    v_risk := v_risk + (v_lot.quantity - v_take);
  end loop;

  return ceil(v_risk)::integer;
end;
$function$;

revoke execute on function public._lots_at_risk(uuid, numeric, date, date) from public, anon, authenticated;

create or replace function public.report_purchase_suggestions(
  p_store_id uuid,
  p_days integer,
  p_coverage_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_today date;
  v_desde date;
  v_start timestamptz;
  v_store_lots boolean;
  v_items jsonb;
begin

  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_days is null or p_days not in (30, 60, 90, 180) then
    raise exception 'El período de demanda debe ser 30, 60, 90 o 180 días.';
  end if;

  if p_coverage_days is null or p_coverage_days < 1 or p_coverage_days > 180 then
    raise exception 'La cobertura debe estar entre 1 y 180 días.';
  end if;

  v_today := public._today_bogota();
  v_desde := v_today - (p_days - 1);
  v_start := (v_desde::text || 'T00:00:00-05:00')::timestamptz;

  select coalesce(s.manages_lots, false)
    into v_store_lots
  from public.stores s
  where s.id = p_store_id;

  with prods as (
    select
      p.id,
      p.name,
      p.sku,
      p.brand,
      p.presentation,
      coalesce(p.stock, 0) as stock,
      coalesce(p.minimum_stock, 0) as minimum_stock,
      coalesce(p.maximum_stock, 0) as maximum_stock,
      p.supplier_id,
      (v_store_lots and coalesce(p.manages_lots, false)) as uses_lots
    from public.products p
    where p.store_id = p_store_id
      and coalesce(p.is_active, true)
  ),
  sold as (
    select si.product_id, sum(si.quantity) as qty
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.store_id = p_store_id
      and s.created_at >= v_start
    group by si.product_id
  ),
  returned as (
    select cri.product_id, sum(cri.quantity) as qty
    from public.customer_returns cr
    join public.customer_return_items cri on cri.return_id = cr.id
    where cr.store_id = p_store_id
      and cr.status = 'confirmada'
      and cr.returned_at >= v_start
    group by cri.product_id
  ),
  pending as (
    select pi.product_id, sum(pi.quantity) as qty
    from public.purchases pu
    join public.purchase_items pi on pi.purchase_id = pu.id
    where pu.store_id = p_store_id
      and pu.status = 'pendiente'
    group by pi.product_id
  ),
  demand as (
    select
      pr.*,
      greatest(coalesce(so.qty, 0) - coalesce(re.qty, 0), 0) as net_sold,
      coalesce(pe.qty, 0) as pending_qty
    from prods pr
    left join sold so on so.product_id = pr.id
    left join returned re on re.product_id = pr.id
    left join pending pe on pe.product_id = pr.id
  ),
  calc as (
    select
      d.*,
      round(d.net_sold::numeric / p_days, 4) as daily_demand,
      case
        when d.uses_lots then
          least(
            public._lots_at_risk(
              d.id,
              d.net_sold::numeric / p_days,
              v_today,
              v_today + p_coverage_days
            ),
            d.stock
          )
        else 0
      end::integer as at_risk
    from demand d
  ),
  sugg as (
    select
      c.*,
      greatest(c.stock - c.at_risk, 0) as available,
      ceil(
        c.daily_demand * p_coverage_days + c.minimum_stock
      )::integer as target
    from calc c
  ),
  final as (
    select
      s.*,
      greatest(
        case
          when s.maximum_stock > 0 then
            least(
              s.target - s.available - s.pending_qty,
              s.maximum_stock - s.available - s.pending_qty
            )
          else
            s.target - s.available - s.pending_qty
        end,
        0
      )::integer as suggested
    from sugg s
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', f.id,
        'name', f.name,
        'sku', f.sku,
        'brand', f.brand,
        'presentation', f.presentation,
        'supplier_id', f.supplier_id,
        'supplier_name', sup.name,
        'stock', f.stock,
        'at_risk', f.at_risk,
        'available', f.available,
        'pending', f.pending_qty,
        'minimum_stock', f.minimum_stock,
        'maximum_stock', f.maximum_stock,
        'net_sold', f.net_sold,
        'daily_demand', f.daily_demand,
        'days_of_stock',
          case when f.daily_demand > 0
            then floor(f.available / f.daily_demand)::integer
            else null end,
        'target', f.target,
        'suggested', f.suggested,
        'unit_cost', pc.purchase_price
      )
      order by sup.name nulls last, f.name, f.id
    ),
    '[]'::jsonb
  )
  into v_items
  from final f
  left join public.suppliers sup on sup.id = f.supplier_id
  left join public.product_costs pc on pc.product_id = f.id;

  return jsonb_build_object(
    'desde', v_desde,
    'hasta', v_today,
    'days', p_days,
    'coverage_days', p_coverage_days,
    'manages_lots', v_store_lots,
    'items', v_items
  );
end;
$function$;

revoke execute on function public.report_purchase_suggestions(uuid, integer, integer) from public, anon;
grant execute on function public.report_purchase_suggestions(uuid, integer, integer) to authenticated, service_role;
