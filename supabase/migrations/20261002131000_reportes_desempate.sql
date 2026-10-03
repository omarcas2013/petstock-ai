-- =====================================================================
-- Migración tanda 3 (corrección de auditoría de Partes B/C): desempate
-- en top_products de report_sales_summary.
--
-- "order by top_products.quantity desc" en el jsonb_agg no desempata
-- cuando dos productos vendieron la misma cantidad: el orden entre
-- ellos quedaba a discreción del planner (no garantizado, podía
-- cambiar entre llamadas). Se agrega un desempate determinístico:
-- primero por ingreso (revenue) descendente y, si también coincide,
-- por product_id, para que el orden sea siempre el mismo con los
-- mismos datos.
--
-- CORRECCIÓN DE AUDITORÍA (reproducido: 13 productos con la misma
-- cantidad y uno con más ingreso quedaba fuera del top 10): el
-- desempate también tenía que estar en el "order by" del CTE
-- top_products, no solo en el jsonb_agg — ese "order by" es el que
-- decide qué 10 filas sobreviven al "limit 10" antes de llegar al
-- jsonb_agg; ordenarlo solo por quantity dejaba el corte de empates
-- a discreción del planner.
--
-- Mismo signature (uuid, date, date): CREATE OR REPLACE reemplaza la
-- función en el lugar, sin crear una versión adicional ni requerir
-- DROP FUNCTION antes.
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
    order by quantity desc, revenue desc, p.id
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
            order by
              top_products.quantity desc,
              top_products.revenue desc,
              top_products.product_id
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
