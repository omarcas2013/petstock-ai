import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

type BulkItem = {
  product_id?: string;
  sku?: string | null;
  barcode?: string | null;
  quantity: number;
  reason?: string | null;
};

type BulkRequest = {
  items: BulkItem[];
  movement_type?: "entrada" | "ajuste";
  reason?: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Faltan las variables de Supabase."
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

async function getAuthenticatedUser() {
  const supabase =
    await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserStoreId(
  userId: string
) {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", userId)
      .single();

  if (error) {
    throw new Error(
      `No se pudo obtener el perfil: ${error.message}`
    );
  }

  if (!data?.store_id) {
    throw new Error(
      "El usuario no tiene una tienda asignada."
    );
  }

  return data.store_id;
}

export async function POST(
  request: Request
) {
  try {
    /*
     * ============================================================
     * AUTENTICACIÓN
     * ============================================================
     */

    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * ============================================================
     * OBTENER TIENDA
     * ============================================================
     */

    const storeId =
      await getUserStoreId(user.id);

    /*
     * ============================================================
     * LEER BODY
     * ============================================================
     */

    const body =
      (await request.json()) as BulkRequest;

    const items = Array.isArray(
      body.items
    )
      ? body.items
      : [];

    const movementType =
      body.movement_type || "entrada";

    const globalReason =
      body.reason?.trim() || null;


    /*
     * ============================================================
     * VALIDACIONES GENERALES
     * ============================================================
     */

    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se recibieron productos para procesar.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      movementType !== "entrada" &&
      movementType !== "ajuste"
    ) {
      return NextResponse.json(
        {
          error:
            "El tipo de movimiento no es válido.",
        },
        {
          status: 400,
        }
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
        {
          status: 400,
        }
      );
    }


    /*
     * ============================================================
     * NORMALIZAR ITEMS
     * ============================================================
     */

    const normalizedItems =
      items.map((item, index) => {
        const productId =
          item.product_id
            ?.toString()
            .trim() || null;

        const sku =
          item.sku
            ?.toString()
            .trim() || null;

        const barcode =
          item.barcode
            ?.toString()
            .trim() || null;

        const quantity =
          Number(item.quantity);

        const reason =
          item.reason
            ?.toString()
            .trim() ||
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

    const invalidQuantity =
      normalizedItems.find(
        (item) =>
          !Number.isInteger(
            item.quantity
          ) ||
          item.quantity < 0
      );

    if (invalidQuantity) {
      return NextResponse.json(
        {
          error: `Cantidad inválida en la fila ${invalidQuantity.row}.`,
          row: invalidQuantity.row,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * En entradas no permitimos cero.
     */

    if (movementType === "entrada") {
      const zeroQuantity =
        normalizedItems.find(
          (item) =>
            item.quantity === 0
        );

      if (zeroQuantity) {
        return NextResponse.json(
          {
            error: `La cantidad debe ser mayor que 0 en la fila ${zeroQuantity.row}.`,
            row: zeroQuantity.row,
          },
          {
            status: 400,
          }
        );
      }
    }


    /*
     * ============================================================
     * VALIDAR QUE CADA FILA TENGA IDENTIFICADOR
     * ============================================================
     */

    const missingIdentifier =
      normalizedItems.find(
        (item) =>
          !item.product_id &&
          !item.sku &&
          !item.barcode
      );

    if (missingIdentifier) {
      return NextResponse.json(
        {
          error:
            `La fila ${missingIdentifier.row} ` +
            "no tiene product_id, SKU ni código de barras.",
          row: missingIdentifier.row,
        },
        {
          status: 400,
        }
      );
    }


    /*
     * ============================================================
     * OBTENER PRODUCTOS DE LA TIENDA
     * ============================================================
     */

    const supabase =
      getSupabaseAdmin();

    const { data: products, error } =
      await supabase
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
        .eq("store_id", storeId);

    if (error) {
      console.error(
        "Error consultando productos:",
        error
      );

      return NextResponse.json(
        {
          error:
            "No se pudieron consultar los productos.",
          details: error.message,
        },
        {
          status: 500,
        }
      );
    }


    /*
     * ============================================================
     * CREAR ÍNDICES
     * ============================================================
     */

    const productsById =
      new Map<
        string,
        (typeof products)[number]
      >();

    const productsBySku =
      new Map<
        string,
        (typeof products)[number]
      >();

    const productsByBarcode =
      new Map<
        string,
        (typeof products)[number]
      >();

    for (const product of products || []) {
      productsById.set(
        product.id,
        product
      );

      if (product.sku) {
        productsBySku.set(
          product.sku
            .trim()
            .toLowerCase(),
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

    for (
      const item of normalizedItems
    ) {
      let product:
        | (typeof products)[number]
        | undefined;

      /*
       * Prioridad:
       *
       * 1. product_id
       * 2. barcode
       * 3. SKU
       */

      if (item.product_id) {
        product =
          productsById.get(
            item.product_id
          );
      }

      if (!product && item.barcode) {
        product =
          productsByBarcode.get(
            item.barcode
          );
      }

      if (!product && item.sku) {
        product =
          productsBySku.get(
            item.sku.toLowerCase()
          );
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
        quantity: item.quantity,
        reason: item.reason,
        product_name:
          product.name,
        sku: product.sku,
        barcode: product.barcode,
        stock_before:
          product.stock ?? 0,
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

    const seenProducts =
      new Map<string, number>();

    for (
      const item of resolvedItems
    ) {
      const previousRow =
        seenProducts.get(
          item.product_id
        );

      if (previousRow) {
        validationErrors.push({
          row: item.row,
          error:
            `El producto "${item.product_name}" ` +
            `está repetido. Ya aparece en la fila ${previousRow}.`,
        });
      } else {
        seenProducts.set(
          item.product_id,
          item.row
        );
      }
    }


    /*
     * ============================================================
     * SI EXISTEN ERRORES NO MODIFICAMOS NADA
     * ============================================================
     */

    if (
      validationErrors.length > 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El archivo contiene errores y no se realizó ningún cambio.",
          validation_errors:
            validationErrors,
        },
        {
          status: 400,
        }
      );
    }


    /*
     * ============================================================
     * PREPARAR PAYLOAD PARA POSTGRESQL
     * ============================================================
     */

    const rpcItems =
      resolvedItems.map((item) => ({
        product_id:
          item.product_id,
        quantity:
          item.quantity,
        reason:
          item.reason,
      }));


    /*
     * ============================================================
     * EJECUTAR OPERACIÓN TRANSACCIONAL
     * ============================================================
     */

    const {
      data: result,
      error: rpcError,
    } = await supabase.rpc(
      "register_bulk_inventory",
      {
        p_store_id: storeId,
        p_items: rpcItems,
        p_movement_type:
          movementType,
        p_reason:
          globalReason,
      }
    );

    if (rpcError) {
      console.error(
        "Error en register_bulk_inventory:",
        rpcError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            rpcError.message ||
            "No se pudo procesar la carga masiva.",
          details:
            rpcError.details,
          hint:
            rpcError.hint,
          code:
            rpcError.code,
        },
        {
          status: 400,
        }
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
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      {
        status: 500,
      }
    );
  }
}