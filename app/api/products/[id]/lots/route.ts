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
     * Verificar lote duplicado.
     */
    const { data: existingLot, error: existingLotError } =
      await supabase
        .from("product_lots")
        .select("id")
        .eq("store_id", profile.store_id)
        .eq("product_id", id)
        .eq("lot_number", lotNumber)
        .maybeSingle();

    if (existingLotError) {
      console.error(
        "ERROR VALIDANDO LOTE DUPLICADO:",
        existingLotError
      );

      return NextResponse.json(
        { error: "No se pudo validar el número de lote." },
        { status: 400 }
      );
    }

    if (existingLot) {
      return NextResponse.json(
        {
          error:
            "Este número de lote ya existe para este producto.",
        },
        { status: 409 }
      );
    }

    /*
     * Estado.
     */
    const isActive =
      typeof body.is_active === "boolean"
        ? body.is_active
        : true;

    /*
     * CREAR LOTE.
     *
     * No actualizamos products.stock.
     */
    const { data: lot, error: lotError } = await supabase
      .from("product_lots")
      .insert({
        store_id: profile.store_id,
        product_id: id,
        lot_number: lotNumber,
        manufacturing_date: manufacturingDate,
        expiration_date: expirationDate,
        quantity,
        is_active: isActive,
      })
      .select()
      .single();

    if (lotError) {
      console.error("ERROR CREANDO LOTE:", lotError);

      if (lotError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Este número de lote ya existe para este producto.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo crear el lote." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Lote creado correctamente.",
        lot,
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
