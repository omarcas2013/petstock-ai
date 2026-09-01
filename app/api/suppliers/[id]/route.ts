
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createClient as createServerSupabase,
} from "@/lib/supabase/server";

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

  const { data, error } =
    await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", userId)
      .single();

  if (error) {
    throw new Error(
      `No se pudo obtener el perfil: ${error.message}`
    );
  }

  if (!data?.store_id) {
    throw new Error(
      "El usuario no tiene una tienda asignada."
    );
  }

  return data.store_id;
}

/*
|--------------------------------------------------------------------------
| GET /api/suppliers/[id]
|--------------------------------------------------------------------------
| Obtiene un proveedor de la tienda del usuario.
*/

export async function GET(
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
          error: "No autenticado.",
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
            "No se proporcionó el ID del proveedor.",
        },
        { status: 400 }
      );
    }

    const storeId =
      await getUserStoreId(user.id);

    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase
        .from("suppliers")
        .select(
          "id, name, phone, email, created_at"
        )
        .eq("id", id)
        .eq("store_id", storeId)
        .single();

    if (error) {
      console.error(
        "ERROR OBTENIENDO PROVEEDOR:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo obtener el proveedor.",
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Proveedor no encontrado.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      supplier: data,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO OBTENIENDO PROVEEDOR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno obteniendo proveedor.",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PUT /api/suppliers/[id]
|--------------------------------------------------------------------------
| Actualiza un proveedor de la tienda del usuario.
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
          error: "No autenticado.",
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
            "No se proporcionó el ID del proveedor.",
        },
        { status: 400 }
      );
    }

    const body =
      await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : null;

    const email =
      typeof body.email === "string"
        ? body.email.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        {
          error:
            "El nombre del proveedor es obligatorio.",
        },
        { status: 400 }
      );
    }

    const storeId =
      await getUserStoreId(user.id);

    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase
        .from("suppliers")
        .update({
          name,
          phone: phone || null,
          email: email || null,
        })
        .eq("id", id)
        .eq("store_id", storeId)
        .select(
          "id, name, phone, email, created_at"
        )
        .single();

    if (error) {
      console.error(
        "ERROR ACTUALIZANDO PROVEEDOR:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo actualizar el proveedor.",
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Proveedor no encontrado.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      supplier: data,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO ACTUALIZANDO PROVEEDOR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno actualizando proveedor.",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/suppliers/[id]
|--------------------------------------------------------------------------
| Elimina un proveedor de la tienda del usuario.
*/

export async function DELETE(
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
          error: "No autenticado.",
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
            "No se proporcionó el ID del proveedor.",
        },
        { status: 400 }
      );
    }

    const storeId =
      await getUserStoreId(user.id);

    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase
        .from("suppliers")
        .delete()
        .eq("id", id)
        .eq("store_id", storeId)
        .select("id")
        .single();

    if (error) {
      console.error(
        "ERROR ELIMINANDO PROVEEDOR:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            "No se pudo eliminar el proveedor.",
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Proveedor no encontrado.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Proveedor eliminado correctamente.",
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO ELIMINANDO PROVEEDOR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno eliminando proveedor.",
      },
      { status: 500 }
    );
  }
}
