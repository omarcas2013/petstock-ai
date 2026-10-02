import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { requireUser } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from("sales")
        .select(`
          id,
          store_id,
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
              name,
              sku
            )
          )
        `)
        .eq("store_id", profile.store_id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (error) {
      console.error(
        "ERROR CARGANDO HISTORIAL DE VENTAS:",
        error
      );

      return NextResponse.json(
        { error: "No se pudo cargar el historial de ventas." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sales: data || [],
    });
  } catch (error) {
    console.error("ERROR INTERNO:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
