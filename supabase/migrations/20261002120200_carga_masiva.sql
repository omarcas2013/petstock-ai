-- =====================================================================
-- Migración 4: carga masiva
--
-- Hoy register_bulk_inventory falla siempre: inserta store_id en
-- inventory_movements y esa columna no existe. Se quita store_id del
-- insert y se guardan stock_before y stock_after, como en el resto de
-- funciones. El resto del código es el actual de funciones.csv.
-- La autorización se agrega en la migración 2.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.register_bulk_inventory(p_store_id uuid, p_items jsonb, p_movement_type text DEFAULT 'entrada'::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_reason text;

  v_stock_before integer;
  v_stock_after integer;

  v_product_name text;
  v_sku text;
  v_barcode text;

  v_count integer := 0;
  v_total_quantity integer := 0;

  v_result jsonb := '[]'::jsonb;
begin

  /*
   * ============================================================
   * VALIDACIONES GENERALES
   * ============================================================
   */

  if p_store_id is null then
    raise exception 'La tienda es obligatoria.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then

    raise exception 'No se recibieron productos para procesar.';
  end if;

  if p_movement_type not in ('entrada', 'ajuste') then
    raise exception 'Tipo de movimiento no válido.';
  end if;


  /*
   * ============================================================
   * VALIDAR TODOS LOS PRODUCTOS ANTES DE MODIFICAR INVENTARIO
   * ============================================================
   *
   * Esta fase es deliberadamente previa a cualquier UPDATE.
   *
   * Si un producto no existe, tiene una cantidad inválida
   * o pertenece a otra tienda, la función falla completa.
   *
   * PostgreSQL hará rollback automáticamente.
   */

  for item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_product_id :=
      nullif(item->>'product_id', '')::uuid;

    v_quantity :=
      nullif(item->>'quantity', '')::integer;

    if v_product_id is null then
      raise exception 'Uno de los registros no tiene product_id.';
    end if;

    if v_quantity is null then
      raise exception
        'El producto % no tiene una cantidad válida.',
        v_product_id;
    end if;

    if v_quantity < 0 then
      raise exception
        'La cantidad no puede ser negativa.';
    end if;

    if p_movement_type = 'entrada'
       and v_quantity = 0 then

      raise exception
        'La cantidad debe ser mayor que 0.';
    end if;


    /*
     * Verificar que el producto pertenece
     * a la tienda indicada.
     */

    select
      p.name,
      p.sku,
      p.barcode,
      p.stock
    into
      v_product_name,
      v_sku,
      v_barcode,
      v_stock_before
    from public.products p
    where p.id = v_product_id
      and p.store_id = p_store_id
    for update;

    if not found then
      raise exception
        'El producto % no existe o no pertenece a esta tienda.',
        v_product_id;
    end if;


    /*
     * Validación adicional para entradas.
     */

    if p_movement_type = 'entrada' then

      v_stock_after :=
        v_stock_before + v_quantity;

    end if;


    /*
     * En un ajuste, quantity representa
     * EL STOCK FINAL.
     */

    if p_movement_type = 'ajuste' then

      v_stock_after :=
        v_quantity;

    end if;


    /*
     * Evitar inconsistencias.
     */

    if v_stock_after < 0 then
      raise exception
        'El stock resultante no puede ser negativo para %.',
        v_product_name;
    end if;

  end loop;


  /*
   * ============================================================
   * APLICAR LOS CAMBIOS
   * ============================================================
   */

  for item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_product_id :=
      nullif(item->>'product_id', '')::uuid;

    v_quantity :=
      nullif(item->>'quantity', '')::integer;

    v_reason :=
      nullif(
        coalesce(
          item->>'reason',
          p_reason
        ),
        ''
      );


    /*
     * Obtener stock actual y bloquear la fila.
     */

    select
      p.name,
      p.sku,
      p.barcode,
      p.stock
    into
      v_product_name,
      v_sku,
      v_barcode,
      v_stock_before
    from public.products p
    where p.id = v_product_id
      and p.store_id = p_store_id
    for update;


    /*
     * Calcular nuevo stock.
     */

    if p_movement_type = 'entrada' then

      v_stock_after :=
        v_stock_before + v_quantity;

    elsif p_movement_type = 'ajuste' then

      v_stock_after :=
        v_quantity;

    end if;


    /*
     * Actualizar producto.
     */

    update public.products
    set stock = v_stock_after
    where id = v_product_id
      and store_id = p_store_id;


    /*
     * Registrar movimiento.
     *
     * Para una entrada:
     *
     * quantity = unidades ingresadas
     *
     * Para un ajuste:
     *
     * quantity = nuevo stock establecido
     *
     */

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
      p_movement_type,
      v_quantity,
      coalesce(
        v_reason,
        case
          when p_movement_type = 'entrada'
            then 'Carga masiva de inventario'
          when p_movement_type = 'ajuste'
            then 'Ajuste masivo de inventario'
          else 'Movimiento de inventario'
        end
      ),
      v_stock_before,
      v_stock_after
    );


    /*
     * Construir respuesta para Next.js.
     */

    v_result :=
      v_result ||
      jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product_id,
          'product_name', v_product_name,
          'sku', v_sku,
          'barcode', v_barcode,
          'stock_before', v_stock_before,
          'quantity', v_quantity,
          'stock_after', v_stock_after
        )
      );


    v_count :=
      v_count + 1;

    v_total_quantity :=
      v_total_quantity + v_quantity;

  end loop;


  /*
   * ============================================================
   * RESPUESTA
   * ============================================================
   */

  return jsonb_build_object(
    'ok', true,
    'processed', v_count,
    'total_quantity', v_total_quantity,
    'items', v_result
  );

end;
$function$;
