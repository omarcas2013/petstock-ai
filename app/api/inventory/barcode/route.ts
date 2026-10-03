import { NextResponse } from "next/server";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";
import { flattenProductCost, type ProductRow } from "@/lib/products/select";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
    }

    const { barcode, movement_type, quantity, reason } = body;

    if (!barcode) {
      return NextResponse.json(
        { error: "Falta el código de barras." },
        { status: 400 }
      );
    }

    if (!["entrada", "salida"].includes(movement_type as string)) {
      return NextResponse.json(
        {
          error:
            "El escáner solamente permite entradas y salidas.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(quantity) || (quantity as number) <= 0) {
      return NextResponse.json(
        { error: "La cantidad debe ser mayor que 0." },
        { status: 400 }
      );
    }

    /*
     * Buscar producto por código de barras.
     *
     * maybeSingle(): si dos productos de la misma tienda quedaran con
     * el mismo código de barras, no queremos un 500 ni aplicar el
     * movimiento al primero que encuentre Postgres al azar.
     */
    const { data: products, error: productError } = await supabase
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
        product_costs ( purchase_price ),
        suppliers (
          id,
          name
        )
      `)
      .eq("barcode", barcode)
      .eq("store_id", profile.store_id) as unknown as {
        data: ProductRow[] | null;
        error: { message: string } | null;
      };

    if (productError) {
      console.error(
        "Error buscando producto por barcode:",
        productError
      );

      return NextResponse.json(
        { error: "No se pudo buscar el producto." },
        { status: 400 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se encontró un producto con ese código de barras.",
        },
        { status: 404 }
      );
    }

    if (products.length > 1) {
      return NextResponse.json(
        {
          error: `Código de barras duplicado: ${products.length} productos lo tienen asignado. Corrige el código de barras antes de continuar.`,
        },
        { status: 409 }
      );
    }

    const product = flattenProductCost(products[0]);

    /*
     * Registrar movimiento utilizando la función
     * centralizada de PostgreSQL.
     */
    const { data: movement, error } = await supabase.rpc(
      "register_inventory_movement",
      {
        p_product_id: product.id,
        p_movement_type: movement_type,
        p_quantity: quantity,
        p_reason: typeof reason === "string" ? reason : null,
        p_store_id: profile.store_id,
      }
    );

    if (error) {
      console.error(
        "Error registrando movimiento por barcode:",
        error
      );

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo registrar el movimiento."
          ),
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
          product_costs ( purchase_price ),
          suppliers (
            id,
            name
          )
        `)
        .eq("id", product.id)
        .eq("store_id", profile.store_id)
        .single() as unknown as {
          data: ProductRow | null;
          error: { message: string } | null;
        };

    if (updatedError || !updatedProduct) {
      return NextResponse.json({
        ok: true,
        movement,
        product,
      });
    }

    return NextResponse.json({
      ok: true,
      movement,
      product: flattenProductCost(updatedProduct),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
