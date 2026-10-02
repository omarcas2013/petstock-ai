import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

/*
|--------------------------------------------------------------------------
| NORMALIZADORES
|--------------------------------------------------------------------------
*/

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

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

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
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

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    return null;
  }

  return number;
}

/**
 * employee no puede ver el costo de compra (matriz de roles).
 */
function hideCostIfNeeded<T extends { purchase_price?: unknown }>(
  product: T,
  role: string
): T {
  if (role !== "employee") {
    return product;
  }

  const withoutCost: Record<string, unknown> = { ...product };

  delete withoutCost.purchase_price;

  return withoutCost as T;
}

/*
|--------------------------------------------------------------------------
| GET /api/products
|--------------------------------------------------------------------------
*/

export async function GET(request: Request) {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const barcode = searchParams.get("barcode")?.trim();

    /*
    |--------------------------------------------------------------------------
    | BUSCAR POR BARCODE
    |--------------------------------------------------------------------------
    */

    if (barcode) {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `)
        .eq("store_id", profile.store_id)
        .eq("barcode", barcode)
        .maybeSingle();

      if (error) {
        console.error(
          "ERROR BUSCANDO PRODUCTO POR BARCODE:",
          error
        );

        return NextResponse.json(
          { error: "No se pudo buscar el producto." },
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
        product: hideCostIfNeeded(data, profile.role),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | LISTAR PRODUCTOS
    |--------------------------------------------------------------------------
    */

    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from("products")
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `)
        .eq("store_id", profile.store_id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (error) {
      console.error(
        "ERROR DE SUPABASE EN GET /api/products:",
        error
      );

      return NextResponse.json(
        { error: "No se pudieron obtener los productos." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      products: (data || []).map((product) =>
        hideCostIfNeeded(product, profile.role)
      ),
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO EN GET /api/products:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/products
|--------------------------------------------------------------------------
*/

export async function POST(request: Request) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STOCK
    |--------------------------------------------------------------------------
    |
    | El stock NO se crea desde este endpoint.
    | Un producto nuevo comienza en 0.
    |
    */

    if (body.stock !== undefined) {
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

    const name = normalizeText(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del producto es obligatorio." },
        { status: 400 }
      );
    }

    const brand = normalizeText(body.brand);
    const category = normalizeText(body.category);
    const subcategory = normalizeText(body.subcategory);
    const description = normalizeText(body.description);
    const presentation = normalizeText(body.presentation);
    const petType = normalizeText(body.pet_type);

    const unitOfMeasure =
      normalizeText(body.unit_of_measure) || "unidad";

    const sku = normalizeText(body.sku);
    const barcode = normalizeText(body.barcode);
    const imageUrl = normalizeText(body.image_url);

    /*
    |--------------------------------------------------------------------------
    | PRECIOS
    |--------------------------------------------------------------------------
    */

    const purchasePrice = parseNonNegativeNumber(
      body.purchase_price,
      0
    );

    const salePrice = parseNonNegativeNumber(body.sale_price, 0);

    if (purchasePrice === null) {
      return NextResponse.json(
        { error: "El precio de compra no es válido." },
        { status: 400 }
      );
    }

    if (salePrice === null) {
      return NextResponse.json(
        { error: "El precio de venta no es válido." },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | IMPUESTOS
    |--------------------------------------------------------------------------
    */

    const taxType =
      body.tax_type === "exento" ? "exento" : "porcentaje";

    let taxRate = parseNonNegativeNumber(body.tax_rate, 0);

    if (taxRate === null) {
      return NextResponse.json(
        { error: "La tasa de impuesto no es válida." },
        { status: 400 }
      );
    }

    if (taxType === "exento") {
      taxRate = 0;
    }

    if (taxRate < 0 || taxRate > 100) {
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

    const minimumStock = parseNonNegativeInteger(
      body.minimum_stock,
      0
    );

    const reorderPoint = parseNonNegativeInteger(
      body.reorder_point,
      0
    );

    if (minimumStock === null) {
      return NextResponse.json(
        { error: "El stock mínimo no es válido." },
        { status: 400 }
      );
    }

    if (reorderPoint === null) {
      return NextResponse.json(
        { error: "El punto de reposición no es válido." },
        { status: 400 }
      );
    }

    let maximumStock: number | null = null;

    if (
      body.maximum_stock !== "" &&
      body.maximum_stock !== null &&
      body.maximum_stock !== undefined
    ) {
      maximumStock = parseNonNegativeInteger(
        body.maximum_stock
      );

      if (maximumStock === null) {
        return NextResponse.json(
          { error: "El stock máximo no es válido." },
          { status: 400 }
        );
      }

      if (maximumStock < minimumStock) {
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

    const supplierId = normalizeText(body.supplier_id);

    if (supplierId) {
      const { data: supplier, error: supplierError } =
        await supabase
          .from("suppliers")
          .select("id")
          .eq("id", supplierId)
          .eq("store_id", profile.store_id)
          .maybeSingle();

      if (supplierError) {
        console.error(
          "ERROR VALIDANDO PROVEEDOR:",
          supplierError
        );

        return NextResponse.json(
          { error: "No se pudo validar el proveedor." },
          { status: 400 }
        );
      }

      if (!supplier) {
        return NextResponse.json(
          { error: "El proveedor no pertenece a tu tienda." },
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
      const { data: existingSku, error: skuError } =
        await supabase
          .from("products")
          .select("id, name")
          .eq("store_id", profile.store_id)
          .eq("sku", sku)
          .maybeSingle();

      if (skuError) {
        console.error("ERROR VALIDANDO SKU:", skuError);

        return NextResponse.json(
          { error: "No se pudo validar el SKU." },
          { status: 400 }
        );
      }

      if (existingSku) {
        return NextResponse.json(
          {
            error:
              "Este SKU ya está asignado a otro producto.",
            product: existingSku,
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
      const { data: existingBarcode, error: barcodeError } =
        await supabase
          .from("products")
          .select("id, name")
          .eq("store_id", profile.store_id)
          .eq("barcode", barcode)
          .maybeSingle();

      if (barcodeError) {
        console.error(
          "ERROR VALIDANDO CÓDIGO DE BARRAS:",
          barcodeError
        );

        return NextResponse.json(
          { error: "No se pudo validar el código de barras." },
          { status: 400 }
        );
      }

      if (existingBarcode) {
        return NextResponse.json(
          {
            error:
              "Este código de barras ya está asignado a otro producto.",
            product: existingBarcode,
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

    const { data, error } = await supabase
      .from("products")
      .insert({
        store_id: profile.store_id,
        name,
        description,
        brand,
        category,
        subcategory,
        supplier_id: supplierId,
        pet_type: petType,
        presentation,
        unit_of_measure: unitOfMeasure,
        sku,
        barcode,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        tax_rate: taxRate,
        tax_type: taxType,
        minimum_stock: minimumStock,
        maximum_stock: maximumStock,
        reorder_point: reorderPoint,
        is_active: true,
        manages_lots: body.manages_lots === true,
        image_url: imageUrl,

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
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "El SKU o código de barras ya está asignado a otro producto.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo crear el producto." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Producto guardado correctamente.",
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
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
