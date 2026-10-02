import { NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

type WarehousePayload = {
  name?: unknown;
  code?: unknown;
  description?: unknown;
  address?: unknown;
  capacity?: unknown;
  branch_id?: unknown;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function normalizeCapacity(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.trunc(number);
}

function normalizeBranchId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

type WarehouseRow = {
  id: string;
  store_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branches:
    | { id: string; name: string; code: string }
    | { id: string; name: string; code: string }[]
    | null;
};

function normalizeWarehouse(warehouse: WarehouseRow) {
  return {
    id: warehouse.id,
    store_id: warehouse.store_id,
    branch_id: warehouse.branch_id ?? null,
    name: warehouse.name,
    code: warehouse.code,
    description: warehouse.description ?? null,
    address: warehouse.address ?? null,
    capacity: warehouse.capacity ?? null,
    is_active: warehouse.is_active,
    created_at: warehouse.created_at,
    updated_at: warehouse.updated_at,

    branch: Array.isArray(warehouse.branches)
      ? warehouse.branches[0] ?? null
      : warehouse.branches ?? null,
  };
}

export async function GET() {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select(
        `
          id,
          store_id,
          branch_id,
          name,
          code,
          description,
          address,
          capacity,
          is_active,
          created_at,
          updated_at,
          branches (
            id,
            name,
            code
          )
        `
      )
      .eq("store_id", profile.store_id)
      .order("name", { ascending: true });

    if (error) {
      console.error("ERROR OBTENIENDO ALMACENES:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener los almacenes." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      warehouses: (warehouses || []).map((warehouse) =>
        normalizeWarehouse(warehouse as WarehouseRow)
      ),
    });
  } catch (error) {
    console.error(
      "ERROR GET /api/inventory/warehouses:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    let body: WarehousePayload;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
    }

    const name = normalizeText(body.name);
    const code = normalizeText(body.code);
    const description = normalizeText(body.description);
    const address = normalizeText(body.address);
    const branchId = normalizeBranchId(body.branch_id);
    const capacity = normalizeCapacity(body.capacity);

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del almacén es obligatorio." },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "El código del almacén es obligatorio." },
        { status: 400 }
      );
    }

    if (capacity !== null && capacity < 0) {
      return NextResponse.json(
        { error: "La capacidad no puede ser negativa." },
        { status: 400 }
      );
    }

    /*
     * Si se asignó una sucursal, verificamos que:
     *
     * 1. Exista.
     * 2. Pertenezca a la misma tienda.
     * 3. Esté activa.
     */
    if (branchId) {
      const { data: branch, error: branchError } =
        await supabase
          .from("branches")
          .select("id, store_id, name, code, is_active")
          .eq("id", branchId)
          .eq("store_id", storeId)
          .maybeSingle();

      if (branchError) {
        console.error(
          "ERROR VALIDANDO SUCURSAL:",
          branchError
        );

        return NextResponse.json(
          {
            error:
              "No se pudo validar la sucursal seleccionada.",
          },
          { status: 400 }
        );
      }

      if (!branch) {
        return NextResponse.json(
          {
            error:
              "La sucursal seleccionada no pertenece a tu tienda.",
          },
          { status: 400 }
        );
      }

      if (!branch.is_active) {
        return NextResponse.json(
          {
            error:
              "No puedes asignar un almacén a una sucursal inactiva.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * El código siempre debe ser único dentro de la tienda.
     */
    const { data: existingCode, error: codeError } =
      await supabase
        .from("warehouses")
        .select("id")
        .eq("store_id", storeId)
        .eq("code", code)
        .maybeSingle();

    if (codeError) {
      console.error(
        "ERROR VALIDANDO CÓDIGO DE ALMACÉN:",
        codeError
      );

      return NextResponse.json(
        { error: "No se pudo validar el código del almacén." },
        { status: 400 }
      );
    }

    if (existingCode) {
      return NextResponse.json(
        {
          error:
            "Ya existe un almacén con ese código en tu tienda.",
        },
        { status: 409 }
      );
    }

    /*
     * El nombre puede repetirse en distintas sucursales,
     * pero NO dentro de la misma sucursal.
     *
     * Para almacenes sin sucursal, tampoco permitimos
     * dos almacenes con el mismo nombre.
     */
    let duplicateNameQuery = supabase
      .from("warehouses")
      .select("id")
      .eq("store_id", storeId)
      .ilike("name", name);

    duplicateNameQuery = branchId
      ? duplicateNameQuery.eq("branch_id", branchId)
      : duplicateNameQuery.is("branch_id", null);

    const { data: existingName, error: nameError } =
      await duplicateNameQuery.maybeSingle();

    if (nameError) {
      console.error(
        "ERROR VALIDANDO NOMBRE DE ALMACÉN:",
        nameError
      );

      return NextResponse.json(
        { error: "No se pudo validar el nombre del almacén." },
        { status: 400 }
      );
    }

    if (existingName) {
      return NextResponse.json(
        {
          error: branchId
            ? "Ya existe un almacén con ese nombre en la sucursal seleccionada."
            : "Ya existe un almacén con ese nombre sin sucursal.",
        },
        { status: 409 }
      );
    }

    const { data: warehouse, error: insertError } =
      await supabase
        .from("warehouses")
        .insert({
          store_id: storeId,
          branch_id: branchId,
          name,
          code,
          description,
          address,
          capacity,
          is_active: true,
        })
        .select(
          `
          id,
          store_id,
          branch_id,
          name,
          code,
          description,
          address,
          capacity,
          is_active,
          created_at,
          updated_at,
          branches (
            id,
            name,
            code
          )
        `
        )
        .single();

    if (insertError) {
      console.error("ERROR CREANDO ALMACÉN:", insertError);

      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya existe un almacén con ese código o nombre.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo crear el almacén." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Almacén creado correctamente.",
        warehouse: normalizeWarehouse(
          warehouse as WarehouseRow
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "ERROR POST /api/inventory/warehouses:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
