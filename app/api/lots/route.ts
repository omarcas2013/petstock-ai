import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-role";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/*
 * Tanda 5: lotes activos con unidades de toda la tienda, con su
 * producto. Lo usan el punto de venta (aviso de vencidos), el dashboard
 * y el inventario (alertas de "por vencer").
 *
 * Si el negocio no maneja lotes, responde una lista vacía.
 */
export async function GET() {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data: store } = await supabase
      .from("stores")
      .select("manages_lots")
      .eq("id", profile.store_id)
      .maybeSingle();

    if (store?.manages_lots !== true) {
      return NextResponse.json({ manages_lots: false, lots: [] });
    }

    const { data: lots, error } = await fetchAllRows((from, to) =>
      supabase
        .from("product_lots")
        .select(
          `
            id,
            product_id,
            lot_number,
            expiration_date,
            quantity,
            products ( id, name, sku, stock, manages_lots, is_active )
          `
        )
        .eq("store_id", profile.store_id)
        .eq("is_active", true)
        .gt("quantity", 0)
        .order("expiration_date", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, to)
    );

    if (error) {
      console.error("ERROR OBTENIENDO LOTES:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener los lotes." },
        { status: 500 }
      );
    }

    return NextResponse.json({ manages_lots: true, lots: lots ?? [] });
  } catch (error) {
    console.error("Error GET /api/lots:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
