import { NextResponse } from "next/server";
import { parseQuantity } from "@/lib/quantity";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

type BulkItem = {
  product_id?: string;
  sku?: string | null;
  barcode?: string | null;
  quantity: number | string | null;
  reason?: string | null;
};

type BulkRequest = {
  items: BulkItem[];
  movement_type?: "entrada" | "ajuste";
  reason?: string | null;
  request_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    /*
     * ============================================================
     * AUTENTICACIÓN Y PERMISOS
     * ============================================================
     *
     * Usamos el cliente de sesión (no la llave secreta): así
     * register_bulk_inventory puede ejecutar auth.uid() y
     * assert_store_role() lo valida de nuevo del lado de la base.
     */

    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    /*
     * ============================================================
     * LEER BODY
     * ============================================================
     */

    let body: BulkRequest;

    try {
      body = (await request.json()) as BulkRequest;
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];

    const movementType = body.movement_type || "entrada";

    const globalReason =
      typeof body.reason === "string"
        ? body.reason.trim() || null
        : null;

    /*
     * request_id (tanda 3, A3): opcional, igual que en
     * register_bulk_inventory. Si el cliente lo manda, debe ser un
     * UUID; si lo repite, la RPC rechaza la carga sin aplicar nada
     * ("Esta carga ya fue procesada.").
     */
    const requestId =
      typeof body.request_id === "string" && body.request_id
        ? body.request_id
        : null;

    if (requestId !== null && !UUID_RE.test(requestId)) {
      return NextResponse.json(
        { error: "request_id debe ser un UUID." },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * VALIDACIONES GENERALES
     * ============================================================
     */

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron productos para procesar." },
        { status: 400 }
      );
    }

    if (
      movementType !== "entrada" &&
      movementType !== "ajuste"
    ) {
      return NextResponse.json(
        { error: "El tipo de movimiento no es válido." },
        { status: 400 }
      );
    }

    /*
     * Evitamos cargas accidentalmente gigantes.
     *
     * Posteriormente podemos convertir esto
     * en una configuración por tienda.
     */

    if (items.length > 5000) {
      return NextResponse.json(
        {
          error:
            "El archivo contiene demasiados registros. Máximo permitido: 5.000.",
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * NORMALIZAR ITEMS
     * ============================================================
     */

    const normalizedItems = items.map((item, index) => {
      const productId =
        item.product_id?.toString().trim() || null;

      const sku = item.sku?.toString().trim() || null;

      const barcode = item.barcode?.toString().trim() || null;

      const quantity = parseQuantity(item.quantity);

      const reason =
        item.reason?.toString().trim() ||
        globalReason ||
        null;

      return {
        row: index + 1,
        product_id: productId,
        sku,
        barcode,
        quantity,
        reason,
      };
    });

    /*
     * ============================================================
     * VALIDAR CANTIDADES
     * ============================================================
     */

    const invalidQuantity = normalizedItems.find(
      (item) =>
        item.quantity === null ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 0
    );

    if (invalidQuantity) {
      return NextResponse.json(
        {
          error: `Cantidad inválida en la fila ${invalidQuantity.row}.`,
          row: invalidQuantity.row,
        },
        { status: 400 }
      );
    }

    /*
     * En entradas no permitimos cero.
     */

    if (movementType === "entrada") {
      const zeroQuantity = normalizedItems.find(
        (item) => item.quantity === 0
      );

      if (zeroQuantity) {
        return NextResponse.json(
          {
            error: `La cantidad debe ser mayor que 0 en la fila ${zeroQuantity.row}.`,
            row: zeroQuantity.row,
          },
          { status: 400 }
        );
      }
    }

    /*
     * ============================================================
     * VALIDAR QUE CADA FILA TENGA IDENTIFICADOR
     * ============================================================
     */

    const missingIdentifier = normalizedItems.find(
      (item) => !item.product_id && !item.sku && !item.barcode
    );

    if (missingIdentifier) {
      return NextResponse.json(
        {
          error:
            `La fila ${missingIdentifier.row} ` +
            "no tiene product_id, SKU ni código de barras.",
          row: missingIdentifier.row,
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * OBTENER PRODUCTOS DE LA TIENDA
     * ============================================================
     */

    const { data: products, error } = await fetchAllRows(
      (from, to) =>
        supabase
          .from("products")
          .select(
            `
            id,
            name,
            sku,
            barcode,
            stock,
            store_id
          `
          )
          .eq("store_id", storeId)
          .order("id")
          .range(from, to)
    );

    if (error) {
      console.error("Error consultando productos:", error);

      return NextResponse.json(
        { error: "No se pudieron consultar los productos." },
        { status: 500 }
      );
    }

    /*
     * ============================================================
     * CREAR ÍNDICES
     * ============================================================
     */

    const productsById = new Map<
      string,
      NonNullable<typeof products>[number]
    >();

    const productsBySku = new Map<
      string,
      NonNullable<typeof products>[number]
    >();

    const productsByBarcode = new Map<
      string,
      NonNullable<typeof products>[number]
    >();

    for (const product of products || []) {
      productsById.set(product.id, product);

      if (product.sku) {
        productsBySku.set(
          product.sku.trim().toLowerCase(),
          product
        );
      }

      if (product.barcode) {
        productsByBarcode.set(
          product.barcode.trim(),
          product
        );
      }
    }

    /*
     * ============================================================
     * RESOLVER PRODUCTOS
     * ============================================================
     */

    const resolvedItems: Array<{
      row: number;
      product_id: string;
      quantity: number;
      reason: string | null;
      product_name: string;
      sku: string | null;
      barcode: string | null;
      stock_before: number;
    }> = [];

    const validationErrors: Array<{
      row: number;
      error: string;
    }> = [];

    for (const item of normalizedItems) {
      let product:
        | NonNullable<typeof products>[number]
        | undefined;

      /*
       * Prioridad:
       *
       * 1. product_id
       * 2. barcode
       * 3. SKU
       */

      if (item.product_id) {
        product = productsById.get(item.product_id);
      }

      if (!product && item.barcode) {
        product = productsByBarcode.get(item.barcode);
      }

      if (!product && item.sku) {
        product = productsBySku.get(item.sku.toLowerCase());
      }

      if (!product) {
        validationErrors.push({
          row: item.row,
          error:
            "Producto no encontrado por ID, SKU o código de barras.",
        });

        continue;
      }

      resolvedItems.push({
        row: item.row,
        product_id: product.id,
        quantity: item.quantity as number,
        reason: item.reason,
        product_name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        stock_before: product.stock ?? 0,
      });
    }

    /*
     * ============================================================
     * DETECTAR PRODUCTOS DUPLICADOS
     * ============================================================
     *
     * No queremos que el mismo producto aparezca
     * dos veces en el mismo archivo.
     *
     * Esto evita errores como:
     *
     * SKU001 -> 10
     * SKU001 -> 20
     *
     * y que el usuario no sepa exactamente qué
     * operación terminó aplicándose.
     */

    const seenProducts = new Map<string, number>();

    for (const item of resolvedItems) {
      const previousRow = seenProducts.get(item.product_id);

      if (previousRow) {
        validationErrors.push({
          row: item.row,
          error:
            `El producto "${item.product_name}" ` +
            `está repetido. Ya aparece en la fila ${previousRow}.`,
        });
      } else {
        seenProducts.set(item.product_id, item.row);
      }
    }

    /*
     * ============================================================
     * SI EXISTEN ERRORES NO MODIFICAMOS NADA
     * ============================================================
     */

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El archivo contiene errores y no se realizó ningún cambio.",
          validation_errors: validationErrors,
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * PREPARAR PAYLOAD PARA POSTGRESQL
     * ============================================================
     */

    const rpcItems = resolvedItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      reason: item.reason,
    }));

    /*
     * ============================================================
     * EJECUTAR OPERACIÓN TRANSACCIONAL
     * ============================================================
     */

    const { data: result, error: rpcError } =
      await supabase.rpc("register_bulk_inventory", {
        p_store_id: storeId,
        p_items: rpcItems,
        p_movement_type: movementType,
        p_reason: globalReason,
        p_request_id: requestId,
      });

    if (rpcError) {
      console.error(
        "Error en register_bulk_inventory:",
        rpcError
      );

      return NextResponse.json(
        {
          ok: false,
          error: rpcErrorMessage(
            rpcError,
            "No se pudo procesar la carga masiva."
          ),
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * RESPUESTA
     * ============================================================
     */

    return NextResponse.json({
      ok: true,

      message:
        movementType === "entrada"
          ? "Carga de inventario realizada correctamente."
          : "Ajuste masivo realizado correctamente.",

      result,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO EN POST /api/inventory/bulk:",
      error
    );

    return NextResponse.json(
      { ok: false, error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
