-- =====================================================================
-- Migración tanda 3, A3: carga inicial atómica e idempotente
--
-- 1. processed_requests: registro de qué request_id ya se aplicó, por
--    tienda y por tipo de operación ("kind"). RLS activo y sin
--    políticas: solo las funciones SECURITY DEFINER (que corren con
--    los privilegios de su dueña, no del cliente) pueden leerla o
--    escribirla.
-- 2. register_initial_load: nueva función para la carga inicial.
--    Antes, /api/inventory/initial-load llamaba
--    register_inventory_movement una vez por SKU, sin transacción: si
--    fallaba a la mitad, quedaba aplicada solo una parte. Esta función
--    valida todos los ítems primero (como register_bulk_inventory) y
--    aplica todo en una sola llamada, por lo tanto una sola
--    transacción; usa _apply_inventory_movement (la función interna,
--    sin autorización propia, pensada para que otra función de
--    negocio ya autorizada la invoque) con tipo 'ajuste' para cada
--    producto.
-- 3. register_bulk_inventory: se le agrega p_request_id uuid default
--    null al final de la firma.
--
--    CORRECCIÓN: probado en Postgres 16 real, agregar un parámetro con
--    default NO reemplaza la función existente -- CREATE OR REPLACE
--    solo reemplaza una función cuando la lista de tipos de parámetros
--    es idéntica a la de una función ya existente. Como (uuid, jsonb,
--    text, text, uuid) es una lista distinta de (uuid, jsonb, text,
--    text), esto crea una SEGUNDA función sobrecargada y deja la
--    vieja de 4 argumentos intacta. Con las dos versiones coexistiendo,
--    una llamada con los 4 parámetros de siempre (con nombre, como hace
--    PostgREST) queda ambigua entre ambas y falla con
--    "function ... is not unique".
--
--    Por eso aquí SÍ se hace primero un DROP FUNCTION explícito de la
--    firma vieja, tal como pedía la instrucción original, antes de
--    crear la de 5 parámetros. No queda ninguna versión de 4
--    argumentos después de esta migración. Como la firma declarada
--    cambia, los grant/revoke que la nombran deben repetirse con la
--    firma nueva: los de la firma de 4 argumentos ya no resuelven a
--    nada después del DROP.
-- =====================================================================

create table if not exists public.processed_requests (
  request_id uuid primary key,
  store_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.processed_requests enable row level security;
-- Sin políticas a propósito: ningún cliente debe poder leer ni
-- escribir esta tabla directamente, ni siquiera para consultar si su
-- propio request_id ya se procesó (se enteran por el resultado de la
-- llamada a la función).


-- ---------------------------------------------------------------------
-- register_initial_load
-- ---------------------------------------------------------------------

create or replace function public.register_initial_load(
  p_store_id uuid,
  p_items jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_reason text;
  v_movement json;
  v_count integer := 0;
  v_result jsonb := '[]'::jsonb;
begin

  -- Autorización: sesión, tienda y rol.
  perform public.assert_store_role(p_store_id, array['owner', 'admin', 'manager']);

  if p_request_id is null then
    raise exception 'request_id es obligatorio.';
  end if;

  -- Idempotencia: ver el comentario de cabecera de esta migración
  -- sobre por qué el insert va antes de aplicar nada.
  begin

    insert into public.processed_requests (
      request_id,
      store_id,
      kind,
      created_by
    )
    values (
      p_request_id,
      p_store_id,
      'initial_load',
      auth.uid()
    );

  exception
    when unique_violation then
      raise exception 'Esta carga ya fue procesada.';
  end;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then

    raise exception 'No se recibieron productos para procesar.';
  end if;

  if jsonb_array_length(p_items) > 1000 then
    raise exception 'El archivo no puede contener más de 1000 productos por cargue.';
  end if;

  -- =========================================================
  -- VALIDAR TODOS LOS PRODUCTOS ANTES DE MODIFICAR NADA
  -- =========================================================

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

    if v_quantity is null or v_quantity < 0 then
      raise exception
        'El producto % no tiene una cantidad válida.',
        v_product_id;
    end if;

    if not exists (
      select 1
      from public.products
      where id = v_product_id
        and store_id = p_store_id
    ) then
      raise exception
        'El producto % no existe o no pertenece a esta tienda.',
        v_product_id;
    end if;

  end loop;

  -- =========================================================
  -- APLICAR (una sola transacción: esta llamada completa)
  -- =========================================================

  for item in
    select value
    from jsonb_array_elements(p_items)
  loop

    v_product_id :=
      nullif(item->>'product_id', '')::uuid;

    v_quantity :=
      nullif(item->>'quantity', '')::integer;

    v_reason :=
      nullif(trim(coalesce(item->>'reason', '')), '');

    v_movement := public._apply_inventory_movement(
      v_product_id,
      'ajuste',
      v_quantity,
      coalesce(v_reason, 'Inventario inicial'),
      p_store_id
    );

    v_result :=
      v_result || jsonb_build_array(v_movement);

    v_count := v_count + 1;

  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', v_count,
    'items', v_result
  );

end;
$function$;

revoke execute on function public.register_initial_load(uuid, jsonb, uuid) from public, anon;
grant execute on function public.register_initial_load(uuid, jsonb, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- register_bulk_inventory: agrega p_request_id (idempotencia)
-- ---------------------------------------------------------------------

-- La función vieja (4 argumentos) debe dejar de existir: si
-- quedara, una llamada con los 4 parámetros de siempre sería ambigua
-- entre las dos versiones ("is not unique").
drop function if exists public.register_bulk_inventory(uuid, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.register_bulk_inventory(p_store_id uuid, p_items jsonb, p_movement_type text DEFAULT 'entrada'::text, p_reason text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid)
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
   * IDEMPOTENCIA
   * ============================================================
   *
   * p_request_id es opcional (compatibilidad con llamadas que no
   * lo envían). Si se envía y ya existe en processed_requests,
   * la carga ya se aplicó antes: se rechaza sin tocar nada más.
   *
   * El insert ocurre ahora, no al final: si la función falla más
   * adelante por cualquier motivo, toda la transacción (incluido
   * este insert) se revierte, así que un reintento con el mismo
   * request_id vuelve a pasar por aquí sin problema. Solo queda
   * registrado cuando la carga se completa con éxito.
   */

  if p_request_id is not null then

    begin

      insert into public.processed_requests (
        request_id,
        store_id,
        kind,
        created_by
      )
      values (
        p_request_id,
        p_store_id,
        'bulk_inventory',
        auth.uid()
      );

    exception
      when unique_violation then
        raise exception 'Esta carga ya fue procesada.';
    end;

  end if;

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

revoke execute on function public.register_bulk_inventory(uuid, jsonb, text, text, uuid) from public, anon;
grant execute on function public.register_bulk_inventory(uuid, jsonb, text, text, uuid) to authenticated, service_role;
