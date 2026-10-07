import { NextRequest, NextResponse } from "next/server";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

/**
 * GET /api/reports/purchase-suggestions?dias=30|60|90|180
 *
 * Tanda 6: sugeridos de compra. La demanda se calcula con los últimos
 * `dias` días y la compra sugerida cubre 30 días más el stock mínimo
 * (report_purchase_suggestions).
 */

const VALID_DAYS = [30, 60, 90, 180];
const COVERAGE_DAYS = 30;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const days = Number(searchParams.get("dias") || 90);

    if (!VALID_DAYS.includes(days)) {
      return NextResponse.json(
        {
          error:
            "El período de demanda debe ser 30, 60, 90 o 180 días.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "report_purchase_suggestions",
      {
        p_store_id: profile.store_id,
        p_days: days,
        p_coverage_days: COVERAGE_DAYS,
      }
    );

    if (error) {
      console.error("Error en report_purchase_suggestions:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo generar el reporte de sugeridos."
          ),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      report: data,
    });
  } catch (error) {
    console.error("Error GET /api/reports/purchase-suggestions:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
