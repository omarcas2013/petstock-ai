import { NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
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

function isValidDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

/*
|--------------------------------------------------------------------------
| GET /api/products/[id]/lots
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

    /*
     * Primero verificamos que el producto
     * pertenezca a la tienda.
     */
    const { data: product, error: productError } =
      await supabase
        .from("products")
        .select("id, name, sku, stock")
        .eq("id", id)
        .eq("store_id", profile.store_id)
        .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    /*
     * Obtenemos los lotes.
     */
    const { data: lots, error: lotsError } = await supabase
      .from("product_lots")
      .select(`
        id,
        product_id,
        lot_number,
        manufacturing_date,
        expiration_date,
        quantity,
        is_active,
        created_at,
        updated_at
      `)
      .eq("store_id", profile.store_id)
      .eq("product_id", id)
      .order("expiration_date", {
        ascending: true,
        nullsFirst: false,
      })
      .order("lot_number", { ascending: true });

    if (lotsError) {
      console.error("ERROR OBTENIENDO LOTES:", lotsError);

      return NextResponse.json(
        { error: "No se pudieron obtener los lotes." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      product,
      lots: lots || [],
    });
  } catch (error) {
    console.error("ERROR OBTENIENDO LOTES:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/products/[id]/lots
|--------------------------------------------------------------------------
*/

export async function POST(
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
     * Verificar producto.
     */
    const { data: product, error: productError } =
      await supabase
        .from("products")
        .select("id, name, stock")
        .eq("id", id)
        .eq("store_id", profile.store_id)
        .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    /*
     * Número de lote.
     */
    const lotNumber = normalizeText(body.lot_number);

    if (!lotNumber) {
      return NextResponse.json(
        { error: "El número de lote es obligatorio." },
        { status: 400 }
      );
    }

    /*
     * Cantidad.
     *
     * IMPORTANTE:
     * Esto NO modifica products.stock.
     */
    const quantity = parseNonNegativeInteger(
      body.quantity,
      0
    );

    if (quantity === null) {
      return NextResponse.json(
        { error: "La cantidad del lote no es válida." },
        { status: 400 }
      );
    }

    /*
     * Fechas.
     */
    const manufacturingDate = normalizeText(
      body.manufacturing_date
    );

    const expirationDate = normalizeText(
      body.expiration_date
    );

    if (!isValidDate(manufacturingDate)) {
      return NextResponse.json(
        { error: "La fecha de fabricación no es válida." },
        { status: 400 }
      );
    }

    if (!isValidDate(expirationDate)) {
      return NextResponse.json(
        { error: "La fecha de vencimiento no es válida." },
        { status: 400 }
      );
    }

    /*
     * La fabricación no puede ser posterior
     * al vencimiento.
     */
    if (manufacturingDate && expirationDate) {
      const manufacturing = new Date(
        `${manufacturingDate}T00:00:00`
      );

      const expiration = new Date(
        `${expirationDate}T00:00:00`
      );

      if (manufacturing > expiration) {
        return NextResponse.json(
          {
            error:
              "La fecha de fabricación no puede ser posterior a la fecha de vencimiento.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * CREAR LOTE (tanda 5): vía create_product_lot, que valida que el
     * negocio y el producto manejen lotes, que el número no esté
     * repetido y que la cantidad salga de unidades "sin lote" (no
     * cambia products.stock).
     */
    const { data: created, error: lotError } = await supabase.rpc(
      "create_product_lot",
      {
        p_store_id: profile.store_id,
        p_product_id: id,
        p_lot_number: lotNumber,
        p_expiration_date: expirationDate,
        p_manufacturing_date: manufacturingDate,
        p_quantity: quantity,
      }
    );

    if (lotError) {
      console.error("ERROR CREANDO LOTE:", lotError);

      return NextResponse.json(
        {
          error: rpcErrorMessage(lotError, "No se pudo crear el lote."),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Lote creado correctamente.",
        lot_id: created?.lot_id ?? null,
        stock_unchanged: true,
        product_stock: product.stock,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR CREANDO LOTE:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}


/*
|--------------------------------------------------------------------------
| PATCH /api/products/[id]/lots   (tanda 5)
|--------------------------------------------------------------------------
|
| Body: { lot_id, quantity?, expiration_date?, is_active? }
| Bajar la cantidad pasa unidades a "sin lote"; subirla toma unidades
| "sin lote". Desactivar deja el lote en 0. No cambia products.stock.
*/

export async function PATCH(
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

    const lotId = normalizeText(body.lot_id);

    if (!lotId) {
      return NextResponse.json(
        { error: "Falta el lote." },
        { status: 400 }
      );
    }

    // El lote debe ser de este producto.
    const { data: lot, error: lotLookupError } = await supabase
      .from("product_lots")
      .select("id")
      .eq("id", lotId)
      .eq("product_id", id)
      .eq("store_id", profile.store_id)
      .maybeSingle();

    if (lotLookupError || !lot) {
      return NextResponse.json(
        { error: "Lote no encontrado." },
        { status: 404 }
      );
    }

    let quantity: number | null = null;

    if (body.quantity !== undefined && body.quantity !== null && body.quantity !== "") {
      quantity = parseNonNegativeInteger(body.quantity, 0);

      if (quantity === null) {
        return NextResponse.json(
          { error: "La cantidad del lote no es válida." },
          { status: 400 }
        );
      }
    }

    const expirationDate = normalizeText(body.expiration_date);

    if (!isValidDate(expirationDate)) {
      return NextResponse.json(
        { error: "La fecha de vencimiento no es válida." },
        { status: 400 }
      );
    }

    const isActive =
      typeof body.is_active === "boolean" ? body.is_active : null;

    const { data, error } = await supabase.rpc("update_product_lot", {
      p_store_id: profile.store_id,
      p_lot_id: lotId,
      p_quantity: quantity,
      p_expiration_date: expirationDate,
      p_is_active: isActive,
    });

    if (error) {
      console.error("ERROR ACTUALIZANDO LOTE:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(error, "No se pudo actualizar el lote."),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    console.error("ERROR ACTUALIZANDO LOTE:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
