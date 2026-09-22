import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 }
      );
    }

    const { data: movements, error } = await supabase
      .from("inventory_movements")
      .select(`
        id,
        product_id,
        movement_type,
        quantity,
        reason,
        created_at,
        stock_before,
        stock_after,
        products (
          name,
          sku
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando movimientos:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      movements: movements ?? [],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 }
      );
    }

    const body = await request.json();

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

    if (
      !["entrada", "salida", "ajuste"].includes(
        movement_type
      )
    ) {
      return NextResponse.json(
        { error: "Tipo de movimiento no válido." },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return NextResponse.json(
        { error: "Cantidad no válida." },
        { status: 400 }
      );
    }

    /*
     * Obtener la tienda a la que pertenece
     * el producto.
     */
    const { data: product, error: productError } =
      await supabase
        .from("products")
        .select("id, store_id")
        .eq("id", product_id)
        .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    /*
     * Registrar movimiento mediante la función
     * PostgreSQL.
     */
    const { data: movement, error } =
      await supabase.rpc(
        "register_inventory_movement",
        {
          p_product_id: product_id,
          p_movement_type: movement_type,
          p_quantity: quantity,
          p_reason: reason || null,
          p_store_id: product.store_id,
        }
      );

    if (error) {
      console.error(
        "Error registrando movimiento:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo registrar el movimiento.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      movement,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}