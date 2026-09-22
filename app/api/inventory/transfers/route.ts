import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserProfile(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("store_id, role")
    .eq("id", userId)
    .single();

  if (error || !data?.store_id) {
    return null;
  }

  return data;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const profile = await getUserProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "No se encontró la tienda del usuario." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);

    const productId = searchParams.get("product_id");
    const fromLocationId =
      searchParams.get("from_location_id");
    const toLocationId =
      searchParams.get("to_location_id");

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
      query = query.eq(
        "from_location_id",
        fromLocationId
      );
    }

    if (toLocationId) {
      query = query.eq(
        "to_location_id",
        toLocationId
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        "Error obteniendo traslados:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudieron obtener los traslados.",
        },
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Usuario autenticado
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    // 2. Perfil / tienda / rol
    const profile = await getUserProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        {
          error:
            "No se encontró la tienda del usuario.",
        },
        { status: 400 }
      );
    }

    // 3. Validar permisos
    if (
      !["owner", "admin", "manager"].includes(
        profile.role
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para realizar traslados de inventario.",
        },
        { status: 403 }
      );
    }

    // 4. Leer body
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
    const fromWarehouseId =
      body.from_warehouse_id;
    const fromLocationId =
      body.from_location_id;
    const toWarehouseId =
      body.to_warehouse_id;
    const toLocationId =
      body.to_location_id;
    const quantity = body.quantity;
    const reason = body.reason;

    // 5. Validar campos obligatorios
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

    // 6. Validar cantidad
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

    // 7. No permitir misma ubicación
    if (fromLocationId === toLocationId) {
      return NextResponse.json(
        {
          error:
            "La ubicación de origen y destino deben ser diferentes.",
        },
        { status: 400 }
      );
    }

    // 8. Ejecutar el RPC que ya comprobamos que funciona
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
          details: error.details || null,
          hint: error.hint || null,
          code: error.code || null,
        },
        { status: 400 }
      );
    }

    // 9. Traslado exitoso
    return NextResponse.json({
      ok: true,
      transfer: data,
      message:
        "Traslado realizado correctamente.",
    });
  } catch (error) {
    console.error(
      "Error POST /api/inventory/transfers:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}