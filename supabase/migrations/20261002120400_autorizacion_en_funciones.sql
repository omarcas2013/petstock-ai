-- =====================================================================
-- Migración 2: autorización dentro de las funciones
--
-- DESPLEGAR AL FINAL (después de 1, 3, 4 y 5) y solo cuando el código
-- Next.js ya llame estas funciones con la sesión del usuario: con la
-- llave secreta auth.uid() es null y assert_store_role las rechaza.
--
-- Por eso el nombre del archivo tiene la hora más alta: si se aplicara
-- antes que la 3 o la 4, esas migraciones reemplazarían
-- register_customer_return y register_bulk_inventory SIN autorización.
-- Las versiones de aquí ya incluyen los cambios de la 3 y la 4.
--
-- Todo el código parte de funciones.csv; los cambios son solo los
-- marcados con "Autorización" y los descritos en cada sección.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 2.1 assert_store_role
-- ---------------------------------------------------------------------

create or replace function public.assert_store_role(
  p_store_id uuid,
  p_roles text[]
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_role text;
begin

  if v_user_id is null then
    raise exception 'Sesión requerida';
  end if;

  select store_id, role
  into v_store_id, v_role
  from public.profiles
  where id = v_user_id;

  if v_store_id is null
     or p_store_id is null
     or v_store_id is distinct from p_store_id then
    raise exception 'No perteneces a esta tienda';
  end if;

  if v_role is null
     or not (v_role = any (p_roles)) then
    raise exception 'No tienes permisos para esta acción';
  end if;

end;
$function$;

revoke execute on function public.assert_store_role(uuid, text[]) from public, anon;


-- ---------------------------------------------------------------------
-- 2.2 _apply_inventory_movement (interna)
--
-- Es el código actual de register_inventory_movement con otro nombre.
-- La usa receive_purchase_at_scope, que ya validó la autorización.
-- No se puede llamar desde la API (sin execute para anon/authenticated).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._apply_inventory_movement(p_product_id uuid, p_movement_type text, p_quantity integer, p_reason text, p_store_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare
  v_current_stock integer;
  v_new_stock integer;
  v_movement_id uuid;
  v_product_store_id uuid;

begin

  if p_product_id is null then
    raise exception 'El producto es obligatorio';
  end if;

  if p_store_id is null then
    raise exception 'La tienda es obligatoria';
  end if;

  if p_movement_type not in (
    'entrada',
    'salida',
    'ajuste'
  ) then
    raise exception 'Tipo de movimiento no válido';
  end if;

  if p_quantity is null then
    raise exception 'La cantidad es obligatoria';
  end if;

  if p_movement_type = 'ajuste' then

    if p_quantity < 0 then
      raise exception 'El nuevo stock no puede ser negativo';
    end if;

  else

    if p_quantity <= 0 then
      raise exception 'La cantidad debe ser mayor que 0';
    end if;

  end if;

  select
    store_id,
    coalesce(stock, 0)
  into
    v_product_store_id,
    v_current_stock
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if v_product_store_id is distinct from p_store_id then
    raise exception 'El producto no pertenece a la tienda indicada';
  end if;

  if p_movement_type = 'entrada' then

    v_new_stock := v_current_stock + p_quantity;

  elsif p_movement_type = 'salida' then

    if v_current_stock < p_quantity then
      raise exception 'Stock insuficiente';
    end if;

    v_new_stock := v_current_stock - p_quantity;

  else

    v_new_stock := p_quantity;

  end if;

  update public.products
  set
    stock = v_new_stock,
    updated_at = now()
  where id = p_product_id
    and store_id = p_store_id;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    reason,
    stock_before,
    stock_after
  )
  values (
    p_product_id,
    p_movement_type,
    p_quantity,
    p_reason,
    v_current_stock,
    v_new_stock
  )
  returning id
  into v_movement_id;

  return json_build_object(
    'ok', true,
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'movement_type', p_movement_type,
    'quantity', p_quantity,
    'stock_before', v_current_stock,
    'stock_after', v_new_stock
  );

end;

$function$;

revoke execute on function public._apply_inventory_movement(uuid, text, integer, text, uuid)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2.3 register_inventory_movement (pública, misma firma)
-- ---------------------------------------------------------------------

create or replace function public.register_inventory_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text,
  p_store_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  return public._apply_inventory_movement(
    p_product_id,
    p_movement_type,
    p_quantity,
    p_reason,
    p_store_id
  );

end;
$function$;


-- ---------------------------------------------------------------------
-- 2.4 register_sale: todos los roles + rechaza productos inactivos
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_sale(p_items jsonb, p_payment_method text, p_customer_name text, p_store_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare
  v_user_id uuid;
  v_user_store_id uuid;

  v_sale_id uuid;
  v_subtotal numeric := 0;

  v_item jsonb;

  v_product_id uuid;
  v_quantity integer;

  v_sale_price numeric;
  v_stock integer;
  v_new_stock integer;

  v_item_subtotal numeric;

  v_product_store_id uuid;

  v_product_name text;
  v_product_active boolean;

begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager', 'employee']);

  -- Usuario autenticado
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;


  -- Obtener tienda del usuario
  select store_id
  into v_user_store_id
  from public.profiles
  where id = v_user_id;

  if v_user_store_id is null then
    raise exception 'El usuario no tiene una tienda asignada';
  end if;


  -- Validar que la tienda solicitada sea la del usuario
  if p_store_id is null then
    raise exception 'La tienda es obligatoria';
  end if;

  if p_store_id is distinct from v_user_store_id then
    raise exception 'El usuario no pertenece a la tienda indicada';
  end if;


  -- Validar items
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then

    raise exception
      'La venta debe contener al menos un producto';

  end if;


  -- Validar método de pago
  if p_payment_method is null
     or trim(p_payment_method) = '' then

    raise exception
      'El método de pago es obligatorio';

  end if;


  -- Crear venta
  insert into public.sales (
    store_id,
    customer_name,
    payment_method,
    subtotal,
    total
  )
  values (
    v_user_store_id,
    nullif(trim(p_customer_name), ''),
    trim(p_payment_method),
    0,
    0
  )
  returning id into v_sale_id;


  -- Procesar productos
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop

    begin
      v_product_id :=
        (v_item->>'product_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'ID de producto inválido';
    end;


    if v_product_id is null then
      raise exception
        'Cada producto debe tener un product_id';
    end if;


    begin
      v_quantity :=
        (v_item->>'quantity')::integer;
    exception
      when invalid_text_representation then
        raise exception
          'La cantidad debe ser un número entero';
    end;


    if v_quantity is null
       or v_quantity <= 0 then

      raise exception
        'La cantidad debe ser mayor que 0';

    end if;


    -- Obtener producto y bloquearlo
    select
      sale_price,
      stock,
      store_id,
      name,
      is_active
    into
      v_sale_price,
      v_stock,
      v_product_store_id,
      v_product_name,
      v_product_active
    from public.products
    where id = v_product_id
    for update;


    if not found then
      raise exception
        'Producto no encontrado: %',
        v_product_id;
    end if;


    -- Validar tienda
    if v_product_store_id is distinct from v_user_store_id then
      raise exception
        'El producto no pertenece a la tienda actual';
    end if;


    -- Validar que el producto esté activo
    if v_product_active is false then
      raise exception
        'El producto % está inactivo',
        v_product_name;
    end if;


    -- Validar stock
    if v_stock < v_quantity then
      raise exception
        'Stock insuficiente para el producto %',
        v_product_id;
    end if;


    -- Calcular subtotal
    v_item_subtotal :=
      v_sale_price * v_quantity;

    v_subtotal :=
      v_subtotal + v_item_subtotal;


    -- Insertar detalle
    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_sale_price,
      v_item_subtotal
    );


    -- Calcular nuevo stock
    v_new_stock :=
      v_stock - v_quantity;


    -- Actualizar stock global
    update public.products
    set
      stock = v_new_stock,
      updated_at = now()
    where id = v_product_id
      and store_id = v_user_store_id;


    -- Registrar movimiento
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
      'salida',
      v_quantity,
      'Venta',
      v_stock,
      v_new_stock
    );

  end loop;


  -- Actualizar totales
  update public.sales
  set
    subtotal = v_subtotal,
    total = v_subtotal
  where id = v_sale_id
    and store_id = v_user_store_id;


  -- Respuesta
  return json_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'store_id', v_user_store_id,
    'subtotal', v_subtotal,
    'total', v_subtotal
  );

end;

$function$;


-- ---------------------------------------------------------------------
-- 2.5 register_customer_return: todos los roles
--     (incluye el cambio 'completada' -> 'confirmada' de la migración 3)
-- ---------------------------------------------------------------------

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

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager', 'employee']);

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


-- ---------------------------------------------------------------------
-- 2.6 create_purchase: owner/admin/manager
-- ---------------------------------------------------------------------

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

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '%', SQLERRM;
END;
$function$;


-- ---------------------------------------------------------------------
-- 2.7 receive_purchase_at_scope: owner/admin/manager
--     y usa _apply_inventory_movement en vez de la función pública
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.receive_purchase_at_scope(p_store_id uuid, p_purchase_id uuid, p_scope text, p_branch_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
  v_purchase public.purchases%rowtype;
  v_item record;
  v_movement json;

  v_received_items integer := 0;

  v_current_stock integer;
  v_inventory_stock_id uuid;

  v_branch_store_id uuid;
  v_branch_active boolean;

  v_warehouse_store_id uuid;
  v_warehouse_branch_id uuid;
  v_warehouse_active boolean;

  v_location_store_id uuid;
  v_location_warehouse_id uuid;
  v_location_active boolean;

  v_receipt_id uuid;

BEGIN

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  -- =========================================================
  -- VALIDACIONES GENERALES
  -- =========================================================

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'La tienda es obligatoria';
  END IF;

  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'La compra es obligatoria';
  END IF;

  IF p_scope IS NULL THEN
    RAISE EXCEPTION 'El nivel de inventario es obligatorio';
  END IF;

  IF p_scope NOT IN (
    'global',
    'branch',
    'warehouse',
    'location'
  ) THEN
    RAISE EXCEPTION
      'Nivel de inventario no válido: %',
      p_scope;
  END IF;


  -- =========================================================
  -- VALIDAR COMBINACIÓN DE IDs SEGÚN EL NIVEL
  -- =========================================================

  IF p_scope = 'global' THEN

    IF p_branch_id IS NOT NULL
       OR p_warehouse_id IS NOT NULL
       OR p_location_id IS NOT NULL THEN

      RAISE EXCEPTION
        'El inventario global no utiliza sucursal, almacén ni ubicación';

    END IF;

  ELSIF p_scope = 'branch' THEN

    IF p_branch_id IS NULL THEN
      RAISE EXCEPTION
        'La sucursal es obligatoria para una recepción por sucursal';
    END IF;

    IF p_warehouse_id IS NOT NULL
       OR p_location_id IS NOT NULL THEN

      RAISE EXCEPTION
        'Una recepción por sucursal no puede indicar almacén ni ubicación';

    END IF;

  ELSIF p_scope = 'warehouse' THEN

    IF p_warehouse_id IS NULL THEN
      RAISE EXCEPTION
        'El almacén es obligatorio para una recepción por almacén';
    END IF;

    IF p_branch_id IS NOT NULL
       OR p_location_id IS NOT NULL THEN

      RAISE EXCEPTION
        'Una recepción por almacén no puede indicar sucursal ni ubicación';

    END IF;

  ELSIF p_scope = 'location' THEN

    IF p_warehouse_id IS NULL
       OR p_location_id IS NULL THEN

      RAISE EXCEPTION
        'El almacén y la ubicación son obligatorios para una recepción por ubicación';

    END IF;

    IF p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Una recepción por ubicación no debe indicar branch_id directamente';
    END IF;

  END IF;


  -- =========================================================
  -- VALIDAR SUCURSAL
  -- =========================================================

  IF p_scope = 'branch' THEN

    SELECT
      store_id,
      is_active
    INTO
      v_branch_store_id,
      v_branch_active
    FROM public.branches
    WHERE id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sucursal no encontrada';
    END IF;

    IF v_branch_store_id IS DISTINCT FROM p_store_id THEN
      RAISE EXCEPTION
        'La sucursal no pertenece a la tienda indicada';
    END IF;

    IF NOT v_branch_active THEN
      RAISE EXCEPTION
        'La sucursal está inactiva';
    END IF;

  END IF;


  -- =========================================================
  -- VALIDAR ALMACÉN
  -- =========================================================

  IF p_scope IN ('warehouse', 'location') THEN

    SELECT
      store_id,
      branch_id,
      is_active
    INTO
      v_warehouse_store_id,
      v_warehouse_branch_id,
      v_warehouse_active
    FROM public.warehouses
    WHERE id = p_warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Almacén no encontrado';
    END IF;

    IF v_warehouse_store_id IS DISTINCT FROM p_store_id THEN
      RAISE EXCEPTION
        'El almacén no pertenece a la tienda indicada';
    END IF;

    IF NOT v_warehouse_active THEN
      RAISE EXCEPTION
        'El almacén está inactivo';
    END IF;

  END IF;


  -- =========================================================
  -- VALIDAR UBICACIÓN
  -- =========================================================

  IF p_scope = 'location' THEN

    SELECT
      store_id,
      warehouse_id,
      is_active
    INTO
      v_location_store_id,
      v_location_warehouse_id,
      v_location_active
    FROM public.locations
    WHERE id = p_location_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ubicación no encontrada';
    END IF;

    IF v_location_store_id IS DISTINCT FROM p_store_id THEN
      RAISE EXCEPTION
        'La ubicación no pertenece a la tienda indicada';
    END IF;

    IF v_location_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
      RAISE EXCEPTION
        'La ubicación no pertenece al almacén indicado';
    END IF;

    IF NOT v_location_active THEN
      RAISE EXCEPTION
        'La ubicación está inactiva';
    END IF;

  END IF;


  -- =========================================================
  -- BLOQUEAR COMPRA
  -- =========================================================

  SELECT *
  INTO v_purchase
  FROM public.purchases
  WHERE id = p_purchase_id
    AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Compra no encontrada o no pertenece a la tienda';
  END IF;


  -- =========================================================
  -- VALIDAR ESTADO
  -- =========================================================

  IF v_purchase.status = 'recibida' THEN
    RAISE EXCEPTION
      'La compra ya fue recibida';
  END IF;

  IF v_purchase.status = 'cancelada' THEN
    RAISE EXCEPTION
      'No se puede recibir una compra cancelada';
  END IF;

  IF v_purchase.status <> 'pendiente' THEN
    RAISE EXCEPTION
      'La compra no está pendiente de recepción';
  END IF;


  -- =========================================================
  -- VALIDAR PRODUCTOS
  -- =========================================================

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id
  ) THEN

    RAISE EXCEPTION
      'La compra no tiene productos';

  END IF;


  -- =========================================================
  -- RECIBIR CADA PRODUCTO
  -- =========================================================

  FOR v_item IN
    SELECT
      pi.product_id,
      pi.quantity
    FROM public.purchase_items pi
    WHERE pi.purchase_id = p_purchase_id
    ORDER BY pi.created_at, pi.id

  LOOP

    -- =======================================================
    -- 1. SIEMPRE ACTUALIZAR STOCK GLOBAL
    -- =======================================================

    v_movement := public._apply_inventory_movement(
      v_item.product_id,
      'entrada',
      v_item.quantity,
      'Recepción de compra ' || coalesce(
        v_purchase.document_number,
        p_purchase_id::text
      ),
      p_store_id
    );

    v_received_items :=
      v_received_items + 1;


    -- =======================================================
    -- 2. INVENTARIO GLOBAL
    -- =======================================================

    IF p_scope = 'global' THEN

      CONTINUE;

    END IF;


    -- =======================================================
    -- 3. INVENTARIO POR SUCURSAL
    -- =======================================================

    IF p_scope = 'branch' THEN

      SELECT
        id,
        quantity
      INTO
        v_inventory_stock_id,
        v_current_stock
      FROM public.inventory_stock
      WHERE store_id = p_store_id
        AND product_id = v_item.product_id
        AND branch_id = p_branch_id
        AND warehouse_id IS NULL
        AND location_id IS NULL
      FOR UPDATE;


      IF FOUND THEN

        UPDATE public.inventory_stock
        SET
          quantity = v_current_stock + v_item.quantity,
          updated_at = now()
        WHERE id = v_inventory_stock_id;

      ELSE

        INSERT INTO public.inventory_stock (
          store_id,
          branch_id,
          warehouse_id,
          location_id,
          product_id,
          quantity
        )
        VALUES (
          p_store_id,
          p_branch_id,
          NULL,
          NULL,
          v_item.product_id,
          v_item.quantity
        );

      END IF;

    END IF;


    -- =======================================================
    -- 4. INVENTARIO POR ALMACÉN
    -- =======================================================

    IF p_scope = 'warehouse' THEN

      SELECT
        id,
        quantity
      INTO
        v_inventory_stock_id,
        v_current_stock
      FROM public.inventory_stock
      WHERE store_id = p_store_id
        AND product_id = v_item.product_id
        AND branch_id IS NULL
        AND warehouse_id = p_warehouse_id
        AND location_id IS NULL
      FOR UPDATE;


      IF FOUND THEN

        UPDATE public.inventory_stock
        SET
          quantity = v_current_stock + v_item.quantity,
          updated_at = now()
        WHERE id = v_inventory_stock_id;

      ELSE

        INSERT INTO public.inventory_stock (
          store_id,
          branch_id,
          warehouse_id,
          location_id,
          product_id,
          quantity
        )
        VALUES (
          p_store_id,
          NULL,
          p_warehouse_id,
          NULL,
          v_item.product_id,
          v_item.quantity
        );

      END IF;

    END IF;


    -- =======================================================
    -- 5. INVENTARIO POR UBICACIÓN
    -- =======================================================

    IF p_scope = 'location' THEN

      SELECT
        id,
        quantity
      INTO
        v_inventory_stock_id,
        v_current_stock
      FROM public.inventory_stock
      WHERE store_id = p_store_id
        AND product_id = v_item.product_id
        AND branch_id IS NULL
        AND warehouse_id = p_warehouse_id
        AND location_id = p_location_id
      FOR UPDATE;


      IF FOUND THEN

        UPDATE public.inventory_stock
        SET
          quantity = v_current_stock + v_item.quantity,
          updated_at = now()
        WHERE id = v_inventory_stock_id;

      ELSE

        INSERT INTO public.inventory_stock (
          store_id,
          branch_id,
          warehouse_id,
          location_id,
          product_id,
          quantity
        )
        VALUES (
          p_store_id,
          NULL,
          p_warehouse_id,
          p_location_id,
          v_item.product_id,
          v_item.quantity
        );

      END IF;

    END IF;

  END LOOP;


  -- =========================================================
  -- MARCAR COMPRA COMO RECIBIDA
  -- =========================================================

  UPDATE public.purchases
  SET
    status = 'recibida'
  WHERE id = p_purchase_id
    AND store_id = p_store_id;


  -- =========================================================
  -- CREAR RECEPCIÓN
  -- =========================================================

  INSERT INTO public.receipts (
    store_id,
    supplier_id,
    purchase_id,
    scope,
    branch_id,
    warehouse_id,
    location_id
  )
  VALUES (
    p_store_id,
    v_purchase.supplier_id,
    p_purchase_id,
    p_scope,
    p_branch_id,
    p_warehouse_id,
    p_location_id
  )
  RETURNING id
  INTO v_receipt_id;


  -- =========================================================
  -- RESPUESTA
  -- =========================================================

  RETURN json_build_object(
    'ok', true,
    'purchase_id', p_purchase_id,
    'receipt_id', v_receipt_id,
    'status', 'recibida',
    'items_received', v_received_items,
    'scope', p_scope,
    'branch_id', p_branch_id,
    'warehouse_id', p_warehouse_id,
    'location_id', p_location_id
  );

END;

$function$;


-- ---------------------------------------------------------------------
-- 2.8 register_bulk_inventory: owner/admin/manager
--     (incluye la corrección de la migración 4)
-- ---------------------------------------------------------------------

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

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

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


-- ---------------------------------------------------------------------
-- 2.9 transfer_inventory: owner/admin/manager
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_inventory(p_store_id uuid, p_product_id uuid, p_from_warehouse_id uuid, p_from_location_id uuid, p_to_warehouse_id uuid, p_to_location_id uuid, p_quantity integer, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from_stock public.inventory_stock%rowtype;
  v_to_stock public.inventory_stock%rowtype;

  v_product public.products%rowtype;
  v_from_location public.locations%rowtype;
  v_to_location public.locations%rowtype;

  v_from_quantity integer;
  v_to_quantity integer;

  v_transfer_id uuid;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  -- Validar cantidad
  if p_quantity is null or p_quantity <= 0 then
    raise exception
      'La cantidad a trasladar debe ser mayor que cero.';
  end if;

  if p_from_location_id = p_to_location_id then
    raise exception
      'La ubicación de origen y destino deben ser diferentes.';
  end if;

  -- Validar producto
  select *
  into v_product
  from public.products
  where id = p_product_id
    and store_id = p_store_id
    and is_active = true
  for update;

  if not found then
    raise exception
      'Producto no encontrado o inactivo.';
  end if;

  -- Validar ubicación origen
  select *
  into v_from_location
  from public.locations
  where id = p_from_location_id
    and store_id = p_store_id
    and warehouse_id = p_from_warehouse_id
    and is_active = true;

  if not found then
    raise exception
      'La ubicación de origen no es válida.';
  end if;

  -- Validar ubicación destino
  select *
  into v_to_location
  from public.locations
  where id = p_to_location_id
    and store_id = p_store_id
    and warehouse_id = p_to_warehouse_id
    and is_active = true;

  if not found then
    raise exception
      'La ubicación de destino no es válida.';
  end if;

  -- Bloquear stock de origen
  select *
  into v_from_stock
  from public.inventory_stock
  where store_id = p_store_id
    and product_id = p_product_id
    and warehouse_id = p_from_warehouse_id
    and location_id = p_from_location_id
  for update;

  if not found then
    raise exception
      'No existe stock de este producto en la ubicación de origen.';
  end if;

  if v_from_stock.quantity < p_quantity then
    raise exception
      'Stock insuficiente. Disponible: %, solicitado: %.',
      v_from_stock.quantity,
      p_quantity;
  end if;

  v_from_quantity :=
    v_from_stock.quantity - p_quantity;

  -- Descontar origen
  update public.inventory_stock
  set
    quantity = v_from_quantity,
    updated_at = now()
  where id = v_from_stock.id;

  -- Buscar destino
  select *
  into v_to_stock
  from public.inventory_stock
  where store_id = p_store_id
    and product_id = p_product_id
    and warehouse_id = p_to_warehouse_id
    and location_id = p_to_location_id
  for update;

  if found then

    v_to_quantity :=
      v_to_stock.quantity + p_quantity;

    update public.inventory_stock
    set
      quantity = v_to_quantity,
      updated_at = now()
    where id = v_to_stock.id;

  else

    v_to_quantity := p_quantity;

    insert into public.inventory_stock (
      store_id,
      warehouse_id,
      location_id,
      product_id,
      quantity
    )
    values (
      p_store_id,
      p_to_warehouse_id,
      p_to_location_id,
      p_product_id,
      p_quantity
    )
    returning *
    into v_to_stock;

  end if;

  -- Registrar traslado
  insert into public.inventory_transfers (
    store_id,
    product_id,
    from_warehouse_id,
    from_location_id,
    to_warehouse_id,
    to_location_id,
    quantity,
    reason
  )
  values (
    p_store_id,
    p_product_id,
    p_from_warehouse_id,
    p_from_location_id,
    p_to_warehouse_id,
    p_to_location_id,
    p_quantity,
    p_reason
  )
  returning id
  into v_transfer_id;

  return json_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'product_id', p_product_id,
    'quantity', p_quantity,
    'from_location_id', p_from_location_id,
    'to_location_id', p_to_location_id,
    'from_quantity', v_from_quantity,
    'to_quantity', v_to_quantity
  );
end;
$function$;


-- ---------------------------------------------------------------------
-- 2.10 Permisos: create or replace conserva los grants existentes,
-- pero se repiten para que el archivo sea autosuficiente.
-- ---------------------------------------------------------------------

grant execute on function public.register_inventory_movement(uuid, text, integer, text, uuid) to authenticated, service_role;
grant execute on function public.register_sale(jsonb, text, text, uuid) to authenticated, service_role;
grant execute on function public.register_customer_return(uuid, uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.create_purchase(uuid, uuid, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.receive_purchase_at_scope(uuid, uuid, text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.register_bulk_inventory(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, uuid, uuid, uuid, integer, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Limpieza aprobada
-- ---------------------------------------------------------------------

-- 2.11 receive_purchase (2 versiones viejas). El código Next.js no las
-- usa (grep: solo se llama receive_purchase_at_scope). Además siguen
-- llamando a register_inventory_movement: tras esta migración exigirían
-- sesión de owner/admin/manager, pero no verifican nada por sí mismas.
-- Aprobado: se eliminan.

drop function if exists public.receive_purchase(uuid, uuid);
drop function if exists public.receive_purchase(uuid, uuid, uuid, uuid);

-- 2.12 is_manager_or_admin(). No la usa el código ni ninguna política
-- RLS de diagnostico.csv (las políticas usan get_my_role()).
-- Aprobado: se elimina.

drop function if exists public.is_manager_or_admin();
