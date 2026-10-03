import { NextRequest, NextResponse } from "next/server";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";
import { escapeLikePattern } from "@/lib/supabase/like";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const { limit, offset } = parsePageParams(searchParams);

    const search = (searchParams.get("search") ?? "").trim();
    const typeFilter = (
      searchParams.get("type") ?? "todos"
    ).trim();

    let query = supabase
      .from("inventory_movements")
      .select(
        `
        id,
        product_id,
        movement_type,
        quantity,
        reason,
        created_at,
        stock_before,
        stock_after,
        products!inner (
          name,
          sku,
          store_id
        )
      `,
        { count: "exact" }
      )
      // inventory_movements no tiene store_id:
      // filtramos por la tienda del producto.
      .eq("products.store_id", profile.store_id);

    if (typeFilter !== "todos") {
      query = query.eq("movement_type", typeFilter);
    }

    if (search) {
      const escaped = escapeLikePattern(search);

      query = query.or(
        `reason.ilike.%${escaped}%,products.name.ilike.%${escaped}%,products.sku.ilike.%${escaped}%`
      );
    }

    const { data: movements, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error cargando movimientos:", error);

      return NextResponse.json(
        { error: "No se pudieron cargar los movimientos." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      movements: movements ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
    }

    const { product_id, movement_type, quantity, reason } =
      body;

    if (!product_id) {
      return NextResponse.json(
        { error: "Falta product_id." },
        { status: 400 }
      );
    }

    if (
      !["entrada", "salida", "ajuste"].includes(
        movement_type as string
      )
    ) {
      return NextResponse.json(
        { error: "Tipo de movimiento no válido." },
        { status: 400 }
      );
    }

    // En un ajuste la cantidad es el stock final (puede ser 0);
    // en entradas y salidas debe ser mayor que 0.
    if (
      !Number.isInteger(quantity) ||
      (quantity as number) < 0 ||
      (movement_type !== "ajuste" && quantity === 0)
    ) {
      return NextResponse.json(
        { error: "Cantidad no válida." },
        { status: 400 }
      );
    }

    /*
     * Verificar que el producto pertenece
     * a la tienda del usuario.
     */
    const { data: product, error: productError } =
      await supabase
        .from("products")
        .select("id, store_id")
        .eq("id", product_id)
        .eq("store_id", profile.store_id)
        .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: "Producto no encontrado." },
        { status: 404 }
      );
    }

    /*
     * Registrar movimiento mediante la función PostgreSQL
     * (también valida sesión, tienda y rol: assert_store_role).
     */
    const { data: movement, error } = await supabase.rpc(
      "register_inventory_movement",
      {
        p_product_id: product_id,
        p_movement_type: movement_type,
        p_quantity: quantity,
        p_reason: typeof reason === "string" ? reason : null,
        p_store_id: profile.store_id,
      }
    );

    if (error) {
      console.error("Error registrando movimiento:", error);

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo registrar el movimiento."
          ),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      movement,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
