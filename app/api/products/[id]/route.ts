import { NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

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
| GET /api/products/[id]
|--------------------------------------------------------------------------
*/

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { id } = await context.params;

    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        suppliers (
          id,
          name
        )
      `)
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      product: hideCostIfNeeded(data, profile.role),
    });
  } catch (error) {
    console.error("ERROR OBTENIENDO PRODUCTO:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PUT /api/products/[id]
|--------------------------------------------------------------------------
*/

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { id } = await context.params;

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
    | PROTEGER STOCK
    |--------------------------------------------------------------------------
    |
    | No permitimos enviar stock desde edición.
    |
    */

    if (
      body.stock !== undefined ||
      body.newStock !== undefined
    ) {
      return NextResponse.json(
        {
          error:
            "El stock no se modifica desde la edición del producto. Utiliza un movimiento de inventario.",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PRODUCTO ACTUAL
    |--------------------------------------------------------------------------
    */

    const { data: currentProduct, error: currentError } =
      await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("store_id", profile.store_id)
        .single();

    if (currentError || !currentProduct) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
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

    const description = normalizeText(body.description);
    const brand = normalizeText(body.brand);
    const category = normalizeText(body.category);
    const subcategory = normalizeText(body.subcategory);
    const supplierId = normalizeText(body.supplier_id);
    const petType = normalizeText(body.pet_type);
    const presentation = normalizeText(body.presentation);

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
    | INVENTARIO
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
          .neq("id", id)
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
          .neq("id", id)
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
    | ESTADO
    |--------------------------------------------------------------------------
    */

    const isActive =
      typeof body.is_active === "boolean"
        ? body.is_active
        : currentProduct.is_active;

    const managesLots =
      typeof body.manages_lots === "boolean"
        ? body.manages_lots
        : currentProduct.manages_lots;

    /*
    |--------------------------------------------------------------------------
    | ACTUALIZAR PRODUCTO
    |--------------------------------------------------------------------------
    |
    | OBSERVA:
    | NO incluimos stock.
    |
    */

    const { data, error } = await supabase
      .from("products")
      .update({
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
        is_active: isActive,
        manages_lots: managesLots,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .select()
      .single();

    if (error) {
      console.error("ERROR ACTUALIZANDO PRODUCTO:", error);

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
        { error: "No se pudo actualizar el producto." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Producto actualizado correctamente.",
      product: data,
    });
  } catch (error) {
    console.error("ERROR INTERNO:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
