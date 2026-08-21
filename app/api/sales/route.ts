
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

/*
|--------------------------------------------------------------------------
| GET /api/sales
|--------------------------------------------------------------------------
| Obtiene el historial de ventas con sus productos.
*/

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("sales")
      .select(`
        id,
        customer_name,
        payment_method,
        subtotal,
        total,
        created_at,
        sale_items (
          id,
          product_id,
          quantity,
          unit_price,
          subtotal,
          products (
            id,
            name,
            sku
          )
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "ERROR OBTENIENDO VENTAS:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sales: data || [],
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO:",
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
| POST /api/sales
|--------------------------------------------------------------------------
| Registra una venta mediante la función register_sale de Supabase.
*/

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const {
      items,
      payment_method,
      customer_name,
    } = body;

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "La venta debe contener al menos un producto.",
        },
        { status: 400 }
      );
    }

    if (
      typeof payment_method !== "string" ||
      !payment_method.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "El método de pago es obligatorio.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data, error } =
      await supabase.rpc(
        "register_sale",
        {
          p_items: items,
          p_payment_method:
            payment_method.trim(),
          p_customer_name:
            typeof customer_name ===
            "string"
              ? customer_name.trim() || null
              : null,
        }
      );

    if (error) {
      console.error(
        "ERROR REGISTRANDO VENTA:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        sale: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "ERROR INTERNO:",
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

