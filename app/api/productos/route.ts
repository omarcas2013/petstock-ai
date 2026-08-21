import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    console.log("POST /api/products recibido");

    const body = await request.json();

    console.log("Datos recibidos:", body);

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;
      console.log(
    "TIPO DE CLAVE:",
    supabaseSecretKey?.startsWith("sb_secret_")
    ? "SECRET KEY"
    : supabaseSecretKey?.startsWith("sb_publishable_")
      ? "PUBLISHABLE KEY"
      : "OTRA CLAVE"
);
      console.log(
      "SECRET KEY CARGADA:",
      !!supabaseSecretKey
    );

    if (!supabaseUrl || !supabaseSecretKey) {
      console.error("Faltan variables de Supabase");

      return NextResponse.json(
        {
          error: "Faltan las variables de Supabase.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
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

    const { data, error } = await supabase
      .from("products")
      .insert({
        name: body.name,
        brand: body.brand,
        category: body.category,
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
        error: "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}