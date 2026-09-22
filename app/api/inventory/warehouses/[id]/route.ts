import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type WarehousePayload = {
  name?: unknown;
  code?: unknown;
  description?: unknown;
  address?: unknown;
  capacity?: unknown;
  branch_id?: unknown;
  is_active?: unknown;
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

async function getAuthenticatedContext() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      user: null,
      storeId: null,
      role: null,
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("store_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.store_id) {
    return {
      supabase,
      user,
      storeId: null,
      role: profile?.role ?? null,
    };
  }

  return {
    supabase,
    user,
    storeId: profile.store_id as string,
    role: profile.role as string | null,
  };
}

function canManageWarehouses(role: string | null) {
  return ["owner", "admin", "manager"].includes(role || "");
}

function canDeleteWarehouses(role: string | null) {
  return ["owner", "admin"].includes(role || "");
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const {
      supabase,
      user,
      storeId,
    } = await getAuthenticatedContext();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        {
          error: "No se encontró la tienda del usuario.",
        },
        {
          status: 400,
        }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "ID de almacén requerido.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: warehouse,
      error,
    } = await supabase
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
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) {
      console.error(
        "ERROR OBTENIENDO ALMACÉN:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 400,
        }
      );
    }

    if (!warehouse) {
      return NextResponse.json(
        {
          error: "Almacén no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const normalizedWarehouse = {
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
      branch: Array.isArray((warehouse as any).branches)
        ? (warehouse as any).branches[0] ?? null
        : (warehouse as any).branches ?? null,
    };

    return NextResponse.json({
      warehouse: normalizedWarehouse,
    });
  } catch (error) {
    console.error(
      "ERROR GET /api/inventory/warehouses/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const {
      supabase,
      user,
      storeId,
      role,
    } = await getAuthenticatedContext();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        {
          error: "No se encontró la tienda del usuario.",
        },
        {
          status: 400,
        }
      );
    }

    if (!canManageWarehouses(role)) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para gestionar almacenes.",
        },
        {
          status: 403,
        }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "ID de almacén requerido.",
        },
        {
          status: 400,
        }
      );
    }

    let body: WarehousePayload;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "El cuerpo de la solicitud no es válido.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: currentWarehouse,
      error: currentWarehouseError,
    } = await supabase
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
        {
          error: currentWarehouseError.message,
        },
        {
          status: 400,
        }
      );
    }

    if (!currentWarehouse) {
      return NextResponse.json(
        {
          error: "Almacén no encontrado.",
        },
        {
          status: 404,
        }
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
        {
          error:
            "El nombre del almacén es obligatorio.",
        },
        {
          status: 400,
        }
      );
    }

    if (!code) {
      return NextResponse.json(
        {
          error:
            "El código del almacén es obligatorio.",
        },
        {
          status: 400,
        }
      );
    }

    if (capacity !== null && capacity < 0) {
      return NextResponse.json(
        {
          error:
            "La capacidad no puede ser negativa.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Validar sucursal.
     */
    if (branchId) {
      const {
        data: branch,
        error: branchError,
      } = await supabase
        .from("branches")
        .select(
          `
            id,
            store_id,
            name,
            code,
            is_active
          `
        )
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
          {
            status: 400,
          }
        );
      }

      if (!branch) {
        return NextResponse.json(
          {
            error:
              "La sucursal seleccionada no pertenece a tu tienda.",
          },
          {
            status: 400,
          }
        );
      }

      if (!branch.is_active) {
        return NextResponse.json(
          {
            error:
              "No puedes asignar el almacén a una sucursal inactiva.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * Validar código único.
     * Excluimos el almacén que estamos editando.
     */
    const {
      data: existingCode,
      error: codeError,
    } = await supabase
      .from("warehouses")
      .select("id")
      .eq("store_id", storeId)
      .eq("code", code)
      .neq("id", id)
      .maybeSingle();

    if (codeError) {
      console.error(
        "ERROR VALIDANDO CÓDIGO:",
        codeError
      );

      return NextResponse.json(
        {
          error: codeError.message,
        },
        {
          status: 400,
        }
      );
    }

    if (existingCode) {
      return NextResponse.json(
        {
          error:
            "Ya existe otro almacén con ese código en tu tienda.",
        },
        {
          status: 409,
        }
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
      .ilike("name", name)
      .neq("id", id);

    if (branchId) {
      duplicateNameQuery = duplicateNameQuery.eq(
        "branch_id",
        branchId
      );
    } else {
      duplicateNameQuery = duplicateNameQuery.is(
        "branch_id",
        null
      );
    }

    const {
      data: existingName,
      error: nameError,
    } = await duplicateNameQuery.maybeSingle();

    if (nameError) {
      console.error(
        "ERROR VALIDANDO NOMBRE:",
        nameError
      );

      return NextResponse.json(
        {
          error: nameError.message,
        },
        {
          status: 400,
        }
      );
    }

    if (existingName) {
      return NextResponse.json(
        {
          error: branchId
            ? "Ya existe otro almacén con ese nombre en la sucursal seleccionada."
            : "Ya existe otro almacén con ese nombre sin sucursal.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Actualizar almacén.
     */
    const {
      data: warehouse,
      error: updateError,
    } = await supabase
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
      console.error(
        "ERROR ACTUALIZANDO ALMACÉN:",
        updateError
      );

      if (updateError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Ya existe un almacén con ese código o nombre.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error: updateError.message,
        },
        {
          status: 400,
        }
      );
    }

    const normalizedWarehouse = {
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

      branch: Array.isArray((warehouse as any).branches)
        ? (warehouse as any).branches[0] ?? null
        : (warehouse as any).branches ?? null,
    };

    return NextResponse.json({
      ok: true,
      message: "Almacén actualizado correctamente.",
      warehouse: normalizedWarehouse,
    });
  } catch (error) {
    console.error(
      "ERROR PUT /api/inventory/warehouses/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const {
      supabase,
      user,
      storeId,
      role,
    } = await getAuthenticatedContext();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        {
          error: "No se encontró la tienda del usuario.",
        },
        {
          status: 400,
        }
      );
    }

    if (!canDeleteWarehouses(role)) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para eliminar almacenes.",
        },
        {
          status: 403,
        }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "ID de almacén requerido.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: warehouse,
      error: warehouseError,
    } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();

    if (warehouseError) {
      return NextResponse.json(
        {
          error: warehouseError.message,
        },
        {
          status: 400,
        }
      );
    }

    if (!warehouse) {
      return NextResponse.json(
        {
          error: "Almacén no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const {
      error: deleteError,
    } = await supabase
      .from("warehouses")
      .delete()
      .eq("id", id)
      .eq("store_id", storeId);

    if (deleteError) {
      console.error(
        "ERROR ELIMINANDO ALMACÉN:",
        deleteError
      );

      return NextResponse.json(
        {
          error: deleteError.message,
        },
        {
          status: 400,
        }
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      {
        status: 500,
      }
    );
  }
}