import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request
) {
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
      barcode,
      movement_type,
      quantity,
      reason,
    } = body;

    if (!barcode) {
      return NextResponse.json(
        { error: "Falta el código de barras." },
        { status: 400 }
      );
    }

    if (
      !["entrada", "salida"].includes(
        movement_type
      )
    ) {
      return NextResponse.json(
        {
          error:
            "El escáner solamente permite entradas y salidas.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "La cantidad debe ser mayor que 0.",
        },
        { status: 400 }
      );
    }

    /*
     * Buscar producto por código de barras.
     */
    const { data: product, error: productError } =
      await supabase
        .from("products")
        .select(`
          id,
          store_id,
          name,
          brand,
          category,
          pet_type,
          presentation,
          sku,
          barcode,
          stock,
          minimum_stock,
          maximum_stock,
          sale_price,
          purchase_price,
          suppliers (
            id,
            name
          )
        `)
        .eq("barcode", barcode)
        .single();

    if (productError || !product) {
      return NextResponse.json(
        {
          error:
            "No se encontró un producto con ese código de barras.",
        },
        { status: 404 }
      );
    }

    /*
     * Registrar movimiento utilizando la función
     * centralizada de PostgreSQL.
     */
    const { data: movement, error } =
      await supabase.rpc(
        "register_inventory_movement",
        {
          p_product_id: product.id,
          p_movement_type: movement_type,
          p_quantity: quantity,
          p_reason: reason || null,
          p_store_id: product.store_id,
        }
      );

    if (error) {
      console.error(
        "Error registrando movimiento por barcode:",
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

    /*
     * Obtener nuevamente el producto para devolver
     * el stock actualizado.
     */
    const { data: updatedProduct, error: updatedError } =
      await supabase
        .from("products")
        .select(`
          id,
          name,
          brand,
          category,
          pet_type,
          presentation,
          sku,
          barcode,
          stock,
          minimum_stock,
          maximum_stock,
          sale_price,
          purchase_price,
          suppliers (
            id,
            name
          )
        `)
        .eq("id", product.id)
        .single();

    if (updatedError || !updatedProduct) {
      return NextResponse.json({
        ok: true,
        movement,
        product: product,
      });
    }

    return NextResponse.json({
      ok: true,
      movement,
      product: updatedProduct,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}