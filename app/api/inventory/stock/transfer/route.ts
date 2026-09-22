import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Verificar usuario autenticado
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    // 2. Obtener la tienda del usuario
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.store_id) {
      return NextResponse.json(
        { error: "No se encontró la tienda del usuario" },
        { status: 400 }
      );
    }

    // 3. Leer datos del traslado
    const body = await request.json();

    const {
      product_id,
      from_warehouse_id,
      from_location_id,
      to_warehouse_id,
      to_location_id,
      quantity,
      reason,
    } = body;

    // 4. Validaciones
    if (!product_id) {
      return NextResponse.json(
        { error: "Producto requerido" },
        { status: 400 }
      );
    }

    if (!from_warehouse_id) {
      return NextResponse.json(
        { error: "Almacén de origen requerido" },
        { status: 400 }
      );
    }

    if (!from_location_id) {
      return NextResponse.json(
        { error: "Ubicación de origen requerida" },
        { status: 400 }
      );
    }

    if (!to_warehouse_id) {
      return NextResponse.json(
        { error: "Almacén de destino requerido" },
        { status: 400 }
      );
    }

    if (!to_location_id) {
      return NextResponse.json(
        { error: "Ubicación de destino requerida" },
        { status: 400 }
      );
    }

    if (
      quantity === undefined ||
      quantity === null ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      return NextResponse.json(
        { error: "La cantidad debe ser un número entero mayor que 0" },
        { status: 400 }
      );
    }

    if (from_location_id === to_location_id) {
      return NextResponse.json(
        {
          error:
            "La ubicación de origen y destino no pueden ser la misma",
        },
        { status: 400 }
      );
    }

    // 5. Ejecutar RPC
    const { data, error } = await supabase.rpc("transfer_inventory", {
      p_store_id: profile.store_id,
      p_product_id: product_id,
      p_from_warehouse_id: from_warehouse_id,
      p_from_location_id: from_location_id,
      p_to_warehouse_id: to_warehouse_id,
      p_to_location_id: to_location_id,
      p_quantity: Number(quantity),
      p_reason: reason?.trim() || null,
    });

    if (error) {
      console.error("Error ejecutando transfer_inventory:", error);

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo realizar el traslado de inventario",
        },
        { status: 400 }
      );
    }

    // 6. Respuesta exitosa
    return NextResponse.json({
      ok: true,
      transfer: data,
    });
  } catch (error) {
    console.error(
      "Error POST /api/inventory/stock/transfer:",
      error
    );

    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}