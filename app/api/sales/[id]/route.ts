import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createClient as createServerSupabase,
} from "@/lib/supabase/server";

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

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
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

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "No se proporcionó el ID de la venta.",
        },
        { status: 400 }
      );
    }

    const storeId =
      await getUserStoreId(user.id);

    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase
        .from("sales")
        .select(
          `
          id,
          store_id,
          customer_name,
          payment_method,
          subtotal,
          total,
          created_at,
          sale_items (
            id,
            sale_id,
            product_id,
            quantity,
            unit_price,
            subtotal,
            created_at,
            products (
              id,
              sku,
              name
            )
          )
        `
        )
        .eq("id", id)
        .eq("store_id", storeId)
        .single();

    if (error || !data) {
      console.error(
        "ERROR OBTENIENDO VENTA:",
        error
      );

      return NextResponse.json(
        {
          error:
            "La venta no existe.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        sale: data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "ERROR INTERNO DETALLE VENTA:",
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