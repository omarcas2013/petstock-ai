import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-role";

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

    if (!id) {
      return NextResponse.json(
        { error: "No se proporcionó el ID de la venta." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
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
      .eq("store_id", profile.store_id)
      .single();

    if (error || !data) {
      console.error("ERROR OBTENIENDO VENTA:", error);

      return NextResponse.json(
        { error: "La venta no existe." },
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
    console.error("ERROR INTERNO DETALLE VENTA:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
