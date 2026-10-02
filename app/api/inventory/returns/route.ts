import { NextResponse } from "next/server";
import { requireRole, SALES_ROLES } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(SALES_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data: returns, error } = await supabase
      .from("customer_returns")
      .select(`
        id,
        sale_id,
        customer_name,
        reason,
        status,
        created_at,
        customer_return_items (
          id,
          product_id,
          sale_item_id,
          quantity,
          unit_price,
          subtotal,
          created_at,
          products (
            name,
            sku
          ),
          sale_items (
            unit_price
          )
        )
      `)
      .eq("store_id", profile.store_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando devoluciones:", error);

      return NextResponse.json(
        { error: "No se pudieron cargar las devoluciones." },
        { status: 500 }
      );
    }

    /*
     * La migración 20261002120100_devoluciones agregó unit_price y
     * subtotal a customer_return_items y rellenó las filas existentes
     * desde sale_items. Si alguna fila quedara sin backfill, calculamos
     * el valor desde la línea de venta original como respaldo.
     */
    const returnsWithPrices = (returns ?? []).map(
      (customerReturn) => ({
        ...customerReturn,
        customer_return_items: (
          customerReturn.customer_return_items ?? []
        ).map(({ sale_items, ...item }) => {
          const saleItem = Array.isArray(sale_items)
            ? sale_items[0]
            : sale_items;

          const unitPrice =
            item.unit_price !== null &&
            item.unit_price !== undefined
              ? Number(item.unit_price)
              : Number(saleItem?.unit_price ?? 0);

          const subtotal =
            item.subtotal !== null &&
            item.subtotal !== undefined
              ? Number(item.subtotal)
              : unitPrice * item.quantity;

          return {
            ...item,
            unit_price: unitPrice,
            subtotal,
          };
        }),
      })
    );

    return NextResponse.json({
      returns: returnsWithPrices,
    });
  } catch (error) {
    console.error("Error GET /api/inventory/returns:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(SALES_ROLES);

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

    const { sale_id, sale_item_id, quantity, reason } = body;

    if (!sale_id) {
      return NextResponse.json(
        { error: "Falta sale_id." },
        { status: 400 }
      );
    }

    if (!sale_item_id) {
      return NextResponse.json(
        { error: "Falta sale_item_id." },
        { status: 400 }
      );
    }

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "La cantidad debe ser un número entero mayor que cero.",
        },
        { status: 400 }
      );
    }

    /*
     * Verificar que la venta pertenece
     * a la tienda del usuario.
     */
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select("id, store_id, customer_name")
      .eq("id", sale_id)
      .eq("store_id", profile.store_id)
      .single();

    if (saleError || !sale) {
      return NextResponse.json(
        { error: "Venta no encontrada." },
        { status: 404 }
      );
    }

    /*
     * Verificar que el producto seleccionado
     * pertenece a la venta.
     */
    const { data: saleItem, error: saleItemError } =
      await supabase
        .from("sale_items")
        .select(`
          id,
          sale_id,
          product_id,
          quantity,
          unit_price,
          subtotal,
          products (
            id,
            name,
            sku,
            store_id,
            stock
          )
        `)
        .eq("id", sale_item_id)
        .eq("sale_id", sale_id)
        .single();

    if (saleItemError || !saleItem) {
      return NextResponse.json(
        {
          error:
            "El producto seleccionado no pertenece a la venta.",
        },
        { status: 404 }
      );
    }

    const product = Array.isArray(saleItem.products)
      ? saleItem.products[0]
      : saleItem.products;

    if (!product || product.store_id !== profile.store_id) {
      return NextResponse.json(
        { error: "Producto no encontrado en tu tienda." },
        { status: 404 }
      );
    }

    /*
     * Registrar la devolución mediante
     * la función PostgreSQL.
     *
     * La función:
     * - valida sesión, tienda y rol (assert_store_role)
     * - valida la cantidad
     * - evita devolver más de lo vendido
     * - crea la devolución
     * - aumenta el stock
     * - crea el movimiento de entrada
     */
    const { data: result, error: rpcError } =
      await supabase.rpc("register_customer_return", {
        p_store_id: profile.store_id,
        p_sale_id: sale_id,
        p_sale_item_id: sale_item_id,
        p_quantity: quantity,
        p_reason:
          typeof reason === "string" ? reason : null,
      });

    if (rpcError) {
      console.error(
        "Error registrando devolución:",
        rpcError
      );

      return NextResponse.json(
        {
          error:
            rpcError.message ||
            "No se pudo registrar la devolución.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Error POST /api/inventory/returns:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
