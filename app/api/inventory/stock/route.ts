import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Faltan las variables de entorno de Supabase."
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function getAuthenticatedUser() {
  const supabase = await createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserStoreId(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("store_id")
    .eq("id", userId)
    .single();

  if (error || !data?.store_id) {
    return null;
  }

  return data.store_id as string;
}

async function getUserRole(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !data?.role) {
    return null;
  }

  return data.role as string;
}

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
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const storeId = await getUserStoreId(user.id);

    if (!storeId) {
      return NextResponse.json(
        {
          error:
            "No se encontró la tienda del usuario.",
        },
        { status: 400 }
      );
    }

    const { searchParams } =
      new URL(request.url);

    const branchId =
      searchParams.get("branch_id");

    const warehouseId =
      searchParams.get("warehouse_id");

    const locationId =
      searchParams.get("location_id");

    const productId =
      searchParams.get("product_id");

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
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
      .eq("store_id", storeId)
      .order("updated_at", {
        ascending: false,
      });

    if (branchId) {
      query = query.eq(
        "branch_id",
        branchId
      );
    }

    if (warehouseId) {
      query = query.eq(
        "warehouse_id",
        warehouseId
      );
    }

    if (locationId) {
      query = query.eq(
        "location_id",
        locationId
      );
    }

    if (productId) {
      query = query.eq(
        "product_id",
        productId
      );
    }

    const { data: stock, error } =
      await query;

    if (error) {
      console.error(
        "Error obteniendo inventario localizado:",
        error
      );

      return NextResponse.json(
        {
          error:
            "No se pudo consultar el inventario localizado.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      stock: stock ?? [],
    });
  } catch (error) {
    console.error(
      "Error GET /api/inventory/stock:",
      error
    );

    return NextResponse.json(
      {
        error: "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Crea una existencia localizada inicial.
 *
 * Niveles soportados:
 *
 * 1. Sucursal
 *
 * {
 *   branch_id,
 *   product_id,
 *   quantity
 * }
 *
 * 2. Almacén
 *
 * {
 *   warehouse_id,
 *   product_id,
 *   quantity
 * }
 *
 * 3. Ubicación
 *
 * {
 *   warehouse_id,
 *   location_id,
 *   product_id,
 *   quantity
 * }
 *
 * IMPORTANTE:
 *
 * Este endpoint NO modifica:
 *
 * products.stock
 *
 * ni crea inventory_movements.
 *
 * El inventario global se maneja directamente
 * mediante products.stock y los movimientos globales.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const storeId = await getUserStoreId(user.id);

    if (!storeId) {
      return NextResponse.json(
        {
          error:
            "No se encontró la tienda del usuario.",
        },
        { status: 400 }
      );
    }

    const role = await getUserRole(user.id);

    if (
      !role ||
      !["owner", "admin", "manager"].includes(role)
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para administrar existencias localizadas.",
        },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "El cuerpo de la solicitud no es válido.",
        },
        { status: 400 }
      );
    }

    const branchId =
      typeof body.branch_id === "string"
        ? body.branch_id.trim()
        : "";

    const warehouseId =
      typeof body.warehouse_id === "string"
        ? body.warehouse_id.trim()
        : "";

    const locationId =
      typeof body.location_id === "string"
        ? body.location_id.trim()
        : "";

    const productId =
      typeof body.product_id === "string"
        ? body.product_id.trim()
        : "";

    /*
     * Determinar el nivel de inventario.
     *
     * branch
     * warehouse
     * location
     */
    let scope:
      | "branch"
      | "warehouse"
      | "location"
      | null = null;

    if (branchId) {
      if (warehouseId || locationId) {
        return NextResponse.json(
          {
            error:
              "Una existencia por sucursal no puede incluir almacén ni ubicación.",
          },
          { status: 400 }
        );
      }

      scope = "branch";
    } else if (warehouseId && locationId) {
      scope = "location";
    } else if (warehouseId) {
      scope = "warehouse";
    } else if (locationId) {
      return NextResponse.json(
        {
          error:
            "Una ubicación debe indicar también su almacén.",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        {
          error:
            "Debes indicar sucursal, almacén o almacén + ubicación.",
        },
        { status: 400 }
      );
    }

    if (!productId) {
      return NextResponse.json(
        {
          error:
            "El producto es obligatorio.",
        },
        { status: 400 }
      );
    }

    let quantity = 0;

    if (
      typeof body.quantity === "number"
    ) {
      quantity = body.quantity;
    } else if (
      typeof body.quantity === "string"
    ) {
      quantity = Number(body.quantity);
    }

    if (
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

    const supabaseAdmin = getSupabaseAdmin();

    /*
     * ============================================================
     * VALIDAR SUCURSAL
     * ============================================================
     */

    if (scope === "branch") {
      const {
        data: branch,
        error: branchError,
      } = await supabaseAdmin
        .from("branches")
        .select(
          `
            id,
            store_id,
            is_active
          `
        )
        .eq("id", branchId)
        .eq("store_id", storeId)
        .single();

      if (branchError || !branch) {
        return NextResponse.json(
          {
            error:
              "Sucursal no encontrada.",
          },
          { status: 404 }
        );
      }

      if (!branch.is_active) {
        return NextResponse.json(
          {
            error:
              "No puedes asignar inventario a una sucursal inactiva.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * ============================================================
     * VALIDAR ALMACÉN
     * ============================================================
     */

    if (
      scope === "warehouse" ||
      scope === "location"
    ) {
      const {
        data: warehouse,
        error: warehouseError,
      } = await supabaseAdmin
        .from("warehouses")
        .select(
          `
            id,
            store_id,
            branch_id,
            is_active
          `
        )
        .eq("id", warehouseId)
        .eq("store_id", storeId)
        .single();

      if (warehouseError || !warehouse) {
        return NextResponse.json(
          {
            error:
              "Almacén no encontrado.",
          },
          { status: 404 }
        );
      }

      if (!warehouse.is_active) {
        return NextResponse.json(
          {
            error:
              "No puedes asignar inventario a un almacén inactivo.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * ============================================================
     * VALIDAR UBICACIÓN
     * ============================================================
     */

    if (scope === "location") {
      const {
        data: location,
        error: locationError,
      } = await supabaseAdmin
        .from("locations")
        .select(
          `
            id,
            store_id,
            warehouse_id,
            is_active
          `
        )
        .eq("id", locationId)
        .eq("store_id", storeId)
        .eq("warehouse_id", warehouseId)
        .single();

      if (
        locationError ||
        !location
      ) {
        return NextResponse.json(
          {
            error:
              "La ubicación no existe o no pertenece a este almacén.",
          },
          { status: 404 }
        );
      }

      if (!location.is_active) {
        return NextResponse.json(
          {
            error:
              "No puedes asignar inventario a una ubicación inactiva.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * ============================================================
     * VALIDAR PRODUCTO
     * ============================================================
     */

    const {
      data: product,
      error: productError,
    } = await supabaseAdmin
      .from("products")
      .select(
        `
          id,
          store_id,
          name,
          stock,
          is_active
        `
      )
      .eq("id", productId)
      .eq("store_id", storeId)
      .single();

    if (
      productError ||
      !product
    ) {
      return NextResponse.json(
        {
          error:
            "Producto no encontrado.",
        },
        { status: 404 }
      );
    }

    if (!product.is_active) {
      return NextResponse.json(
        {
          error:
            "No puedes asignar inventario a un producto inactivo.",
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * BUSCAR EXISTENCIA EXISTENTE
     * ============================================================
     */

    let existingQuery = supabaseAdmin
      .from("inventory_stock")
      .select(
        `
          id,
          branch_id,
          warehouse_id,
          location_id,
          product_id,
          quantity
        `
      )
      .eq("store_id", storeId)
      .eq("product_id", productId);

    if (scope === "branch") {
      existingQuery = existingQuery
        .eq("branch_id", branchId)
        .is("warehouse_id", null)
        .is("location_id", null);
    }

    if (scope === "warehouse") {
      existingQuery = existingQuery
        .is("branch_id", null)
        .eq("warehouse_id", warehouseId)
        .is("location_id", null);
    }

    if (scope === "location") {
      existingQuery = existingQuery
        .is("branch_id", null)
        .eq("warehouse_id", warehouseId)
        .eq("location_id", locationId);
    }

    const {
      data: existingStock,
      error: existingStockError,
    } = await existingQuery.maybeSingle();

    if (existingStockError) {
      console.error(
        "Error comprobando existencia localizada:",
        existingStockError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo comprobar si ya existe una existencia.",
        },
        { status: 500 }
      );
    }

    if (existingStock) {
      return NextResponse.json(
        {
          error:
            "Ya existe una existencia para este producto en este nivel de inventario.",
          stock: existingStock,
        },
        { status: 409 }
      );
    }

    /*
     * ============================================================
     * CREAR EXISTENCIA
     * ============================================================
     */

    const insertData: {
      store_id: string;
      branch_id: string | null;
      warehouse_id: string | null;
      location_id: string | null;
      product_id: string;
      quantity: number;
    } = {
      store_id: storeId,
      branch_id:
        scope === "branch"
          ? branchId
          : null,
      warehouse_id:
        scope === "warehouse" ||
        scope === "location"
          ? warehouseId
          : null,
      location_id:
        scope === "location"
          ? locationId
          : null,
      product_id: productId,
      quantity,
    };

    const {
      data: stock,
      error,
    } = await supabaseAdmin
      .from("inventory_stock")
      .insert(insertData)
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
          updated_at
        `
      )
      .single();

    if (error || !stock) {
      console.error(
        "Error creando existencia localizada:",
        error
      );

      if (error?.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya existe una existencia para este producto en este nivel de inventario.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error:
            error?.message ||
            "No se pudo crear la existencia.",
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * RESPUESTA
     * ============================================================
     *
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
        scope,
        stock,
        product_stock: product.stock,
        stock_unchanged: true,
        message:
          "Existencia localizada creada correctamente.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Error POST /api/inventory/stock:",
      error
    );

    return NextResponse.json(
      {
        error: "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}