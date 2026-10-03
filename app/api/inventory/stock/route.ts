import { NextRequest, NextResponse } from "next/server";
import { parseQuantity } from "@/lib/quantity";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  INVENTORY_MANAGER_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

/**
 * GET
 *
 * Consulta existencias localizadas.
 *
 * Niveles soportados:
 *
 * - Sucursal
 *   branch_id
 *
 * - Almacén
 *   warehouse_id
 *
 * - Ubicación
 *   warehouse_id + location_id
 *
 * El inventario global NO utiliza inventory_stock.
 * El stock global vive en products.stock.
 *
 * Parámetros opcionales:
 *
 * ?branch_id=...
 * ?warehouse_id=...
 * ?location_id=...
 * ?product_id=...
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const branchId = searchParams.get("branch_id");
    const warehouseId = searchParams.get("warehouse_id");
    const locationId = searchParams.get("location_id");
    const productId = searchParams.get("product_id");

    let query = supabase
      .from("inventory_stock")
      .select(
        `
          id,
          store_id,
          branch_id,
          warehouse_id,
          location_id,
          product_id,
          quantity,
          created_at,
          updated_at,

          branches (
            id,
            name,
            code
          ),

          warehouses (
            id,
            name,
            code,
            branch_id
          ),

          locations (
            id,
            name,
            code,
            location_type
          ),

          products (
            id,
            name,
            sku,
            barcode,
            stock,
            is_active
          )
        `
      )
      .eq("store_id", profile.store_id)
      .order("updated_at", { ascending: false });

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    if (warehouseId) {
      query = query.eq("warehouse_id", warehouseId);
    }

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    if (productId) {
      query = query.eq("product_id", productId);
    }

    // Orden estable para paginar.
    query = query.order("id");

    const { data: stock, error } = await fetchAllRows(
      (from, to) => query.range(from, to)
    );

    if (error) {
      console.error(
        "Error obteniendo inventario localizado:",
        error
      );

      return NextResponse.json(
        { error: "No se pudo consultar el inventario localizado." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      stock: stock ?? [],
    });
  } catch (error) {
    console.error("Error GET /api/inventory/stock:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Crea una existencia localizada usando assign_location_stock (tanda
 * 3, A4): valida sucursal/almacén/ubicación y, sobre todo, que la
 * suma de lo ya localizado para el producto (en cualquier nivel) más
 * esta cantidad no supere products.stock -- lo que antes esta ruta no
 * comprobaba, permitiendo "unidades fantasma".
 *
 * Niveles soportados (ver inventory_stock_scope_check):
 *
 * 1. Sucursal:              { branch_id, product_id, quantity }
 * 2. Almacén sin ubicación: { warehouse_id, product_id, quantity }
 * 3. Almacén + ubicación:   { warehouse_id, location_id, product_id, quantity }
 *
 * IMPORTANTE: este endpoint NO modifica products.stock ni crea
 * inventory_movements. El inventario global se maneja directamente
 * mediante products.stock y los movimientos globales.
 */
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
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
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

    const productId =
      typeof body.product_id === "string"
        ? body.product_id.trim()
        : "";

    if (!productId) {
      return NextResponse.json(
        { error: "El producto es obligatorio." },
        { status: 400 }
      );
    }

    const quantity = parseQuantity(body.quantity);

    if (
      quantity === null ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return NextResponse.json(
        {
          error:
            "La cantidad debe ser un número entero mayor o igual a 0.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "assign_location_stock",
      {
        p_store_id: profile.store_id,
        p_product_id: productId,
        p_quantity: quantity,
        p_branch_id: branchId,
        p_warehouse_id: warehouseId,
        p_location_id: locationId,
      }
    );

    if (error) {
      console.error(
        "Error asignando existencia localizada:",
        error
      );

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo crear la existencia."
          ),
        },
        { status: 400 }
      );
    }

    /*
     * IMPORTANTE:
     *
     * products.stock NO cambia.
     *
     * Esta operación solamente establece
     * dónde está localizado inicialmente el inventario.
     */

    return NextResponse.json(
      {
        ok: true,
        scope: data?.scope,
        stock: data,
        product_stock: data?.product_stock,
        stock_unchanged: true,
        message: "Existencia localizada creada correctamente.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error POST /api/inventory/stock:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
