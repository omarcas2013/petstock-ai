import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Faltan las variables de Supabase."
    );
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

  const {
    data,
    error,
  } = await supabase
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

  return data.store_id;
}

async function getUserRole() {
  const supabase =
    await createServerSupabase();

  const {
    data,
    error,
  } = await supabase.rpc(
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
 * GET /api/inventory/branches
 * =====================================================
 */

export async function GET() {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "No autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    const storeId =
      await getUserStoreId(
        user.id
      );

    const supabase =
      getSupabaseAdmin();

    const {
      data: branches,
      error,
    } = await supabase
      .from("branches")
      .select(`
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
      `)
      .eq(
        "store_id",
        storeId
      )
      .order("name", {
        ascending: true,
      });

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json({
      branches:
        branches || [],
    });
  } catch (error) {
    console.error(
      "ERROR OBTENIENDO SUCURSALES:",
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

/*
 * =====================================================
 * POST /api/inventory/branches
 * =====================================================
 */

export async function POST(
  request: Request
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
        {
          status: 401,
        }
      );
    }

    const role =
      await getUserRole();

    if (
      !canManageBranches(
        role
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para gestionar sucursales.",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      await request.json();

    const name =
      normalizeText(
        body.name
      );

    const code =
      normalizeText(
        body.code
      );

    const description =
      normalizeText(
        body.description
      );

    const address =
      normalizeText(
        body.address
      );

    const phone =
      normalizeText(
        body.phone
      );

    const email =
      normalizeText(
        body.email
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "El nombre de la sucursal es obligatorio.",
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
            "El código de la sucursal es obligatorio.",
        },
        {
          status: 400,
        }
      );
    }

    const storeId =
      await getUserStoreId(
        user.id
      );

    const supabase =
      getSupabaseAdmin();

    /*
     * =================================================
     * Verificar sucursal duplicada
     * =================================================
     */

    const {
      data: existingBranch,
      error: existingError,
    } = await supabase
      .from("branches")
      .select("id")
      .eq(
        "store_id",
        storeId
      )
      .eq(
        "code",
        code
      )
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            existingError.message,
        },
        {
          status: 400,
        }
      );
    }

    if (existingBranch) {
      return NextResponse.json(
        {
          error:
            "Ya existe una sucursal con ese código.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =================================================
     * Crear sucursal
     * =================================================
     */

    const {
      data: branch,
      error: branchError,
    } = await supabase
      .from("branches")
      .insert({
        store_id:
          storeId,

        name,

        code,

        description,

        address,

        phone,

        email,

        is_active:
          true,
      })
      .select()
      .single();

    if (branchError) {
      console.error(
        "ERROR CREANDO SUCURSAL:",
        branchError
      );

      /*
       * 23505 = unique_violation
       */

      if (
        branchError.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Ya existe una sucursal con ese código.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            branchError.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,

        message:
          "Sucursal creada correctamente.",

        branch,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "ERROR CREANDO SUCURSAL:",
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