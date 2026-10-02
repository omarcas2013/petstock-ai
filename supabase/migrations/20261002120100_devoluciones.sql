-- =====================================================================
-- Migración 3: devoluciones
--
-- Hoy register_customer_return falla siempre:
--   1. inserta unit_price y subtotal en customer_return_items, columnas
--      que no existen;
--   2. usa el estado 'completada', que la regla
--      customer_returns_status_check no permite ('confirmada' o
--      'cancelada').
-- Esta migración agrega las columnas, rellena las filas existentes y
-- corrige el estado en el insert y en el cálculo de lo ya devuelto.
-- =====================================================================

alter table public.customer_return_items
  add column if not exists unit_price numeric,
  add column if not exists subtotal numeric;

-- Backfill desde la línea de venta original.
update public.customer_return_items cri
set
  unit_price = si.unit_price,
  subtotal = cri.quantity * si.unit_price
from public.sale_items si
where si.id = cri.sale_item_id
  and (cri.unit_price is null or cri.subtotal is null);

-- Código actual de funciones.csv; solo cambia 'completada' -> 'confirmada'
-- (2 lugares). La autorización se agrega en la migración 2.
CREATE OR REPLACE FUNCTION public.register_customer_return(p_store_id uuid, p_sale_id uuid, p_sale_item_id uuid, p_quantity integer, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale_item record;
  v_sale record;
  v_product record;

  v_already_returned integer := 0;
  v_available_to_return integer := 0;

  v_stock_before integer;
  v_stock_after integer;

  v_return_id uuid;
  v_return_item_id uuid;
  v_movement_id uuid;
begin

  -- ==========================================================
  -- VALIDACIONES
  -- ==========================================================

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de devolución debe ser mayor que cero.';
  end if;


  -- ==========================================================
  -- BUSCAR LA VENTA
  -- ==========================================================

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;


  -- ==========================================================
  -- BUSCAR EL PRODUCTO VENDIDO
  -- ==========================================================

  select
    si.*,
    p.name as product_name,
    p.sku as product_sku
  into v_sale_item
  from public.sale_items si
  join public.products p
    on p.id = si.product_id
  where si.id = p_sale_item_id
    and si.sale_id = p_sale_id
    and p.store_id = p_store_id;

  if not found then
    raise exception 'El producto no pertenece a la venta seleccionada.';
  end if;


  -- ==========================================================
  -- BLOQUEAR PRODUCTO PARA EVITAR CONCURRENCIA
  -- ==========================================================

  select *
  into v_product
  from public.products
  where id = v_sale_item.product_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Producto no encontrado.';
  end if;


  -- ==========================================================
  -- CALCULAR CUÁNTO YA SE HA DEVUELTO
  -- ==========================================================

  select coalesce(sum(cri.quantity), 0)
  into v_already_returned
  from public.customer_return_items cri
  join public.customer_returns cr
    on cr.id = cri.return_id
  where cri.sale_item_id = p_sale_item_id
    and cr.status = 'confirmada';


  -- ==========================================================
  -- CANTIDAD DISPONIBLE PARA DEVOLVER
  -- ==========================================================

  v_available_to_return :=
    v_sale_item.quantity - v_already_returned;


  if p_quantity > v_available_to_return then
    raise exception
      'No puedes devolver % unidades. Solo quedan % unidades disponibles para devolver.',
      p_quantity,
      v_available_to_return;
  end if;


  -- ==========================================================
  -- STOCK ACTUAL
  -- ==========================================================

  v_stock_before := coalesce(v_product.stock, 0);

  v_stock_after := v_stock_before + p_quantity;


  -- ==========================================================
  -- CREAR CABECERA DE DEVOLUCIÓN
  -- ==========================================================

  insert into public.customer_returns (
    store_id,
    sale_id,
    customer_name,
    reason,
    status
  )
  values (
    p_store_id,
    p_sale_id,
    v_sale.customer_name,
    p_reason,
    'confirmada'
  )
  returning id into v_return_id;


  -- ==========================================================
  -- CREAR DETALLE DE DEVOLUCIÓN
  -- ==========================================================

  insert into public.customer_return_items (
    return_id,
    sale_item_id,
    product_id,
    quantity,
    unit_price,
    subtotal
  )
  values (
    v_return_id,
    p_sale_item_id,
    v_sale_item.product_id,
    p_quantity,
    v_sale_item.unit_price,
    p_quantity * v_sale_item.unit_price
  )
  returning id into v_return_item_id;


  -- ==========================================================
  -- ACTUALIZAR STOCK
  -- ==========================================================

  update public.products
  set
    stock = v_stock_after,
    updated_at = now()
  where id = v_product.id;


  -- ==========================================================
  -- REGISTRAR MOVIMIENTO DE INVENTARIO
  -- ==========================================================

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    reason,
    stock_before,
    stock_after
  )
  values (
    v_product.id,
    'entrada',
    p_quantity,
    'Devolución de cliente - Venta ' || p_sale_id,
    v_stock_before,
    v_stock_after
  )
  returning id into v_movement_id;


  -- ==========================================================
  -- RESPUESTA
  -- ==========================================================

  return json_build_object(
    'ok', true,
    'return_id', v_return_id,
    'return_item_id', v_return_item_id,
    'movement_id', v_movement_id,
    'product_id', v_product.id,
    'product_name', v_product.name,
    'quantity', p_quantity,
    'stock_before', v_stock_before,
    'stock_after', v_stock_after
  );

end;
$function$;
