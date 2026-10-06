import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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

    const canViewCost = COST_VIEW_ROLES.includes(profile.role);

    const select = buildProductSelect({
      includeCost: canViewCost,
      extra: "suppliers ( id, name )",
    });

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
        .select(select)
        .eq("store_id", profile.store_id)
        .eq("barcode", barcode)
        .maybeSingle() as unknown as {
          data: ProductRow | null;
          error: { message: string } | null;
        };

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
        product: flattenProductCost(data),
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
        .select(select)
        .eq("store_id", profile.store_id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ) as unknown as {
      data: ProductRow[] | null;
      error: { message: string } | null;
    };

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
      products: (data || []).map(flattenProductCost),
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
    |
    | El costo de compra (purchase_price) ya NO vive en products: se
    | guarda en product_costs, después de crear el producto (ver más
    | abajo). CATALOG_WRITE_ROLES y COST_VIEW_ROLES son el mismo
    | conjunto de roles (owner/admin/manager), así que quien llega
    | hasta aquí siempre puede fijar el costo.
    |
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
    |
    | purchase_price ya no se envía aquí: products.purchase_price no
    | se toca (sigue existiendo hasta la fase B, pero ninguna ruta
    | debe leerla ni escribirla). El costo se guarda aparte, abajo.
    |
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

      // Tanda 5: los avisos de negocio (P0001, por ejemplo "Activa
      // primero el manejo de lotes...") sí se muestran.
      return NextResponse.json(
        { error: rpcErrorMessage(error, "No se pudo crear el producto.") },
        { status: 400 }
      );
    }

    if (!data) {
      console.error(
        "POST /api/products: insert sin error pero sin datos."
      );

      return NextResponse.json(
        { error: "No se pudo crear el producto." },
        { status: 500 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GUARDAR COSTO
    |--------------------------------------------------------------------------
    |
    | Upsert, no insert: el trigger sync_product_costs_trigger (tanda 3,
    | migración product_costs_fase_a) ya pudo haber creado esta fila
    | con costo 0 al insertar el producto (sigue copiando desde
    | products.purchase_price mientras ese trigger exista, y acá no la
    | tocamos, así que queda en su valor por defecto).
    |
    */

    const { error: costError } = await supabase
      .from("product_costs")
      .upsert(
        {
          product_id: data.id,
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
       * El producto SÍ se creó (el insert de arriba ya tuvo éxito):
       * devolver 400 aquí hacía pensar al cliente que la creación
       * completa había fallado, arriesgando un reintento que
       * duplicara el producto. En vez de eso, 201 con un aviso; el
       * costo real que quedó guardado es el que puso el trigger de
       * sincronización (0, no el que pidió el usuario), así que se
       * consulta para no informar un valor que no es el real.
       */
      const { data: actualCost } = await supabase
        .from("product_costs")
        .select("purchase_price")
        .eq("product_id", data.id)
        .maybeSingle();

      return NextResponse.json(
        {
          ok: true,
          warning:
            "El producto se creó, pero no se pudo guardar el costo de compra. Edítalo para intentarlo de nuevo.",
          message: "Producto guardado correctamente.",
          product: {
            ...data,
            purchase_price: Number(
              actualCost?.purchase_price ?? 0
            ),
          },
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Producto guardado correctamente.",
        product: { ...data, purchase_price: purchasePrice },
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
