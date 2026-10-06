import { NextResponse } from "next/server";
import {
  buildProductSelect,
  flattenProductCost,
  type ProductRow,
} from "@/lib/products/select";
import {
  CATALOG_WRITE_ROLES,
  COST_VIEW_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function parseNonNegativeNumber(value: unknown) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function parseNonNegativeInteger(value: unknown) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    return null;
  }

  return number;
}

/**
 * Si el campo viene en el body, lo parsea con `parse` (null = valor
 * inválido, lo que dispara el error correspondiente). Si no viene
 * (undefined), conserva el valor actual en vez de caer a 0/null.
 */
function fieldOrCurrent<T>(
  value: unknown,
  current: T,
  parse: (value: unknown) => T | null
): T | null {
  return value === undefined ? current : parse(value);
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

    const canViewCost = COST_VIEW_ROLES.includes(profile.role);

    const { data, error } = await supabase
      .from("products")
      .select(
        buildProductSelect({
          includeCost: canViewCost,
          extra: "suppliers ( id, name )",
        })
      )
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .single() as unknown as {
        data: ProductRow | null;
        error: { message: string } | null;
      };

    if (error || !data) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      product: flattenProductCost(data),
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
    | PRODUCTO ACTUAL (+ costo actual, para conservarlo si no viene)
    |--------------------------------------------------------------------------
    */

    const { data: currentProduct, error: currentError } =
      await supabase
        .from("products")
        .select(
          buildProductSelect({
            includeCost: true,
          })
        )
        .eq("id", id)
        .eq("store_id", profile.store_id)
        .single() as unknown as {
          data: ProductRow | null;
          error: { message: string } | null;
        };

    if (currentError || !currentProduct) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    const current = flattenProductCost(currentProduct);

    /*
    |--------------------------------------------------------------------------
    | DATOS BÁSICOS
    |--------------------------------------------------------------------------
    |
    | Si un campo no viene en el body (undefined), se conserva el
    | valor actual del producto en vez de limpiarlo o ponerlo en 0.
    |
    */

    const name =
      body.name !== undefined
        ? normalizeText(body.name)
        : current.name;

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del producto es obligatorio." },
        { status: 400 }
      );
    }

    const description =
      body.description !== undefined
        ? normalizeText(body.description)
        : current.description;

    const brand =
      body.brand !== undefined
        ? normalizeText(body.brand)
        : current.brand;

    const category =
      body.category !== undefined
        ? normalizeText(body.category)
        : current.category;

    const subcategory =
      body.subcategory !== undefined
        ? normalizeText(body.subcategory)
        : current.subcategory;

    const supplierId =
      body.supplier_id !== undefined
        ? normalizeText(body.supplier_id)
        : current.supplier_id;

    const petType =
      body.pet_type !== undefined
        ? normalizeText(body.pet_type)
        : current.pet_type;

    const presentation =
      body.presentation !== undefined
        ? normalizeText(body.presentation)
        : current.presentation;

    const unitOfMeasure =
      body.unit_of_measure !== undefined
        ? normalizeText(body.unit_of_measure) || "unidad"
        : current.unit_of_measure;

    const sku =
      body.sku !== undefined
        ? normalizeText(body.sku)
        : current.sku;

    const barcode =
      body.barcode !== undefined
        ? normalizeText(body.barcode)
        : current.barcode;

    const imageUrl =
      body.image_url !== undefined
        ? normalizeText(body.image_url)
        : current.image_url;

    /*
    |--------------------------------------------------------------------------
    | PRECIOS
    |--------------------------------------------------------------------------
    |
    | purchase_price ya no vive en products: se maneja aparte, en
    | product_costs, después de actualizar el producto (ver abajo).
    |
    */

    const purchasePrice = fieldOrCurrent(
      body.purchase_price,
      current.purchase_price ?? 0,
      parseNonNegativeNumber
    );

    const salePrice = fieldOrCurrent(
      body.sale_price,
      current.sale_price,
      parseNonNegativeNumber
    );

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
      body.tax_type !== undefined
        ? body.tax_type === "exento"
          ? "exento"
          : "porcentaje"
        : current.tax_type;

    let taxRate = fieldOrCurrent(
      body.tax_rate,
      current.tax_rate,
      parseNonNegativeNumber
    );

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

    const minimumStock = fieldOrCurrent(
      body.minimum_stock,
      current.minimum_stock,
      parseNonNegativeInteger
    );

    const reorderPoint = fieldOrCurrent(
      body.reorder_point,
      current.reorder_point,
      parseNonNegativeInteger
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

    let maximumStock: number | null = current.maximum_stock;

    if (body.maximum_stock !== undefined) {
      if (
        body.maximum_stock === "" ||
        body.maximum_stock === null
      ) {
        maximumStock = null;
      } else {
        maximumStock = parseNonNegativeInteger(
          body.maximum_stock
        );

        if (maximumStock === null) {
          return NextResponse.json(
            { error: "El stock máximo no es válido." },
            { status: 400 }
          );
        }
      }
    }

    if (
      maximumStock !== null &&
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
        : current.is_active;

    const managesLots =
      typeof body.manages_lots === "boolean"
        ? body.manages_lots
        : current.manages_lots;

    /*
    |--------------------------------------------------------------------------
    | ACTUALIZAR PRODUCTO
    |--------------------------------------------------------------------------
    |
    | OBSERVA:
    | NO incluimos stock ni purchase_price.
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
      .select(
        buildProductSelect({
          includeCost: false,
          extra: "suppliers ( id, name )",
        })
      )
      .single() as unknown as {
        data: ProductRow | null;
        error: { code?: string; message: string } | null;
      };

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

      // Tanda 5: los avisos de negocio (P0001, por ejemplo "Activa
      // primero el manejo de lotes...") sí se muestran.
      return NextResponse.json(
        { error: rpcErrorMessage(error, "No se pudo actualizar el producto.") },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GUARDAR COSTO
    |--------------------------------------------------------------------------
    |
    | Solo si purchase_price vino en el body: de lo contrario este
    | upsert reescribiría product_costs en cada edición del producto
    | (incluso al cambiar solo el nombre), con el riesgo de pisar un
    | costo que otra persona haya actualizado al mismo tiempo con un
    | valor que aquí solo es "el que tenía al leer el producto".
    |
    | Upsert y no update simple: si por lo que sea el producto no
    | tenía fila en product_costs todavía (productos creados antes
    | del backfill de la fase A, por ejemplo), esto la crea.
    |
    */

    let costWarning: string | null = null;

    if (body.purchase_price !== undefined) {
      const { error: costError } = await supabase
        .from("product_costs")
        .upsert(
          {
            product_id: id,
            store_id: profile.store_id,
            purchase_price: purchasePrice,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "product_id" }
        );

      if (costError) {
        console.error(
          "ERROR GUARDANDO COSTO DEL PRODUCTO:",
          costError
        );

        /*
         * El producto SÍ se actualizó (el update de arriba ya tuvo
         * éxito): un 400 aquí haría pensar que la edición completa
         * falló. Se responde 200 con un aviso en vez de un error.
         */
        costWarning =
          "El producto se actualizó, pero no se pudo guardar el costo de compra. Inténtalo de nuevo.";
      }
    }

    return NextResponse.json({
      ok: true,
      ...(costWarning ? { warning: costWarning } : {}),
      message: "Producto actualizado correctamente.",
      product: {
        ...data,
        purchase_price: costWarning
          ? current.purchase_price ?? 0
          : purchasePrice,
      },
    });
  } catch (error) {
    console.error("ERROR INTERNO:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
