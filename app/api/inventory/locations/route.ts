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

const VALID_LOCATION_TYPES = [
  "zona",
  "pasillo",
  "estanteria",
  "ubicacion",
  "recepcion",
  "despacho",
  "cuarentena",
];

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

    const warehouseId =
      searchParams.get("warehouse_id");

    if (!warehouseId) {
      return NextResponse.json(
        {
          error:
            "El ID del almacén es obligatorio.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verificamos que el almacén pertenezca
    // a la tienda del usuario.
    const { data: warehouse, error: warehouseError } =
      await supabaseAdmin
        .from("warehouses")
        .select("id")
        .eq("id", warehouseId)
        .eq("store_id", storeId)
        .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json(
        {
          error: "Almacén no encontrado.",
        },
        { status: 404 }
      );
    }

    const { data: locations, error } =
      await supabaseAdmin
        .from("locations")
        .select(
          `
            id,
            store_id,
            warehouse_id,
            name,
            code,
            description,
            location_type,
            capacity,
            is_active,
            created_at,
            updated_at
          `
        )
        .eq("store_id", storeId)
        .eq("warehouse_id", warehouseId)
        .order("name", {
          ascending: true,
        });

    if (error) {
      console.error(
        "Error obteniendo ubicaciones:",
        error
      );

      return NextResponse.json(
        {
          error:
            "No se pudieron cargar las ubicaciones.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      locations: locations ?? [],
    });
  } catch (error) {
    console.error(
      "Error GET /api/inventory/locations:",
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
            "No tienes permisos para crear ubicaciones.",
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

    const warehouseId =
      typeof body.warehouse_id === "string"
        ? body.warehouse_id.trim()
        : "";

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const code =
      typeof body.code === "string"
        ? body.code.trim().toUpperCase()
        : "";

    const description =
      body.description === null
        ? null
        : typeof body.description === "string"
        ? body.description.trim() || null
        : null;

    const locationType =
      typeof body.location_type === "string"
        ? body.location_type.trim()
        : "ubicacion";

    const isActive =
      typeof body.is_active === "boolean"
        ? body.is_active
        : true;

    if (!warehouseId) {
      return NextResponse.json(
        {
          error:
            "El almacén es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          error:
            "El nombre de la ubicación es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        {
          error:
            "El código de la ubicación es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (
      !VALID_LOCATION_TYPES.includes(
        locationType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "El tipo de ubicación no es válido.",
        },
        { status: 400 }
      );
    }

    let capacity: number | null = null;

    if (
      body.capacity !== null &&
      body.capacity !== undefined &&
      body.capacity !== ""
    ) {
      if (
        typeof body.capacity === "number"
      ) {
        capacity = body.capacity;
      } else if (
        typeof body.capacity === "string"
      ) {
        capacity = Number(body.capacity);
      } else {
        return NextResponse.json(
          {
            error:
              "La capacidad no es válida.",
          },
          { status: 400 }
        );
      }

      if (
        !Number.isInteger(capacity) ||
        capacity < 0
      ) {
        return NextResponse.json(
          {
            error:
              "La capacidad debe ser un número entero mayor o igual a 0.",
          },
          { status: 400 }
        );
      }
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verificar que el almacén pertenezca
    // a la tienda del usuario.
    const { data: warehouse, error: warehouseError } =
      await supabaseAdmin
        .from("warehouses")
        .select("id, is_active")
        .eq("id", warehouseId)
        .eq("store_id", storeId)
        .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json(
        {
          error: "Almacén no encontrado.",
        },
        { status: 404 }
      );
    }

    if (!warehouse.is_active) {
      return NextResponse.json(
        {
          error:
            "No puedes crear ubicaciones dentro de un almacén inactivo.",
        },
        { status: 400 }
      );
    }

    // Validación adicional antes de insertar.
    const { data: duplicateLocation } =
      await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("warehouse_id", warehouseId)
        .eq("code", code)
        .maybeSingle();

    if (duplicateLocation) {
      return NextResponse.json(
        {
          error:
            "Ya existe una ubicación con ese código dentro de este almacén.",
        },
        { status: 409 }
      );
    }

    const { data: location, error } =
      await supabaseAdmin
        .from("locations")
        .insert({
          store_id: storeId,
          warehouse_id: warehouseId,
          name,
          code,
          description,
          location_type: locationType,
          capacity,
          is_active: isActive,
        })
        .select(
          `
            id,
            store_id,
            warehouse_id,
            name,
            code,
            description,
            location_type,
            capacity,
            is_active,
            created_at,
            updated_at
          `
        )
        .single();

    if (error || !location) {
      console.error(
        "Error creando ubicación:",
        error
      );

      if (
        error?.code === "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Ya existe una ubicación con ese código dentro de este almacén.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error:
            error?.message ||
            "No se pudo crear la ubicación.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        location,
        message:
          "Ubicación creada correctamente.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Error POST /api/inventory/locations:",
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