import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Faltan las variables de Supabase.");
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

async function getAuthenticatedUser() {
  const supabase =
    await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserStoreId(
  userId: string
) {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", userId)
      .single();

  if (
    error ||
    !data?.store_id
  ) {
    throw new Error(
      "No se encontró la tienda del usuario."
    );
  }

  return data.store_id as string;
}

async function getUserRole() {
  const supabase =
    await createServerSupabase();

  const { data, error } =
    await supabase.rpc(
      "get_my_role"
    );

  if (error) {
    throw new Error(
      `No se pudo verificar el rol: ${error.message}`
    );
  }

  return data as string | null;
}

function canManageBranches(
  role: string | null
) {
  return [
    "owner",
    "admin",
    "manager",
  ].includes(role || "");
}

function normalizeText(
  value: unknown
) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed || null;
}

/*
 * =====================================================
 * GET /api/inventory/branches/[id]
 * =====================================================
 */

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "No autenticado.",
        },
        { status: 401 }
      );
    }

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "ID de sucursal requerido.",
        },
        { status: 400 }
      );
    }

    const storeId =
      await getUserStoreId(
        user.id
      );

    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase
        .from("branches")
        .select(
          `
            id,
            store_id,
            name,
            code,
            description,
            address,
            phone,
            email,
            is_active,
            created_at,
            updated_at
          `
        )
        .eq("id", id)
        .eq(
          "store_id",
          storeId
        )
        .single();

    if (error || !data) {
      return NextResponse.json(
        {
          error:
            "Sucursal no encontrada.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      branch: data,
    });
  } catch (error) {
    console.error(
      "GET /api/inventory/branches/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}

/*
 * =====================================================
 * PUT /api/inventory/branches/[id]
 * =====================================================
 */

export async function PUT(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "No autenticado.",
        },
        { status: 401 }
      );
    }

    const role =
      await getUserRole();

    if (
      !canManageBranches(role)
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para modificar sucursales.",
        },
        { status: 403 }
      );
    }

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "ID de sucursal requerido.",
        },
        { status: 400 }
      );
    }

    const body =
      await request.json();

    const storeId =
      await getUserStoreId(
        user.id
      );

    const supabase =
      getSupabaseAdmin();

    /*
     * Verificar que la sucursal
     * pertenezca a la tienda.
     */

    const {
      data: existingBranch,
      error: existingError,
    } = await supabase
      .from("branches")
      .select(
        `
          id,
          store_id,
          name,
          code,
          description,
          address,
          phone,
          email,
          is_active
        `
      )
      .eq("id", id)
      .eq(
        "store_id",
        storeId
      )
      .single();

    if (
      existingError ||
      !existingBranch
    ) {
      return NextResponse.json(
        {
          error:
            "Sucursal no encontrada.",
        },
        { status: 404 }
      );
    }

    /*
     * =================================================
     * ESTADO
     * =================================================
     *
     * Permite:
     * {
     *   is_active: true
     * }
     *
     * o:
     *
     * {
     *   is_active: false
     * }
     */

    if (
      typeof body.is_active ===
      "boolean"
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("branches")
        .update({
          is_active:
            body.is_active,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", id)
        .eq(
          "store_id",
          storeId
        )
        .select(
          `
            id,
            store_id,
            name,
            code,
            description,
            address,
            phone,
            email,
            is_active,
            created_at,
            updated_at
          `
        )
        .single();

      if (error) {
        console.error(
          "Error actualizando estado de sucursal:",
          error
        );

        return NextResponse.json(
          {
            error:
              error.message ||
              "No se pudo actualizar el estado de la sucursal.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        branch: data,
      });
    }

    /*
     * =================================================
     * ACTUALIZACIÓN DE INFORMACIÓN
     * =================================================
     */

    const name =
      normalizeText(
        body.name
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "El nombre de la sucursal es obligatorio.",
        },
        { status: 400 }
      );
    }

    /*
     * El código no se modifica
     * desde el frontend de edición.
     *
     * Pero lo conservamos desde
     * el registro existente.
     */

    const code =
      existingBranch.code;

    /*
     * Verificar nombre duplicado.
     *
     * No permitimos dos sucursales
     * con el mismo nombre dentro
     * de la misma tienda.
     */

    const {
      data: duplicateName,
      error: duplicateError,
    } = await supabase
      .from("branches")
      .select("id")
      .eq(
        "store_id",
        storeId
      )
      .ilike(
        "name",
        name
      )
      .neq(
        "id",
        id
      )
      .maybeSingle();

    if (duplicateError) {
      console.error(
        "Error verificando nombre duplicado:",
        duplicateError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo validar el nombre de la sucursal.",
        },
        { status: 400 }
      );
    }

    if (duplicateName) {
      return NextResponse.json(
        {
          error:
            "Ya existe otra sucursal con ese nombre.",
        },
        { status: 409 }
      );
    }

    const updateData = {
      name,
      code,
      description:
        normalizeText(
          body.description
        ),
      address:
        normalizeText(
          body.address
        ),
      phone:
        normalizeText(
          body.phone
        ),
      email:
        normalizeText(
          body.email
        ),
      updated_at:
        new Date().toISOString(),
    };

    const {
      data,
      error,
    } = await supabase
      .from("branches")
      .update(
        updateData
      )
      .eq("id", id)
      .eq(
        "store_id",
        storeId
      )
      .select(
        `
          id,
          store_id,
          name,
          code,
          description,
          address,
          phone,
          email,
          is_active,
          created_at,
          updated_at
        `
      )
      .single();

    if (error) {
      console.error(
        "Error actualizando sucursal:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo actualizar la sucursal.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      branch: data,
    });
  } catch (error) {
    console.error(
      "PUT /api/inventory/branches/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}