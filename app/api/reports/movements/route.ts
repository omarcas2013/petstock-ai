import { NextRequest, NextResponse } from "next/server";
import { isValidDateKey } from "@/lib/dates";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

/**
 * GET /api/reports/movements?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Llama report_movements_summary (tanda 3, A5): hace en SQL lo mismo
 * que antes calculaba esta página en el navegador después de traer
 * TODOS los movimientos con fetchAllRows.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const desde = searchParams.get("desde") || "";
    const hasta = searchParams.get("hasta") || "";

    if (!isValidDateKey(desde) || !isValidDateKey(hasta)) {
      return NextResponse.json(
        {
          error:
            "El rango de fechas es obligatorio y debe tener el formato AAAA-MM-DD.",
        },
        { status: 400 }
      );
    }

    if (desde > hasta) {
      return NextResponse.json(
        {
          error:
            "La fecha inicial no puede ser posterior a la final.",
        },
        { status: 400 }
      );
    }

    const rangeDays =
      (new Date(`${hasta}T00:00:00Z`).getTime() -
        new Date(`${desde}T00:00:00Z`).getTime()) /
        86400000 +
      1;

    if (rangeDays > 366) {
      return NextResponse.json(
        {
          error:
            "El rango de fechas no puede ser mayor a 366 días.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "report_movements_summary",
      {
        p_store_id: profile.store_id,
        p_desde: desde,
        p_hasta: hasta,
      }
    );

    if (error) {
      console.error("Error en report_movements_summary:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo generar el reporte de movimientos."
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
    console.error(
      "Error GET /api/reports/movements:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
