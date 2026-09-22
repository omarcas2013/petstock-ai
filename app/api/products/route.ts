import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

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

/*
|--------------------------------------------------------------------------
| VALIDAR ROL
|--------------------------------------------------------------------------
|
| Usamos la función existente get_my_role()
| mediante el cliente autenticado.
|
*/

async function getUserRole() {
  const supabase =
    await createServerSupabase();

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_my_role"
  );

  if (error) {
    throw new Error(
      `No se pudo verificar el rol del usuario: ${error.message}`
    );
  }

  return data as string | null;
}

function isProductManagerRole(
  role: string | null
) {
  return [
    "owner",
    "admin",
    "manager",
  ].includes(role || "");
}

/*
|--------------------------------------------------------------------------
| NORMALIZADORES
|--------------------------------------------------------------------------
*/

function normalizeText(
  value: unknown
) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed || null;
}

function parseNonNegativeNumber(
  value: unknown,
  fallback = 0
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}

function parseNonNegativeInteger(
  value: unknown,
  fallback = 0
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}

/*
|--------------------------------------------------------------------------
| GET /api/products
|--------------------------------------------------------------------------
*/

export async function GET(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const storeId =
      await getUserStoreId(
        user.id
      );

    const supabase =
      getSupabaseAdmin();

    const { searchParams } =
      new URL(request.url);

    const barcode =
      searchParams
        .get("barcode")
        ?.trim();

    /*
    |--------------------------------------------------------------------------
    | BUSCAR POR BARCODE
    |--------------------------------------------------------------------------
    */

    if (barcode) {
      const {
        data,
        error,
      } = await supabase
        .from("products")
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `)
        .eq("store_id", storeId)
        .eq("barcode", barcode)
        .maybeSingle();

      if (error) {
        console.error(
          "ERROR BUSCANDO PRODUCTO POR BARCODE:",
          error
        );

        return NextResponse.json(
          {
            error:
              error.message,
            details:
              error.details,
            hint:
              error.hint,
            code:
              error.code,
          },
          { status: 400 }
        );
      }

      if (!data) {
        return NextResponse.json(
          {
            error:
              "No existe un producto con ese código de barras.",
            barcode,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        product: data,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | LISTAR PRODUCTOS
    |--------------------------------------------------------------------------
    */

    const {
      data,
      error,
    } = await supabase
      .from("products")
      .select(`
        *,
        suppliers (
          id,
          name
        )
      `)
      .eq("store_id", storeId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "ERROR DE SUPABASE EN GET /api/products:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message,
          details:
            error.details,
          hint:
            error.hint,
          code:
            error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      products: data || [],
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO EN GET /api/products:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/products
|--------------------------------------------------------------------------
*/

export async function POST(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    /*
     * Validamos rol antes de usar
     * el cliente administrativo.
     */
    const role =
      await getUserRole();

    if (
      !isProductManagerRole(role)
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para crear productos.",
        },
        { status: 403 }
      );
    }

    const body =
      await request.json();

    const storeId =
      await getUserStoreId(
        user.id
      );

    const supabase =
      getSupabaseAdmin();

    /*
    |--------------------------------------------------------------------------
    | STOCK
    |--------------------------------------------------------------------------
    |
    | El stock NO se crea desde este endpoint.
    | Un producto nuevo comienza en 0.
    |
    */

    if (
      body.stock !== undefined
    ) {
      return NextResponse.json(
        {
          error:
            "El stock no se modifica desde la creación del producto. Utiliza un movimiento de inventario.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | DATOS BÁSICOS
    |--------------------------------------------------------------------------
    */

    const name =
      normalizeText(
        body.name
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "El nombre del producto es obligatorio.",
        },
        { status: 400 }
      );
    }

    const brand =
      normalizeText(
        body.brand
      );

    const category =
      normalizeText(
        body.category
      );

    const subcategory =
      normalizeText(
        body.subcategory
      );

    const description =
      normalizeText(
        body.description
      );

    const presentation =
      normalizeText(
        body.presentation
      );

    const petType =
      normalizeText(
        body.pet_type
      );

    const unitOfMeasure =
      normalizeText(
        body.unit_of_measure
      ) || "unidad";

    const sku =
      normalizeText(
        body.sku
      );

    const barcode =
      normalizeText(
        body.barcode
      );

    const imageUrl =
      normalizeText(
        body.image_url
      );

    /*
    |--------------------------------------------------------------------------
    | PRECIOS
    |--------------------------------------------------------------------------
    */

    const purchasePrice =
      parseNonNegativeNumber(
        body.purchase_price,
        0
      );

    const salePrice =
      parseNonNegativeNumber(
        body.sale_price,
        0
      );

    if (
      purchasePrice === null
    ) {
      return NextResponse.json(
        {
          error:
            "El precio de compra no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      salePrice === null
    ) {
      return NextResponse.json(
        {
          error:
            "El precio de venta no es válido.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | IMPUESTOS
    |--------------------------------------------------------------------------
    */

    const taxType =
      body.tax_type === "exento"
        ? "exento"
        : "porcentaje";

    let taxRate =
      parseNonNegativeNumber(
        body.tax_rate,
        0
      );

    if (
      taxRate === null
    ) {
      return NextResponse.json(
        {
          error:
            "La tasa de impuesto no es válida.",
        },
        { status: 400 }
      );
    }

    if (
      taxType === "exento"
    ) {
      taxRate = 0;
    }

    if (
      taxRate < 0 ||
      taxRate > 100
    ) {
      return NextResponse.json(
        {
          error:
            "La tasa de impuesto debe estar entre 0 y 100.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CONTROL DE INVENTARIO
    |--------------------------------------------------------------------------
    */

    const minimumStock =
      parseNonNegativeInteger(
        body.minimum_stock,
        0
      );

    const reorderPoint =
      parseNonNegativeInteger(
        body.reorder_point,
        0
      );

    if (
      minimumStock === null
    ) {
      return NextResponse.json(
        {
          error:
            "El stock mínimo no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      reorderPoint === null
    ) {
      return NextResponse.json(
        {
          error:
            "El punto de reposición no es válido.",
        },
        { status: 400 }
      );
    }

    let maximumStock:
      number | null = null;

    if (
      body.maximum_stock !== "" &&
      body.maximum_stock !== null &&
      body.maximum_stock !== undefined
    ) {
      maximumStock =
        parseNonNegativeInteger(
          body.maximum_stock
        );

      if (
        maximumStock === null
      ) {
        return NextResponse.json(
          {
            error:
              "El stock máximo no es válido.",
          },
          { status: 400 }
        );
      }

      if (
        maximumStock < minimumStock
      ) {
        return NextResponse.json(
          {
            error:
              "El stock máximo no puede ser menor que el stock mínimo.",
          },
          { status: 400 }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | PROVEEDOR
    |--------------------------------------------------------------------------
    */

    const supplierId =
      normalizeText(
        body.supplier_id
      );

    if (supplierId) {
      const {
        data: supplier,
        error: supplierError,
      } = await supabase
        .from("suppliers")
        .select("id")
        .eq("id", supplierId)
        .eq("store_id", storeId)
        .maybeSingle();

      if (supplierError) {
        console.error(
          "ERROR VALIDANDO PROVEEDOR:",
          supplierError
        );

        return NextResponse.json(
          {
            error:
              supplierError.message,
          },
          { status: 400 }
        );
      }

      if (!supplier) {
        return NextResponse.json(
          {
            error:
              "El proveedor no pertenece a tu tienda.",
          },
          { status: 403 }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDAR SKU
    |--------------------------------------------------------------------------
    */

    if (sku) {
      const {
        data: existingSku,
        error: skuError,
      } = await supabase
        .from("products")
        .select("id, name")
        .eq("store_id", storeId)
        .eq("sku", sku)
        .maybeSingle();

      if (skuError) {
        return NextResponse.json(
          {
            error:
              skuError.message,
          },
          { status: 400 }
        );
      }

      if (existingSku) {
        return NextResponse.json(
          {
            error:
              "Este SKU ya está asignado a otro producto.",
            product:
              existingSku,
          },
          { status: 409 }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDAR BARCODE
    |--------------------------------------------------------------------------
    */

    if (barcode) {
      const {
        data: existingBarcode,
        error: barcodeError,
      } = await supabase
        .from("products")
        .select("id, name")
        .eq("store_id", storeId)
        .eq("barcode", barcode)
        .maybeSingle();

      if (barcodeError) {
        return NextResponse.json(
          {
            error:
              barcodeError.message,
          },
          { status: 400 }
        );
      }

      if (existingBarcode) {
        return NextResponse.json(
          {
            error:
              "Este código de barras ya está asignado a otro producto.",
            product:
              existingBarcode,
          },
          { status: 409 }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | CREAR PRODUCTO
    |--------------------------------------------------------------------------
    */

    const {
      data,
      error,
    } = await supabase
      .from("products")
      .insert({
        store_id: storeId,

        name,

        description,

        brand,

        category,

        subcategory,

        supplier_id:
          supplierId,

        pet_type:
          petType,

        presentation,

        unit_of_measure:
          unitOfMeasure,

        sku,

        barcode,

        purchase_price:
          purchasePrice,

        sale_price:
          salePrice,

        tax_rate:
          taxRate,

        tax_type:
          taxType,

        minimum_stock:
          minimumStock,

        maximum_stock:
          maximumStock,

        reorder_point:
          reorderPoint,

        is_active: true,

        image_url:
          imageUrl,

        /*
         * IMPORTANTE:
         * siempre comienza en 0.
         */
        stock: 0,
      })
      .select()
      .single();

    if (error) {
      console.error(
        "ERROR DE SUPABASE EN POST /api/products:",
        error
      );

      /*
       * Protección adicional contra
       * conflictos de índices únicos.
       */
      if (
        error.code === "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "El SKU o código de barras ya está asignado a otro producto.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error:
            error.message,
          details:
            error.details,
          hint:
            error.hint,
          code:
            error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          "Producto guardado correctamente.",
        product: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "ERROR INTERNO EN POST /api/products:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}