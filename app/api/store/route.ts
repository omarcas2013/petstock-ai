import { NextResponse } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

/*
 * Tanda 5: configuración del negocio.
 *
 * GET   (todos los roles): nombre, modo de inventario y si maneja lotes.
 * PATCH (solo owner):      { manages_lots: boolean } vía
 *                          set_store_manages_lots, que no deja apagarlo
 *                          mientras haya lotes con unidades.
 */

export async function GET() {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data: store, error } = await supabase
      .from("stores")
      .select("id, name, inventory_mode, manages_lots")
      .eq("id", profile.store_id)
      .maybeSingle();

    if (error || !store) {
      console.error("ERROR OBTENIENDO TIENDA:", error);

      return NextResponse.json(
        { error: "No se pudo cargar la configuración del negocio." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      store: {
        ...store,
        manages_lots: store.manages_lots === true,
      },
      role: profile.role,
    });
  } catch (error) {
    console.error("Error GET /api/store:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRole(["owner"]);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    let body: { manages_lots?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    if (typeof body?.manages_lots !== "boolean") {
      return NextResponse.json(
        { error: "Indica si el negocio maneja lotes." },
        { status: 400 }
      );
    }

    const { error } = await supabase.rpc("set_store_manages_lots", {
      p_store_id: profile.store_id,
      p_enabled: body.manages_lots,
    });

    if (error) {
      console.error("ERROR CONFIGURANDO LOTES:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo guardar la configuración."
          ),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      manages_lots: body.manages_lots,
    });
  } catch (error) {
    console.error("Error PATCH /api/store:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
