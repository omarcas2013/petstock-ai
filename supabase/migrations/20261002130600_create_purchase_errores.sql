-- =====================================================================
-- Migración tanda 3, A6: create_purchase sin ocultar errores
--
-- El bloque "EXCEPTION WHEN OTHERS" atrapaba CUALQUIER error interno
-- (una violación de restricción, una columna que no existe, lo que
-- sea) y lo reescribía como un RAISE EXCEPTION con el texto técnico de
-- SQLERRM. Desde la migración de autorización (tanda 2),
-- rpcErrorMessage() en el código Next.js muestra tal cual cualquier
-- error cuyo code sea "P0001" (el código por defecto de un RAISE
-- EXCEPTION) -- así que, sin querer, esa combinación le mostraba al
-- usuario el mensaje técnico completo de CUALQUIER fallo interno de
-- esta función, no solo los RAISE EXCEPTION de negocio que ella misma
-- escribe a propósito ("El proveedor no pertenece a esta tienda", etc).
--
-- Quitando el bloque, un RAISE EXCEPTION de negocio sigue
-- propagándose igual (sigue siendo P0001, rpcErrorMessage lo sigue
-- mostrando), pero un error interno real conserva su código real
-- (23505, 23503, 42xxx...) y rpcErrorMessage lo oculta detrás del
-- mensaje genérico, como con cualquier otra función.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_purchase(p_store_id uuid, p_supplier_id uuid, p_document_number text, p_purchase_date timestamp with time zone, p_notes text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_purchase_id uuid;
    v_subtotal numeric := 0;
    v_item jsonb;
    v_product_id uuid;
    v_quantity integer;
    v_unit_cost numeric;
    v_item_subtotal numeric;
BEGIN

    -- Autorización: sesión, tienda y rol.
    perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

    -- -----------------------------------------------------
    -- Validaciones generales
    -- -----------------------------------------------------

    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'La tienda es obligatoria';
    END IF;

    IF p_supplier_id IS NULL THEN
        RAISE EXCEPTION 'El proveedor es obligatorio';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos un producto';
    END IF;

    IF jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'La compra no puede tener más de 500 productos';
    END IF;


    -- -----------------------------------------------------
    -- Verificar proveedor
    -- -----------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM public.suppliers
        WHERE id = p_supplier_id
          AND store_id = p_store_id
    ) THEN
        RAISE EXCEPTION 'El proveedor no pertenece a esta tienda';
    END IF;


    -- -----------------------------------------------------
    -- Validar todos los productos ANTES de insertar
    -- -----------------------------------------------------

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP

        v_product_id :=
            NULLIF(v_item->>'product_id', '')::uuid;

        v_quantity :=
            (v_item->>'quantity')::integer;

        v_unit_cost :=
            (v_item->>'unit_cost')::numeric;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Producto inválido';
        END IF;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION
                'La cantidad debe ser mayor que cero';
        END IF;

        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
            RAISE EXCEPTION
                'El costo unitario no puede ser negativo';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.products
            WHERE id = v_product_id
              AND store_id = p_store_id
        ) THEN
            RAISE EXCEPTION
                'El producto % no pertenece a esta tienda',
                v_product_id;
        END IF;

    END LOOP;


    -- -----------------------------------------------------
    -- Calcular subtotal
    -- -----------------------------------------------------

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP

        v_quantity :=
            (v_item->>'quantity')::integer;

        v_unit_cost :=
            (v_item->>'unit_cost')::numeric;

        v_item_subtotal :=
            v_quantity * v_unit_cost;

        v_subtotal :=
            v_subtotal + v_item_subtotal;

    END LOOP;


    -- -----------------------------------------------------
    -- Crear cabecera de compra
    -- -----------------------------------------------------

    INSERT INTO public.purchases (
        store_id,
        supplier_id,
        document_number,
        purchase_date,
        status,
        notes,
        subtotal,
        total
    )
    VALUES (
        p_store_id,
        p_supplier_id,
        NULLIF(trim(p_document_number), ''),
        COALESCE(p_purchase_date, now()),
        'pendiente',
        NULLIF(trim(p_notes), ''),
        v_subtotal,
        v_subtotal
    )
    RETURNING id INTO v_purchase_id;


    -- -----------------------------------------------------
    -- Crear productos de la compra
    -- -----------------------------------------------------

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP

        v_product_id :=
            NULLIF(v_item->>'product_id', '')::uuid;

        v_quantity :=
            (v_item->>'quantity')::integer;

        v_unit_cost :=
            (v_item->>'unit_cost')::numeric;

        v_item_subtotal :=
            v_quantity * v_unit_cost;

        INSERT INTO public.purchase_items (
            purchase_id,
            product_id,
            quantity,
            unit_cost,
            subtotal
        )
        VALUES (
            v_purchase_id,
            v_product_id,
            v_quantity,
            v_unit_cost,
            v_item_subtotal
        );

    END LOOP;


    -- -----------------------------------------------------
    -- Resultado
    -- -----------------------------------------------------

    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'subtotal', v_subtotal,
        'total', v_subtotal,
        'status', 'pendiente'
    );

END;
$function$;
