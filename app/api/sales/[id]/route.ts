
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
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

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "No se proporcionó el ID de la venta.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

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
        .single();

    if (error) {
      console.error(
        "ERROR OBTENIENDO VENTA:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo encontrar la venta.",
        },
        { status: 404 }
      );
    }

    if (!data) {
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

