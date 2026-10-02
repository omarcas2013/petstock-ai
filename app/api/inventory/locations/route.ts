import { NextRequest, NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

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
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const warehouseId = searchParams.get("warehouse_id");

    if (!warehouseId) {
      return NextResponse.json(
        { error: "El ID del almacén es obligatorio." },
        { status: 400 }
      );
    }

    // Verificamos que el almacén pertenezca
    // a la tienda del usuario.
    const { data: warehouse, error: warehouseError } =
      await supabase
        .from("warehouses")
        .select("id")
        .eq("id", warehouseId)
        .eq("store_id", profile.store_id)
        .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json(
        { error: "Almacén no encontrado." },
        { status: 404 }
      );
    }

    const { data: locations, error } = await supabase
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
      .eq("store_id", profile.store_id)
      .eq("warehouse_id", warehouseId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error obteniendo ubicaciones:", error);

      return NextResponse.json(
        { error: "No se pudieron cargar las ubicaciones." },
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
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
    }

    const warehouseId =
      typeof body.warehouse_id === "string"
        ? body.warehouse_id.trim()
        : "";

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

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
        { error: "El almacén es obligatorio." },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "El nombre de la ubicación es obligatorio." },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "El código de la ubicación es obligatorio." },
        { status: 400 }
      );
    }

    if (!VALID_LOCATION_TYPES.includes(locationType)) {
      return NextResponse.json(
        { error: "El tipo de ubicación no es válido." },
        { status: 400 }
      );
    }

    let capacity: number | null = null;

    if (
      body.capacity !== null &&
      body.capacity !== undefined &&
      body.capacity !== ""
    ) {
      if (typeof body.capacity === "number") {
        capacity = body.capacity;
      } else if (typeof body.capacity === "string") {
        capacity = Number(body.capacity);
      } else {
        return NextResponse.json(
          { error: "La capacidad no es válida." },
          { status: 400 }
        );
      }

      if (!Number.isInteger(capacity) || capacity < 0) {
        return NextResponse.json(
          {
            error:
              "La capacidad debe ser un número entero mayor o igual a 0.",
          },
          { status: 400 }
        );
      }
    }

    // Verificar que el almacén pertenezca
    // a la tienda del usuario.
    const { data: warehouse, error: warehouseError } =
      await supabase
        .from("warehouses")
        .select("id, is_active")
        .eq("id", warehouseId)
        .eq("store_id", storeId)
        .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json(
        { error: "Almacén no encontrado." },
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
    const { data: duplicateLocation } = await supabase
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

    const { data: location, error } = await supabase
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
      console.error("Error creando ubicación:", error);

      if (error?.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya existe una ubicación con ese código dentro de este almacén.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo crear la ubicación." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        location,
        message: "Ubicación creada correctamente.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Error POST /api/inventory/locations:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
