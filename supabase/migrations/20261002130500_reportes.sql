-- =====================================================================
-- Migración tanda 3, A5: funciones de reporte
--
-- Replican exactamente lo que hoy calculan app/reportes/ventas y
-- app/reportes/movimientos en el navegador (con todas las filas ya
-- traídas), para poder paginar esas pantallas en la Parte B sin perder
-- los totales ni las agrupaciones actuales:
--
-- - Ventas: total vendido (suma de sales.total), número de ventas,
--   unidades vendidas (suma de sale_items.quantity), ticket promedio,
--   ventas por método de pago (cantidad y total, "otro" si viene
--   vacío), top 10 productos por cantidad vendida (con su ingreso), y
--   las ventas del rango para la tabla de detalle.
-- - Movimientos: entradas y salidas (suma de quantity), variación por
--   ajustes (suma de stock_after - stock_before, solo cuando ambos no
--   son null: en un ajuste quantity es el stock final, no units
--   movidas), variación neta (entradas - salidas + ajustes), y los
--   movimientos del rango para la tabla de detalle.
--
-- Fechas: p_desde/p_hasta son DATE (America/Bogota), inclusive en
-- ambos extremos, igual que bogotaStartOfDay/bogotaEndOfDay en
-- lib/dates.ts (America/Bogota es UTC-5 todo el año, sin horario de
-- verano, así que el desfase fijo es exacto).
-- =====================================================================

create or replace function public.report_sales_summary(
  p_store_id uuid,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_desde is null or p_hasta is null then
    raise exception 'El rango de fechas es obligatorio.';
  end if;

  if p_desde > p_hasta then
    raise exception 'La fecha inicial no puede ser posterior a la final.';
  end if;

  v_start := (p_desde::text || 'T00:00:00-05:00')::timestamptz;
  v_end := (p_hasta::text || 'T23:59:59.999-05:00')::timestamptz;

  with filtered_sales as (
    select
      s.id,
      s.customer_name,
      s.payment_method,
      s.total,
      s.created_at
    from public.sales s
    where s.store_id = p_store_id
      and s.created_at >= v_start
      and s.created_at <= v_end
  ),
  sale_units as (
    select
      fs.id as sale_id,
      coalesce(sum(si.quantity), 0) as units
    from filtered_sales fs
    left join public.sale_items si on si.sale_id = fs.id
    group by fs.id
  ),
  totals as (
    select
      coalesce(sum(fs.total), 0) as total_revenue,
      count(*) as sale_count,
      coalesce(sum(su.units), 0) as total_units
    from filtered_sales fs
    left join sale_units su on su.sale_id = fs.id
  ),
  payment_summary as (
    select
      coalesce(nullif(fs.payment_method, ''), 'otro') as payment_method,
      count(*) as count,
      coalesce(sum(fs.total), 0) as total
    from filtered_sales fs
    group by 1
    order by 3 desc
  ),
  top_products as (
    select
      p.id as product_id,
      p.name,
      p.sku,
      sum(si.quantity) as quantity,
      sum(si.subtotal) as revenue
    from filtered_sales fs
    join public.sale_items si on si.sale_id = fs.id
    join public.products p on p.id = si.product_id
    group by p.id, p.name, p.sku
    order by quantity desc
    limit 10
  ),
  sale_rows as (
    select
      fs.id,
      fs.customer_name,
      fs.payment_method,
      fs.total,
      fs.created_at,
      coalesce(su.units, 0) as units
    from filtered_sales fs
    left join sale_units su on su.sale_id = fs.id
    order by fs.created_at desc
  )
  select jsonb_build_object(
    'total_revenue', (select total_revenue from totals),
    'sale_count', (select sale_count from totals),
    'total_units', (select total_units from totals),
    'average_ticket',
      case
        when (select sale_count from totals) = 0 then 0
        else (select total_revenue from totals) / (select sale_count from totals)
      end,
    'payment_summary',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(payment_summary)
            order by payment_summary.total desc
          )
          from payment_summary
        ),
        '[]'::jsonb
      ),
    'top_products',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(top_products)
            order by top_products.quantity desc
          )
          from top_products
        ),
        '[]'::jsonb
      ),
    'sales',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(sale_rows)
            order by sale_rows.created_at desc
          )
          from sale_rows
        ),
        '[]'::jsonb
      )
  )
  into v_result;

  return v_result;

end;
$function$;

revoke execute on function public.report_sales_summary(uuid, date, date) from public, anon;
grant execute on function public.report_sales_summary(uuid, date, date) to authenticated, service_role;


create or replace function public.report_movements_summary(
  p_store_id uuid,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_desde is null or p_hasta is null then
    raise exception 'El rango de fechas es obligatorio.';
  end if;

  if p_desde > p_hasta then
    raise exception 'La fecha inicial no puede ser posterior a la final.';
  end if;

  v_start := (p_desde::text || 'T00:00:00-05:00')::timestamptz;
  v_end := (p_hasta::text || 'T23:59:59.999-05:00')::timestamptz;

  -- inventory_movements no tiene store_id: se filtra por la tienda
  -- del producto, igual que GET /api/inventory/movements.
  with filtered as (
    select
      im.id,
      im.product_id,
      im.movement_type,
      im.quantity,
      im.reason,
      im.stock_before,
      im.stock_after,
      im.created_at,
      p.name as product_name,
      p.sku as product_sku
    from public.inventory_movements im
    join public.products p on p.id = im.product_id
    where p.store_id = p_store_id
      and im.created_at >= v_start
      and im.created_at <= v_end
  ),
  totals as (
    select
      coalesce(
        sum(quantity) filter (where lower(movement_type) = 'entrada'),
        0
      ) as total_entries,
      coalesce(
        sum(quantity) filter (where lower(movement_type) = 'salida'),
        0
      ) as total_exits,
      coalesce(
        sum(stock_after - stock_before)
          filter (
            where lower(movement_type) = 'ajuste'
              and stock_before is not null
              and stock_after is not null
          ),
        0
      ) as total_adjustment_variance,
      count(*) as movement_count
    from filtered
  ),
  movement_rows as (
    select *
    from filtered
    order by created_at desc
  )
  select jsonb_build_object(
    'total_entries', (select total_entries from totals),
    'total_exits', (select total_exits from totals),
    'total_adjustment_variance', (select total_adjustment_variance from totals),
    'net_change',
      (select total_entries from totals)
      - (select total_exits from totals)
      + (select total_adjustment_variance from totals),
    'movement_count', (select movement_count from totals),
    'movements',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(movement_rows)
            order by movement_rows.created_at desc
          )
          from movement_rows
        ),
        '[]'::jsonb
      )
  )
  into v_result;

  return v_result;

end;
$function$;

revoke execute on function public.report_movements_summary(uuid, date, date) from public, anon;
grant execute on function public.report_movements_summary(uuid, date, date) to authenticated, service_role;
