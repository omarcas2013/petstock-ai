import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const productId = searchParams.get("product_id");
    const fromLocationId = searchParams.get(
      "from_location_id"
    );
    const toLocationId = searchParams.get("to_location_id");

    let query = supabase
      .from("inventory_transfers")
      .select(`
        id,
        store_id,
        product_id,
        from_warehouse_id,
        from_location_id,
        to_warehouse_id,
        to_location_id,
        quantity,
        reason,
        created_at,
        products (
          id,
          name,
          sku,
          barcode
        ),
        from_warehouses:warehouses!inventory_transfers_from_warehouse_id_fkey (
          id,
          name,
          code
        ),
        from_locations:locations!inventory_transfers_from_location_id_fkey (
          id,
          name,
          code
        ),
        to_warehouses:warehouses!inventory_transfers_to_warehouse_id_fkey (
          id,
          name,
          code
        ),
        to_locations:locations!inventory_transfers_to_location_id_fkey (
          id,
          name,
          code
        )
      `)
      .eq("store_id", profile.store_id)
      .order("created_at", { ascending: false });

    if (productId) {
      query = query.eq("product_id", productId);
    }

    if (fromLocationId) {
      query = query.eq("from_location_id", fromLocationId);
    }

    if (toLocationId) {
      query = query.eq("to_location_id", toLocationId);
    }

    // Orden estable para paginar.
    query = query.order("id");

    const { data, error } = await fetchAllRows((from, to) =>
      query.range(from, to)
    );

    if (error) {
      console.error("Error obteniendo traslados:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener los traslados." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      transfers: data ?? [],
    });
  } catch (error) {
    console.error(
      "Error GET /api/inventory/transfers:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
        {
          error:
            "El cuerpo de la solicitud no contiene un JSON válido.",
        },
        { status: 400 }
      );
    }

    const productId = body.product_id;
    const fromWarehouseId = body.from_warehouse_id;
    const fromLocationId = body.from_location_id;
    const toWarehouseId = body.to_warehouse_id;
    const toLocationId = body.to_location_id;
    const quantity = body.quantity;
    const reason = body.reason;

    // Validar campos obligatorios
    if (
      typeof productId !== "string" ||
      typeof fromWarehouseId !== "string" ||
      typeof fromLocationId !== "string" ||
      typeof toWarehouseId !== "string" ||
      typeof toLocationId !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Producto, almacenes y ubicaciones de origen y destino son obligatorios.",
        },
        { status: 400 }
      );
    }

    // Validar cantidad
    const parsedQuantity = Number(quantity);

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "La cantidad debe ser un número entero mayor que cero.",
        },
        { status: 400 }
      );
    }

    // No permitir misma ubicación
    if (fromLocationId === toLocationId) {
      return NextResponse.json(
        {
          error:
            "La ubicación de origen y destino deben ser diferentes.",
        },
        { status: 400 }
      );
    }

    // Ejecutar el RPC (también valida sesión, tienda y rol:
    // assert_store_role).
    const { data, error } = await supabase.rpc(
      "transfer_inventory",
      {
        p_store_id: profile.store_id,
        p_product_id: productId,
        p_from_warehouse_id: fromWarehouseId,
        p_from_location_id: fromLocationId,
        p_to_warehouse_id: toWarehouseId,
        p_to_location_id: toLocationId,
        p_quantity: parsedQuantity,
        p_reason:
          typeof reason === "string" &&
          reason.trim().length > 0
            ? reason.trim()
            : null,
      }
    );

    if (error) {
      console.error(
        "Error ejecutando transfer_inventory:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo realizar el traslado.",
        },
        { status: 400 }
      );
    }

    // Traslado exitoso
    return NextResponse.json({
      ok: true,
      transfer: data,
      message: "Traslado realizado correctamente.",
    });
  } catch (error) {
    console.error(
      "Error POST /api/inventory/transfers:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
