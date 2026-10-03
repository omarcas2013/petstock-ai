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

    /*
     * tanda 3, Parte B #8: el máximo a devolver es lo que QUEDA por
     * devolver (vendido - ya devuelto), no lo vendido. Sumamos las
     * devoluciones ya "confirmada" (register_customer_return no deja
     * devolver más de lo disponible, así que solo las confirmadas
     * cuentan; las "cancelada" no restan).
     */
    const saleItems = Array.isArray(data.sale_items)
      ? data.sale_items
      : [];

    const saleItemIds = saleItems.map((item) => item.id);

    const alreadyReturnedByItem = new Map<string, number>();

    if (saleItemIds.length > 0) {
      const { data: returnedRows, error: returnedError } =
        await supabase
          .from("customer_return_items")
          .select(
            "sale_item_id, quantity, customer_returns!inner(status)"
          )
          .in("sale_item_id", saleItemIds)
          .eq("customer_returns.status", "confirmada");

      if (returnedError) {
        console.error(
          "ERROR CONSULTANDO DEVOLUCIONES PREVIAS:",
          returnedError
        );
      } else {
        for (const row of returnedRows ?? []) {
          const current =
            alreadyReturnedByItem.get(row.sale_item_id) ?? 0;

          alreadyReturnedByItem.set(
            row.sale_item_id,
            current + row.quantity
          );
        }
      }
    }

    const sale = {
      ...data,
      sale_items: saleItems.map((item) => {
        const alreadyReturned =
          alreadyReturnedByItem.get(item.id) ?? 0;

        return {
          ...item,
          already_returned: alreadyReturned,
          remaining_to_return: Math.max(
            0,
            item.quantity - alreadyReturned
          ),
        };
      }),
    };

    return NextResponse.json(
      {
        ok: true,
        sale,
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
