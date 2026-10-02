import { NextRequest, NextResponse } from "next/server";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

type InventoryMode =
  | "global"
  | "branch"
  | "warehouse"
  | "location";

// =========================================================
// GET
// =========================================================
//
// Devuelve la configuración de inventario de la tienda
// asociada al usuario autenticado.
//
// Se utiliza principalmente para que la interfaz de
// recepción sepa qué nivel debe mostrar:
// global / branch / warehouse / location.
//

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    // =======================================================
    // VALIDAR ID DE COMPRA
    // =======================================================

    const { id: purchaseId } = await context.params;

    if (!purchaseId) {
      return NextResponse.json(
        { error: "ID de compra requerido" },
        { status: 400 }
      );
    }

    // =======================================================
    // OBTENER CONFIGURACIÓN DE INVENTARIO
    // =======================================================

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, name, inventory_mode")
      .eq("id", profile.store_id)
      .single();

    if (storeError || !store) {
      console.error(
        "Error obteniendo configuración de inventario:",
        storeError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo obtener la configuración de inventario de la tienda.",
        },
        { status: 500 }
      );
    }

    const inventoryMode = store.inventory_mode as InventoryMode;

    if (
      !["global", "branch", "warehouse", "location"].includes(
        inventoryMode
      )
    ) {
      return NextResponse.json(
        {
          error:
            "La modalidad de inventario de la tienda no es válida.",
        },
        { status: 500 }
      );
    }

    // =======================================================
    // RESPUESTA
    // =======================================================

    return NextResponse.json({
      ok: true,
      purchase_id: purchaseId,
      store: {
        id: store.id,
        name: store.name,
        inventory_mode: inventoryMode,
      },
      inventory_mode: inventoryMode,
    });
  } catch (error) {
    console.error(
      "Error GET /api/purchases/[id]/receive:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// =========================================================
// POST
// =========================================================
//
// Recibe una compra utilizando el modo de inventario
// configurado en stores.inventory_mode.
//
// Modos:
//
// global
// branch
// warehouse
// location
//
// El destino enviado por el frontend debe coincidir
// exactamente con el modo configurado.
//

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    // =======================================================
    // COMPRA
    // =======================================================

    const { id: purchaseId } = await context.params;

    if (!purchaseId) {
      return NextResponse.json(
        { error: "ID de compra requerido" },
        { status: 400 }
      );
    }

    // =======================================================
    // OBTENER MODALIDAD DE INVENTARIO
    // =======================================================

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, name, inventory_mode")
      .eq("id", storeId)
      .single();

    if (storeError || !store) {
      console.error(
        "Error obteniendo configuración de inventario:",
        storeError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo obtener la configuración de inventario de la tienda.",
        },
        { status: 500 }
      );
    }

    const inventoryMode = store.inventory_mode as InventoryMode;

    if (
      !["global", "branch", "warehouse", "location"].includes(
        inventoryMode
      )
    ) {
      return NextResponse.json(
        {
          error:
            "La modalidad de inventario de la tienda no es válida.",
        },
        { status: 500 }
      );
    }

    // =======================================================
    // LEER BODY OPCIONAL
    // =======================================================

    let body: {
      branch_id?: string | null;
      warehouse_id?: string | null;
      location_id?: string | null;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const branchId =
      typeof body.branch_id === "string"
        ? body.branch_id.trim() || null
        : null;

    const warehouseId =
      typeof body.warehouse_id === "string"
        ? body.warehouse_id.trim() || null
        : null;

    const locationId =
      typeof body.location_id === "string"
        ? body.location_id.trim() || null
        : null;

    // =======================================================
    // VALIDAR DESTINO SEGÚN MODALIDAD
    // =======================================================

    if (inventoryMode === "global") {
      if (branchId || warehouseId || locationId) {
        return NextResponse.json(
          {
            error:
              "Esta tienda utiliza inventario global. No debes indicar sucursal, almacén ni ubicación.",
          },
          { status: 400 }
        );
      }
    }

    if (inventoryMode === "branch") {
      if (!branchId) {
        return NextResponse.json(
          {
            error:
              "Debes indicar la sucursal donde se recibirá la compra.",
          },
          { status: 400 }
        );
      }

      if (warehouseId || locationId) {
        return NextResponse.json(
          {
            error:
              "El inventario por sucursal no utiliza almacén ni ubicación.",
          },
          { status: 400 }
        );
      }
    }

    if (inventoryMode === "warehouse") {
      if (!warehouseId) {
        return NextResponse.json(
          {
            error:
              "Debes indicar el almacén donde se recibirá la compra.",
          },
          { status: 400 }
        );
      }

      if (branchId || locationId) {
        return NextResponse.json(
          {
            error:
              "El inventario por almacén no utiliza sucursal ni ubicación.",
          },
          { status: 400 }
        );
      }
    }

    if (inventoryMode === "location") {
      if (!warehouseId || !locationId) {
        return NextResponse.json(
          {
            error:
              "Debes indicar almacén y ubicación donde se recibirá la compra.",
          },
          { status: 400 }
        );
      }

      if (branchId) {
        return NextResponse.json(
          {
            error:
              "La modalidad por ubicación no recibe branch_id directamente.",
          },
          { status: 400 }
        );
      }
    }

    // =======================================================
    // LLAMAR RPC
    // =======================================================

    const { data, error } = await supabase.rpc(
      "receive_purchase_at_scope",
      {
        p_store_id: storeId,
        p_purchase_id: purchaseId,
        p_scope: inventoryMode,
        p_branch_id: branchId,
        p_warehouse_id: warehouseId,
        p_location_id: locationId,
      }
    );

    if (error) {
      console.error("Error recibiendo compra:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo registrar la recepción de la compra."
          ),
        },
        { status: 400 }
      );
    }

    // =======================================================
    // RESPUESTA
    // =======================================================

    return NextResponse.json({
      ok: true,
      localized: inventoryMode !== "global",
      inventory_mode: inventoryMode,
      receipt: data,
    });
  } catch (error) {
    console.error(
      "Error POST /api/purchases/[id]/receive:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
