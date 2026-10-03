import { NextResponse } from "next/server";
import {
  CATALOG_DELETE_ROLES,
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";
import { escapeLikePattern } from "@/lib/supabase/like";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

type WarehousePayload = {
  name?: unknown;
  code?: unknown;
  description?: unknown;
  address?: unknown;
  capacity?: unknown;
  branch_id?: unknown;
  is_active?: unknown;
};

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "ID de almacén requerido." },
        { status: 400 }
      );
    }

    const { data: warehouse, error } = await supabase
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
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .maybeSingle();

    if (error) {
      console.error("ERROR OBTENIENDO ALMACÉN:", error);

      return NextResponse.json(
        { error: "No se pudo obtener el almacén." },
        { status: 400 }
      );
    }

    if (!warehouse) {
      return NextResponse.json(
        { error: "Almacén no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      warehouse: normalizeWarehouse(
        warehouse as WarehouseRow
      ),
    });
  } catch (error) {
    console.error(
      "ERROR GET /api/inventory/warehouses/[id]:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "ID de almacén requerido." },
        { status: 400 }
      );
    }

    let body: WarehousePayload;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es válido." },
        { status: 400 }
      );
    }

    const { data: currentWarehouse, error: currentWarehouseError } =
      await supabase
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
          is_active
        `
        )
        .eq("id", id)
        .eq("store_id", storeId)
        .maybeSingle();

    if (currentWarehouseError) {
      console.error(
        "ERROR OBTENIENDO ALMACÉN ACTUAL:",
        currentWarehouseError
      );

      return NextResponse.json(
        { error: "No se pudo obtener el almacén." },
        { status: 400 }
      );
    }

    if (!currentWarehouse) {
      return NextResponse.json(
        { error: "Almacén no encontrado." },
        { status: 404 }
      );
    }

    /*
     * Permitimos actualizaciones parciales.
     * Si un campo no viene en el body,
     * conservamos el valor actual.
     */

    const name =
      body.name !== undefined
        ? normalizeText(body.name)
        : currentWarehouse.name;

    const code =
      body.code !== undefined
        ? normalizeText(body.code)
        : currentWarehouse.code;

    const description =
      body.description !== undefined
        ? normalizeText(body.description)
        : currentWarehouse.description;

    const address =
      body.address !== undefined
        ? normalizeText(body.address)
        : currentWarehouse.address;

    const capacity =
      body.capacity !== undefined
        ? normalizeCapacity(body.capacity)
        : currentWarehouse.capacity;

    const branchId =
      body.branch_id !== undefined
        ? normalizeBranchId(body.branch_id)
        : currentWarehouse.branch_id;

    const isActive =
      body.is_active !== undefined
        ? Boolean(body.is_active)
        : currentWarehouse.is_active;

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
     * Validar sucursal.
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
              "No puedes asignar el almacén a una sucursal inactiva.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * Validar código único.
     * Excluimos el almacén que estamos editando.
     */
    const { data: existingCode, error: codeError } =
      await supabase
        .from("warehouses")
        .select("id")
        .eq("store_id", storeId)
        .eq("code", code)
        .neq("id", id)
        .maybeSingle();

    if (codeError) {
      console.error("ERROR VALIDANDO CÓDIGO:", codeError);

      return NextResponse.json(
        { error: "No se pudo validar el código del almacén." },
        { status: 400 }
      );
    }

    if (existingCode) {
      return NextResponse.json(
        {
          error:
            "Ya existe otro almacén con ese código en tu tienda.",
        },
        { status: 409 }
      );
    }

    /*
     * Validar nombre único dentro de la misma sucursal.
     *
     * Ejemplo:
     *
     * Bogotá / Principal       -> permitido
     * Norte / Principal        -> permitido
     * Bogotá / Principal       -> NO permitido
     *
     * También se controla el caso de almacenes
     * que todavía no tienen sucursal.
     */
    let duplicateNameQuery = supabase
      .from("warehouses")
      .select("id")
      .eq("store_id", storeId)
      .ilike("name", escapeLikePattern(name))
      .neq("id", id);

    duplicateNameQuery = branchId
      ? duplicateNameQuery.eq("branch_id", branchId)
      : duplicateNameQuery.is("branch_id", null);

    const { data: existingName, error: nameError } =
      await duplicateNameQuery.maybeSingle();

    if (nameError) {
      console.error("ERROR VALIDANDO NOMBRE:", nameError);

      return NextResponse.json(
        { error: "No se pudo validar el nombre del almacén." },
        { status: 400 }
      );
    }

    if (existingName) {
      return NextResponse.json(
        {
          error: branchId
            ? "Ya existe otro almacén con ese nombre en la sucursal seleccionada."
            : "Ya existe otro almacén con ese nombre sin sucursal.",
        },
        { status: 409 }
      );
    }

    /*
     * Actualizar almacén.
     */
    const { data: warehouse, error: updateError } =
      await supabase
        .from("warehouses")
        .update({
          branch_id: branchId,
          name,
          code,
          description,
          address,
          capacity,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("store_id", storeId)
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

    if (updateError) {
      console.error("ERROR ACTUALIZANDO ALMACÉN:", updateError);

      if (updateError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya existe un almacén con ese código o nombre.",
          },
          { status: 409 }
        );
      }

      // P0001 = el trigger A7 bloqueó la desactivación porque el
      // almacén tiene existencias (quantity > 0) asociadas.
      if (updateError.code === "P0001") {
        return NextResponse.json(
          {
            error: rpcErrorMessage(
              updateError,
              "No se pudo actualizar el almacén."
            ),
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo actualizar el almacén." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Almacén actualizado correctamente.",
      warehouse: normalizeWarehouse(
        warehouse as WarehouseRow
      ),
    });
  } catch (error) {
    console.error(
      "ERROR PUT /api/inventory/warehouses/[id]:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(CATALOG_DELETE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "ID de almacén requerido." },
        { status: 400 }
      );
    }

    const { data: warehouse, error: warehouseError } =
      await supabase
        .from("warehouses")
        .select("id, name")
        .eq("id", id)
        .eq("store_id", storeId)
        .maybeSingle();

    if (warehouseError) {
      console.error(
        "ERROR OBTENIENDO ALMACÉN:",
        warehouseError
      );

      return NextResponse.json(
        { error: "No se pudo obtener el almacén." },
        { status: 400 }
      );
    }

    if (!warehouse) {
      return NextResponse.json(
        { error: "Almacén no encontrado." },
        { status: 404 }
      );
    }

    const { data: deleted, error: deleteError } =
      await supabase
        .from("warehouses")
        .delete()
        .eq("id", id)
        .eq("store_id", storeId)
        .select("id")
        .maybeSingle();

    if (deleteError) {
      console.error("ERROR ELIMINANDO ALMACÉN:", deleteError);

      // 23503 = foreign_key_violation: el almacén tiene ubicaciones,
      // existencias o compras recibidas asociadas.
      if (deleteError.code === "23503") {
        return NextResponse.json(
          {
            error:
              "No se puede eliminar: el almacén tiene ubicaciones o existencias asociadas.",
          },
          { status: 409 }
        );
      }

      // P0001 = el trigger A7 bloqueó el borrado porque el almacén
      // tiene existencias (quantity > 0) asociadas.
      if (deleteError.code === "P0001") {
        return NextResponse.json(
          {
            error: rpcErrorMessage(
              deleteError,
              "No se pudo eliminar el almacén."
            ),
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo eliminar el almacén." },
        { status: 400 }
      );
    }

    if (!deleted) {
      return NextResponse.json(
        { error: "Almacén no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Almacén eliminado correctamente.",
    });
  } catch (error) {
    console.error(
      "ERROR DELETE /api/inventory/warehouses/[id]:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
