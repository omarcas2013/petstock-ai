import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Faltan las variables de Supabase.");
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

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("inventory_movements")
      .select(`
        id,
        product_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        reason,
        created_at,
        products (
          name,
          sku
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "ERROR CARGANDO MOVIMIENTOS:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      movements: data || [],
    });
  } catch (error) {
    console.error("ERROR INTERNO:", error);

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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supabase = getSupabase();

    const {
      product_id,
      movement_type,
      quantity,
      reason,
    } = body;

    if (!product_id) {
      return NextResponse.json(
        { error: "Falta product_id." },
        { status: 400 }
      );
    }

    if (!movement_type) {
      return NextResponse.json(
        { error: "Falta movement_type." },
        { status: 400 }
      );
    }

    const numericQuantity = Number(quantity);

if (
  movement_type === "ajuste"
    ? (
        quantity === "" ||
        quantity === null ||
        quantity === undefined ||
        numericQuantity < 0
      )
    : (!numericQuantity || numericQuantity <= 0)
) {
  return NextResponse.json(
    {
      error:
        movement_type === "ajuste"
          ? "El nuevo stock no puede ser negativo."
          : "La cantidad debe ser mayor que 0.",
    },
    { status: 400 }
  );
}

    const { data, error } = await supabase.rpc(
      "register_inventory_movement",
      {
        p_product_id: product_id,
        p_movement_type: movement_type,
        p_quantity: numericQuantity,
        p_reason: reason || null,
      }
    );

    if (error) {
      console.error(
        "ERROR DE MOVIMIENTO:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        movement: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR INTERNO:", error);

    return NextResponse.json(
      {
        error: "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}