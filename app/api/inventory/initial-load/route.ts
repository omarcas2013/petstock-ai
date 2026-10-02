import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createClient as createServerSupabase,
} from "@/lib/supabase/server";
import {
  INVENTORY_MANAGER_ROLES,
  parseQuantity,
} from "@/lib/quantity";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

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

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (
    !supabaseUrl ||
    !supabaseSecretKey
  ) {
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

async function getUserProfile(
  userId: string
) {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("profiles")
      .select("store_id, role")
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

  return data as {
    store_id: string;
    role: string | null;
  };
}

export async function POST(
  request: Request
) {
  try {
    /*
     * ---------------------------------------------------------
     * AUTENTICACIÓN
     * ---------------------------------------------------------
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
     * ---------------------------------------------------------
     * TIENDA Y PERMISOS
     * ---------------------------------------------------------
     */

    const profile =
      await getUserProfile(
        user.id
      );

    const storeId = profile.store_id;

    if (
      !profile.role ||
      !INVENTORY_MANAGER_ROLES.includes(
        profile.role
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para cargar inventario.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * BODY
     * ---------------------------------------------------------
     */

    let body: { items?: unknown } | null;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "El cuerpo de la solicitud no es JSON válido.",
        },
        {
          status: 400,
        }
      );
    }

    const rawItems =
      body?.items;

    if (
      !Array.isArray(rawItems) ||
      rawItems.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No se recibieron productos para cargar.",
        },
        {
          status: 400,
        }
      );
    }

    if (rawItems.length > 1000) {
      return NextResponse.json(
        {
          error:
            "El archivo no puede contener más de 1000 productos por cargue.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * NORMALIZAR Y VALIDAR ITEMS
     * ---------------------------------------------------------
     */

    const parsedItems =
      (rawItems as RawLoadItem[]).map(
        (item) => ({
          sku:
            typeof item?.sku ===
            "string"
              ? item.sku.trim()
              : "",
          quantity:
            parseQuantity(item?.quantity),
          reason:
            typeof item?.reason ===
            "string"
              ? item.reason.trim()
              : "Inventario inicial",
        })
      );

    for (
      let index = 0;
      index < parsedItems.length;
      index++
    ) {
      const item =
        parsedItems[index];

      if (!item.sku) {
        return NextResponse.json(
          {
            error: `El registro ${index + 1} no tiene SKU.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        item.quantity === null ||
        !Number.isInteger(
          item.quantity
        ) ||
        item.quantity < 0
      ) {
        return NextResponse.json(
          {
            error: `La cantidad del SKU ${item.sku} no es válida.`,
          },
          {
            status: 400,
          }
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

    const skuSet =
      new Set<string>();

    for (const item of items) {
      const normalizedSku =
        item.sku.toLowerCase();

      if (
        skuSet.has(
          normalizedSku
        )
      ) {
        return NextResponse.json(
          {
            error:
              `El SKU ${item.sku} aparece más de una vez.`,
          },
          {
            status: 400,
          }
        );
      }

      skuSet.add(
        normalizedSku
      );
    }

    const supabase =
      getSupabaseAdmin();

    /*
     * ---------------------------------------------------------
     * BUSCAR PRODUCTOS
     * ---------------------------------------------------------
     *
     * Se buscan todos los productos de la tienda
     * y posteriormente se cruzan por SKU.
     *
     * Esto evita hacer una consulta a Supabase
     * por cada fila del archivo.
     */

    const {
      data: products,
      error: productsError,
    } = await fetchAllRows((from, to) =>
      supabase
        .from("products")
        .select(
          "id, name, sku, stock, store_id"
        )
        .eq(
          "store_id",
          storeId
        )
        .order("id")
        .range(from, to)
    );

    if (productsError) {
      console.error(
        "ERROR BUSCANDO PRODUCTOS PARA CARGUE:",
        productsError
      );

      return NextResponse.json(
        {
          error:
            productsError.message,
        },
        {
          status: 500,
        }
      );
    }

    const productMap =
      new Map<
        string,
        {
          id: string;
          name: string;
          sku: string | null;
          stock: number;
          store_id: string;
        }
      >();

    for (
      const product of
        products || []
    ) {
      if (!product.sku) {
        continue;
      }

      productMap.set(
        product.sku
          .trim()
          .toLowerCase(),
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          stock:
            Number(
              product.stock
            ) || 0,
          store_id:
            product.store_id,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * VALIDACIÓN COMPLETA ANTES DE MODIFICAR STOCK
     * ---------------------------------------------------------
     */

    const validationErrors: string[] =
      [];

    for (const item of items) {
      const product =
        productMap.get(
          item.sku
            .trim()
            .toLowerCase()
        );

      if (!product) {
        validationErrors.push(
          `No existe un producto con SKU ${item.sku}.`
        );
      }
    }

    if (
      validationErrors.length >
      0
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo validar el cargue.",
          details:
            validationErrors,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * REGISTRAR AJUSTES
     * ---------------------------------------------------------
     *
     * IMPORTANTE:
     *
     * Usamos el mismo RPC que ya utiliza
     * /api/inventory/movements.
     *
     * Esto mantiene una única lógica para actualizar
     * el stock y registrar movimientos.
     */

    const results = [];

    for (const item of items) {
      const product =
        productMap.get(
          item.sku
            .trim()
            .toLowerCase()
        );

      if (!product) {
        continue;
      }

      const {
        data: movement,
        error: movementError,
      } =
        await supabase.rpc(
          "register_inventory_movement",
          {
            p_product_id:
              product.id,

            p_movement_type:
              "ajuste",

            /*
             * En un ajuste la cantidad representa
             * el STOCK FINAL deseado.
             */
            p_quantity:
              item.quantity,

            p_reason:
              item.reason ||
              "Inventario inicial",

            p_store_id:
              storeId,
          }
        );

      if (movementError) {
        console.error(
          `ERROR AJUSTANDO SKU ${item.sku}:`,
          movementError
        );

        return NextResponse.json(
          {
            error:
              `No se pudo actualizar el SKU ${item.sku}.`,
            details:
              movementError.message,
            results,
          },
          {
            status: 400,
          }
        );
      }

      /*
       * Dependiendo de cómo esté definida
       * la función PostgreSQL, movement puede
       * ser objeto o arreglo.
       */

      const movementData =
        Array.isArray(
          movement
        )
          ? movement[0]
          : movement;

      results.push({
        sku: item.sku,
        product_name:
          product.name,
        stock_before:
          movementData
            ?.stock_before ??
          product.stock,
        stock_after:
          movementData
            ?.stock_after ??
          item.quantity,
      });
    }

    /*
     * ---------------------------------------------------------
     * RESPUESTA
     * ---------------------------------------------------------
     */

    return NextResponse.json({
      ok: true,

      message:
        `Inventario actualizado correctamente. ${items.length} producto(s) procesado(s).`,

      results,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO EN CARGUE DE INVENTARIO:",
      error
    );

    return NextResponse.json(
      {
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