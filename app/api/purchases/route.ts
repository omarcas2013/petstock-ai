import { NextRequest, NextResponse } from "next/server";
import { bogotaStartOfDay, isValidDateKey } from "@/lib/dates";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";
import { rangedQuery } from "@/lib/supabase/paginate";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const VALID_STATUSES = ["pendiente", "recibida", "cancelada"];

const PURCHASES_SELECT = `
  id,
  document_number,
  purchase_date,
  status,
  subtotal,
  total,
  notes,
  created_at,

  suppliers (
    id,
    name
  ),

  purchase_items (
    id,
    quantity,
    unit_cost,
    subtotal,

    products (
      id,
      name,
      sku,
      manages_lots
    )
  ),

  receipts (
    id,
    receipt_number,
    received_at,
    status,
    scope,
    branch_id,
    warehouse_id,
    location_id,

    branches (
      id,
      name,
      code
    ),

    warehouses (
      id,
      name,
      code
    ),

    locations (
      id,
      name,
      code
    )
  )
`;

function parsePageParams(searchParams: URLSearchParams) {
  const limitRaw = Number(searchParams.get("limit"));
  const offsetRaw = Number(searchParams.get("offset"));

  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.trunc(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const offset =
    Number.isFinite(offsetRaw) && offsetRaw >= 0
      ? Math.trunc(offsetRaw)
      : 0;

  return { limit, offset };
}

export async function GET(request: NextRequest) {
  try {
    /*
     * La matriz de roles no le da "compras y recepciones" a employee.
     * Antes de esta ruta exigir el rol, un employee podía listar las
     * compras igual (solo con los costos ocultos). Ahora directamente
     * no ve el listado.
     */
    const auth = await requireRole(INVENTORY_MANAGER_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const { limit, offset } = parsePageParams(searchParams);

    const statusFilter = searchParams.get("status") ?? "";

    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return NextResponse.json(
        { error: "El estado solicitado no es válido." },
        { status: 400 }
      );
    }

    let dataQuery = supabase
      .from("purchases")
      .select(PURCHASES_SELECT, { count: "exact" })
      .eq("store_id", profile.store_id);

    let countQuery = supabase
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("store_id", profile.store_id);

    if (statusFilter) {
      dataQuery = dataQuery.eq("status", statusFilter);
      countQuery = countQuery.eq("status", statusFilter);
    }

    dataQuery = dataQuery
      .order("purchase_date", { ascending: false })
      .order("id");

    const { data, error, count } = await rangedQuery(
      () => dataQuery.range(offset, offset + limit - 1),
      () => countQuery
    );

    if (error) {
      console.error("Error GET /api/purchases:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener las compras." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      purchases: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error GET /api/purchases:", error);

    return NextResponse.json(
      { error: "Error interno del servidor" },
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
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    const supplierId = String(body.supplier_id || "").trim();

    const documentNumber = body.document_number
      ? String(body.document_number).trim()
      : null;

    const purchaseDate = body.purchase_date
      ? String(body.purchase_date).trim()
      : null;

    if (purchaseDate && !isValidDateKey(purchaseDate)) {
      return NextResponse.json(
        {
          error:
            "La fecha de compra no es válida. Usa el formato AAAA-MM-DD.",
        },
        { status: 400 }
      );
    }

    const notes = body.notes
      ? String(body.notes).trim()
      : null;

    const items = Array.isArray(body.items) ? body.items : [];

    if (!supplierId) {
      return NextResponse.json(
        { error: "El proveedor es obligatorio" },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "La compra debe tener al menos un producto" },
        { status: 400 }
      );
    }

    if (items.length > 500) {
      return NextResponse.json(
        { error: "La compra no puede tener más de 500 productos" },
        { status: 400 }
      );
    }

    const normalizedItems: {
      product_id: string;
      quantity: number;
      unit_cost: number;
    }[] = [];

    const productIds = new Set<string>();

    for (const item of items as Record<string, unknown>[]) {
      const productId = String(item.product_id || "").trim();
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unit_cost);

      if (!productId) {
        return NextResponse.json(
          { error: "Todos los productos deben tener un product_id" },
          { status: 400 }
        );
      }

      if (productIds.has(productId)) {
        return NextResponse.json(
          {
            error:
              "No puedes repetir un producto dentro de la misma compra",
          },
          { status: 400 }
        );
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json(
          {
            error: "Las cantidades deben ser enteros mayores que 0",
          },
          { status: 400 }
        );
      }

      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return NextResponse.json(
          {
            error:
              "Los costos unitarios deben ser números mayores o iguales a 0",
          },
          { status: 400 }
        );
      }

      productIds.add(productId);

      normalizedItems.push({
        product_id: productId,
        quantity,
        unit_cost: unitCost,
      });
    }

    const { data, error } = await supabase.rpc(
      "create_purchase",
      {
        p_store_id: profile.store_id,
        p_supplier_id: supplierId,
        p_document_number: documentNumber,
        // purchase_date es timestamptz: la fecha se guarda
        // como medianoche en Bogotá para que no se corra el día.
        p_purchase_date: purchaseDate
          ? bogotaStartOfDay(purchaseDate)
          : new Date().toISOString(),
        p_notes: notes,
        p_items: normalizedItems,
      }
    );

    if (error) {
      console.error("Error RPC create_purchase:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo registrar la compra."
          ),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        purchase: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error POST /api/purchases:", error);

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
