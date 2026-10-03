import { NextResponse } from "next/server";
import { parseQuantity } from "@/lib/quantity";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

type LoadItem = {
  sku: string;
  quantity: number;
  reason?: string | null;
};

type RawLoadItem = {
  sku?: unknown;
  quantity?: unknown;
  reason?: unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    /*
     * ---------------------------------------------------------
     * AUTENTICACIÓN Y PERMISOS
     * ---------------------------------------------------------
     *
     * Usamos el cliente de sesión (no la llave secreta): así
     * register_initial_load puede ejecutar auth.uid() y
     * assert_store_role() lo valida de nuevo del lado de la base.
     */

    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    /*
     * ---------------------------------------------------------
     * BODY
     * ---------------------------------------------------------
     */

    let body: { items?: unknown; request_id?: unknown } | null;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    const requestId =
      typeof body?.request_id === "string" ? body.request_id : "";

    if (!UUID_RE.test(requestId)) {
      return NextResponse.json(
        {
          error:
            "request_id es obligatorio y debe ser un UUID (tanda 3, A3: evita aplicar la misma carga dos veces).",
        },
        { status: 400 }
      );
    }

    const rawItems = body?.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron productos para cargar." },
        { status: 400 }
      );
    }

    if (rawItems.length > 1000) {
      return NextResponse.json(
        {
          error:
            "El archivo no puede contener más de 1000 productos por cargue.",
        },
        { status: 400 }
      );
    }

    /*
     * ---------------------------------------------------------
     * NORMALIZAR Y VALIDAR ITEMS
     * ---------------------------------------------------------
     */

    const parsedItems = (rawItems as RawLoadItem[]).map(
      (item) => ({
        sku:
          typeof item?.sku === "string"
            ? item.sku.trim()
            : "",
        quantity: parseQuantity(item?.quantity),
        reason:
          typeof item?.reason === "string"
            ? item.reason.trim()
            : "Inventario inicial",
      })
    );

    for (let index = 0; index < parsedItems.length; index++) {
      const item = parsedItems[index];

      if (!item.sku) {
        return NextResponse.json(
          { error: `El registro ${index + 1} no tiene SKU.` },
          { status: 400 }
        );
      }

      if (
        item.quantity === null ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 0
      ) {
        return NextResponse.json(
          {
            error: `La cantidad del SKU ${item.sku} no es válida.`,
          },
          { status: 400 }
        );
      }
    }

    // Ya validado: todas las cantidades son enteros >= 0.
    const items = parsedItems as LoadItem[];

    /*
     * ---------------------------------------------------------
     * EVITAR SKU DUPLICADOS
     * ---------------------------------------------------------
     */

    const skuSet = new Set<string>();

    for (const item of items) {
      const normalizedSku = item.sku.toLowerCase();

      if (skuSet.has(normalizedSku)) {
        return NextResponse.json(
          {
            error: `El SKU ${item.sku} aparece más de una vez.`,
          },
          { status: 400 }
        );
      }

      skuSet.add(normalizedSku);
    }

    /*
     * ---------------------------------------------------------
     * RESOLVER SKU -> PRODUCTO
     * ---------------------------------------------------------
     *
     * register_initial_load (tanda 3, A3) trabaja con product_id, no
     * con SKU: se resuelve aquí, igual que antes, para poder seguir
     * dando errores con el SKU tal como lo escribió el usuario y para
     * no tener que hacer una consulta a Supabase por cada fila.
     */

    const { data: products, error: productsError } =
      await fetchAllRows((from, to) =>
        supabase
          .from("products")
          .select("id, name, sku, stock, store_id")
          .eq("store_id", storeId)
          .order("id")
          .range(from, to)
      );

    if (productsError) {
      console.error(
        "ERROR BUSCANDO PRODUCTOS PARA CARGUE:",
        productsError
      );

      return NextResponse.json(
        { error: "No se pudieron consultar los productos." },
        { status: 500 }
      );
    }

    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        sku: string | null;
        stock: number;
        store_id: string;
      }
    >();

    for (const product of products || []) {
      if (!product.sku) {
        continue;
      }

      productMap.set(product.sku.trim().toLowerCase(), {
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: Number(product.stock) || 0,
        store_id: product.store_id,
      });
    }

    const validationErrors: string[] = [];
    // product_id -> sku/nombre, para traducir la respuesta de la RPC
    // de vuelta a algo legible (la RPC solo conoce product_id).
    const productById = new Map<
      string,
      { sku: string; name: string }
    >();

    const rpcItems: {
      product_id: string;
      quantity: number;
      reason: string | null;
    }[] = [];

    for (const item of items) {
      const product = productMap.get(
        item.sku.trim().toLowerCase()
      );

      if (!product) {
        validationErrors.push(
          `No existe un producto con SKU ${item.sku}.`
        );
        continue;
      }

      productById.set(product.id, {
        sku: product.sku ?? item.sku,
        name: product.name,
      });

      rpcItems.push({
        product_id: product.id,
        quantity: item.quantity,
        reason: item.reason || "Inventario inicial",
      });
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "No se pudo validar el cargue.",
          details: validationErrors,
        },
        { status: 400 }
      );
    }

    /*
     * ---------------------------------------------------------
     * APLICAR LA CARGA (una sola llamada, una sola transacción)
     * ---------------------------------------------------------
     *
     * register_initial_load valida todos los ítems antes de aplicar
     * nada y usa p_request_id para rechazar un reintento de la misma
     * carga sin volver a tocar el stock.
     */

    const { data: result, error: rpcError } = await supabase.rpc(
      "register_initial_load",
      {
        p_store_id: storeId,
        p_items: rpcItems,
        p_request_id: requestId,
      }
    );

    if (rpcError) {
      console.error(
        "ERROR EN register_initial_load:",
        rpcError
      );

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            rpcError,
            "No se pudo procesar la carga inicial."
          ),
        },
        { status: 400 }
      );
    }

    const rpcResultItems: Array<{
      product_id: string;
      stock_before?: number;
      stock_after?: number;
    }> = Array.isArray(result?.items) ? result.items : [];

    const results = rpcResultItems.map((movement) => {
      const info = productById.get(movement.product_id);

      return {
        sku: info?.sku ?? movement.product_id,
        product_name: info?.name ?? "",
        stock_before: movement.stock_before ?? null,
        stock_after: movement.stock_after ?? null,
      };
    });

    /*
     * ---------------------------------------------------------
     * RESPUESTA
     * ---------------------------------------------------------
     */

    return NextResponse.json({
      ok: true,

      message: `Inventario actualizado correctamente. ${items.length} producto(s) procesado(s).`,

      results,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO EN CARGUE DE INVENTARIO:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
