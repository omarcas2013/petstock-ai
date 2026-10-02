import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { requireRole, SALES_ROLES } from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

type SaleItemInput = {
  product_id: string;
  quantity: number;
};

type CreateSaleBody = {
  items: SaleItemInput[];
  payment_method: string;
  customer_name?: string | null;
};

export async function GET() {
  try {
    const auth = await requireRole(SALES_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    // ==========================================================
    // OBTENER VENTAS
    // ==========================================================

    const { data, error } = await fetchAllRows((from, to) =>
      supabase
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
          product_id,
          quantity,
          unit_price,
          subtotal,
          products (
            id,
            name,
            sku
          )
        )
      `
        )
        .eq("store_id", profile.store_id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );

    if (error) {
      console.error("Error obteniendo ventas:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener las ventas." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sales: data ?? [],
    });
  } catch (error) {
    console.error("Error GET /api/sales:", error);

    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // ==========================================================
    // CLIENTE SUPABASE AUTENTICADO
    // ==========================================================
    //
    // IMPORTANTE:
    // No usamos la llave secreta para ejecutar el RPC.
    //
    // register_sale() utiliza auth.uid(), por lo que necesitamos
    // conservar la sesión del usuario.
    //
    // ==========================================================

    const auth = await requireRole(SALES_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    // ==========================================================
    // LEER BODY
    // ==========================================================

    let body: CreateSaleBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "El cuerpo de la solicitud no es JSON válido.",
        },
        { status: 400 }
      );
    }

    const { items, payment_method, customer_name } = body;

    // ==========================================================
    // VALIDAR ITEMS
    // ==========================================================

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          error:
            "La venta debe contener al menos un producto.",
        },
        { status: 400 }
      );
    }

    // ==========================================================
    // VALIDAR MÉTODO DE PAGO
    // ==========================================================

    if (
      typeof payment_method !== "string" ||
      payment_method.trim() === ""
    ) {
      return NextResponse.json(
        {
          error: "El método de pago es obligatorio.",
        },
        { status: 400 }
      );
    }

    // ==========================================================
    // VALIDAR ITEMS DEL CARRITO
    // ==========================================================

    for (const item of items) {
      if (
        !item ||
        typeof item.product_id !== "string" ||
        item.product_id.trim() === ""
      ) {
        return NextResponse.json(
          {
            error:
              "Cada producto debe tener un product_id válido.",
          },
          { status: 400 }
        );
      }

      if (
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "La cantidad de cada producto debe ser un número entero mayor que 0.",
          },
          { status: 400 }
        );
      }
    }

    // ==========================================================
    // NORMALIZAR ITEMS
    // ==========================================================

    const normalizedItems: SaleItemInput[] = items.map(
      (item) => ({
        product_id: item.product_id.trim(),
        quantity: item.quantity,
      })
    );

    // ==========================================================
    // REGISTRAR VENTA
    // ==========================================================
    //
    // IMPORTANTE:
    //
    // Usamos el cliente autenticado.
    //
    // Así register_sale() puede ejecutar:
    //
    // auth.uid()
    //
    // y validar que p_store_id pertenece realmente al usuario
    // y que el rol está autorizado (assert_store_role).
    //
    // ==========================================================

    const { data, error } = await supabase.rpc(
      "register_sale",
      {
        p_items: normalizedItems,
        p_payment_method: payment_method.trim(),
        p_customer_name:
          typeof customer_name === "string"
            ? customer_name.trim()
            : null,
        p_store_id: storeId,
      }
    );

    if (error) {
      console.error(
        "Error registrando venta mediante register_sale:",
        error
      );

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo registrar la venta."
          ),
        },
        { status: 400 }
      );
    }

    // ==========================================================
    // RESPUESTA
    // ==========================================================

    return NextResponse.json(
      {
        ok: true,
        sale: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error POST /api/sales:", error);

    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
