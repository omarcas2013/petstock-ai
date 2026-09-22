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

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
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

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "ID de ubicación requerido.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: location, error } =
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
        .eq("id", id)
        .eq("store_id", storeId)
        .single();

    if (error || !location) {
      return NextResponse.json(
        {
          error: "Ubicación no encontrada.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      location,
    });
  } catch (error) {
    console.error(
      "Error GET /api/inventory/locations/[id]:",
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

export async function PUT(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
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
            "No tienes permisos para modificar ubicaciones.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "ID de ubicación requerido.",
        },
        { status: 400 }
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

    const supabaseAdmin = getSupabaseAdmin();

    const { data: currentLocation, error: currentError } =
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
            is_active
          `
        )
        .eq("id", id)
        .eq("store_id", storeId)
        .single();

    if (currentError || !currentLocation) {
      return NextResponse.json(
        {
          error: "Ubicación no encontrada.",
        },
        { status: 404 }
      );
    }

    /*
     * Cambio rápido de estado:
     *
     * {
     *   is_active: true
     * }
     *
     * o
     *
     * {
     *   is_active: false
     * }
     */
    if (
      typeof body.is_active === "boolean" &&
      Object.keys(body).length === 1
    ) {
      const { data: updatedLocation, error } =
        await supabaseAdmin
          .from("locations")
          .update({
            is_active: body.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("store_id", storeId)
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

      if (error || !updatedLocation) {
        console.error(
          "Error actualizando estado de ubicación:",
          error
        );

        return NextResponse.json(
          {
            error:
              error?.message ||
              "No se pudo actualizar el estado de la ubicación.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        location: updatedLocation,
        message: body.is_active
          ? "Ubicación activada correctamente."
          : "Ubicación desactivada correctamente.",
      });
    }

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : currentLocation.name;

    const code =
      typeof body.code === "string"
        ? body.code.trim().toUpperCase()
        : currentLocation.code;

    const description =
      body.description === null
        ? null
        : typeof body.description === "string"
        ? body.description.trim() || null
        : currentLocation.description;

    const locationType =
      typeof body.location_type === "string"
        ? body.location_type.trim()
        : currentLocation.location_type;

    const isActive =
      typeof body.is_active === "boolean"
        ? body.is_active
        : currentLocation.is_active;

    let capacity =
      currentLocation.capacity;

    if (
      body.capacity === null ||
      body.capacity === ""
    ) {
      capacity = null;
    } else if (
      typeof body.capacity === "number"
    ) {
      capacity = body.capacity;
    } else if (
      typeof body.capacity === "string"
    ) {
      capacity = Number(body.capacity);
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

    if (
      capacity !== null &&
      (!Number.isInteger(capacity) ||
        capacity < 0)
    ) {
      return NextResponse.json(
        {
          error:
            "La capacidad debe ser un número entero mayor o igual a 0.",
        },
        { status: 400 }
      );
    }

    /*
     * Verificamos que el almacén siga
     * perteneciendo a la misma tienda.
     */
    const { data: warehouse, error: warehouseError } =
      await supabaseAdmin
        .from("warehouses")
        .select("id, store_id")
        .eq("id", currentLocation.warehouse_id)
        .eq("store_id", storeId)
        .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json(
        {
          error:
            "El almacén asociado a la ubicación no fue encontrado.",
        },
        { status: 404 }
      );
    }

    /*
     * El warehouse_id no se cambia desde
     * este endpoint.
     *
     * Una ubicación pertenece al almacén
     * con el que fue creada.
     */

    const { data: duplicateLocation } =
      await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("warehouse_id", currentLocation.warehouse_id)
        .eq("code", code)
        .neq("id", id)
        .maybeSingle();

    if (duplicateLocation) {
      return NextResponse.json(
        {
          error:
            "Ya existe otra ubicación con ese código dentro de este almacén.",
        },
        { status: 409 }
      );
    }

    const updateData = {
      name,
      code,
      description,
      location_type: locationType,
      capacity,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedLocation, error } =
      await supabaseAdmin
        .from("locations")
        .update(updateData)
        .eq("id", id)
        .eq("store_id", storeId)
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

    if (error || !updatedLocation) {
      console.error(
        "Error actualizando ubicación:",
        error
      );

      if (error?.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya existe otra ubicación con ese código dentro de este almacén.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error:
            error?.message ||
            "No se pudo actualizar la ubicación.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      location: updatedLocation,
      message:
        "Ubicación actualizada correctamente.",
    });
  } catch (error) {
    console.error(
      "Error PUT /api/inventory/locations/[id]:",
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