import { NextRequest, NextResponse } from "next/server";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

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

    const { id: purchaseId } = await context.params;

    if (!purchaseId) {
      return NextResponse.json(
        { error: "ID de compra requerido." },
        { status: 400 }
      );
    }

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return NextResponse.json(
        { error: "El motivo de la anulación es obligatorio." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "cancel_purchase",
      {
        p_store_id: profile.store_id,
        p_purchase_id: purchaseId,
        p_reason: reason,
      }
    );

    if (error) {
      console.error("Error anulando compra:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo anular la compra."
          ),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: data,
    });
  } catch (error) {
    console.error(
      "Error POST /api/purchases/[id]/cancel:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
