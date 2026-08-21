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
    console.log("GET /api/products recibido");

    const supabase = getSupabase();

    const { data, error } = await supabase
  .from("products")
  .select(`
    *,
    suppliers (
      id,
      name
    )
  `)
  .order("created_at", { ascending: false });

    if (error) {
      console.error("ERROR DE SUPABASE EN GET:");
      console.error(error);

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

    console.log(
      "PRODUCTOS OBTENIDOS:",
      data?.length ?? 0
    );

    return NextResponse.json({
      products: data || [],
    });
  } catch (error) {
    console.error("ERROR INTERNO EN GET:");
    console.error(error);

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
    console.log("POST /api/products recibido");

    const body = await request.json();

    console.log("Datos recibidos:", body);

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("products")
      .insert({
        name: body.name,
        brand: body.brand,
        category: body.category,
        supplier_id: body.supplier_id || null,
        pet_type: body.pet_type,
        presentation: body.presentation,
        sku: body.sku,
        purchase_price:
          Number(body.purchase_price) || 0,
        sale_price:
          Number(body.sale_price) || 0,
        stock:
          Number(body.stock) || 0,
        minimum_stock:
          Number(body.minimum_stock) || 0,
        maximum_stock:
          body.maximum_stock === ""
            ? null
            : Number(body.maximum_stock),
      })
      .select()
      .single();

    if (error) {
      console.error("ERROR DE SUPABASE:");
      console.error(error);

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

    console.log("PRODUCTO GUARDADO EN SUPABASE:");
    console.log(data);

    return NextResponse.json(
      {
        ok: true,
        message: "Producto guardado correctamente",
        product: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR INTERNO:");
    console.error(error);

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
