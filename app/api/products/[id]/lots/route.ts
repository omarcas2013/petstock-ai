import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Faltan las variables de Supabase.");
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function getAuthenticatedUser() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserStoreId(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
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

async function getUserRole() {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("get_my_role");

  if (error) {
    throw new Error(
      `No se pudo verificar el rol del usuario: ${error.message}`
    );
  }

  return data as string | null;
}

function canManageLots(role: string | null) {
  return ["owner", "admin", "manager"].includes(role || "");
}

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

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}

function isValidDate(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
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
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const storeId = await getUserStoreId(user.id);

    const supabase = getSupabaseAdmin();

    /*
     * Primero verificamos que el producto
     * pertenezca a la tienda.
     */
    const {
      data: product,
      error: productError,
    } = await supabase
      .from("products")
      .select("id, name, sku, stock")
      .eq("id", id)
      .eq("store_id", storeId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        {
          error: "Producto no encontrado.",
        },
        { status: 404 }
      );
    }

    /*
     * Obtenemos los lotes.
     */
    const {
      data: lots,
      error: lotsError,
    } = await supabase
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
      .eq("store_id", storeId)
      .eq("product_id", id)
      .order("expiration_date", {
        ascending: true,
        nullsFirst: false,
      })
      .order("lot_number", {
        ascending: true,
      });

    if (lotsError) {
      return NextResponse.json(
        {
          error: lotsError.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      product,
      lots: lots || [],
    });
  } catch (error) {
    console.error(
      "ERROR OBTENIENDO LOTES:",
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
| POST /api/products/[id]/lots
|--------------------------------------------------------------------------
*/

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const role = await getUserRole();

    if (!canManageLots(role)) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para gestionar lotes.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await request.json();

    const storeId = await getUserStoreId(user.id);

    const supabase = getSupabaseAdmin();

    /*
     * Verificar producto.
     */
    const {
      data: product,
      error: productError,
    } = await supabase
      .from("products")
      .select("id, name, stock")
      .eq("id", id)
      .eq("store_id", storeId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        {
          error: "Producto no encontrado.",
        },
        { status: 404 }
      );
    }

    /*
     * Número de lote.
     */
    const lotNumber = normalizeText(
      body.lot_number
    );

    if (!lotNumber) {
      return NextResponse.json(
        {
          error:
            "El número de lote es obligatorio.",
        },
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
        {
          error:
            "La cantidad del lote no es válida.",
        },
        { status: 400 }
      );
    }

    /*
     * Fechas.
     */
    const manufacturingDate =
      normalizeText(
        body.manufacturing_date
      );

    const expirationDate =
      normalizeText(
        body.expiration_date
      );

    if (
      !isValidDate(manufacturingDate)
    ) {
      return NextResponse.json(
        {
          error:
            "La fecha de fabricación no es válida.",
        },
        { status: 400 }
      );
    }

    if (
      !isValidDate(expirationDate)
    ) {
      return NextResponse.json(
        {
          error:
            "La fecha de vencimiento no es válida.",
        },
        { status: 400 }
      );
    }

    /*
     * La fabricación no puede ser posterior
     * al vencimiento.
     */
    if (
      manufacturingDate &&
      expirationDate
    ) {
      const manufacturing =
        new Date(
          `${manufacturingDate}T00:00:00`
        );

      const expiration =
        new Date(
          `${expirationDate}T00:00:00`
        );

      if (
        manufacturing > expiration
      ) {
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
    const {
      data: existingLot,
      error: existingLotError,
    } = await supabase
      .from("product_lots")
      .select("id")
      .eq("store_id", storeId)
      .eq("product_id", id)
      .eq("lot_number", lotNumber)
      .maybeSingle();

    if (existingLotError) {
      return NextResponse.json(
        {
          error:
            existingLotError.message,
        },
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
    const {
      data: lot,
      error: lotError,
    } = await supabase
      .from("product_lots")
      .insert({
        store_id: storeId,
        product_id: id,
        lot_number: lotNumber,
        manufacturing_date:
          manufacturingDate,
        expiration_date:
          expirationDate,
        quantity,
        is_active: isActive,
      })
      .select()
      .single();

    if (lotError) {
      console.error(
        "ERROR CREANDO LOTE:",
        lotError
      );

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
        {
          error: lotError.message,
          details: lotError.details,
          hint: lotError.hint,
          code: lotError.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          "Lote creado correctamente.",
        lot,
        stock_unchanged: true,
        product_stock: product.stock,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "ERROR CREANDO LOTE:",
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