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

export async function GET() {
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
        .eq("store_id", storeId)
        .order("created_at", {
          ascending: false,
        });

    if (error) {
      console.error(
        "ERROR OBTENIENDO PROVEEDORES:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      suppliers: data || [],
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO:",
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

export async function POST(
  request: Request
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
        .insert({
          store_id: storeId,
          name,
          phone: phone || null,
          email: email || null,
        })
        .select(
          "id, name, phone, email, created_at"
        )
        .single();

    if (error) {
      console.error(
        "ERROR GUARDANDO PROVEEDOR:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        supplier: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "ERROR INTERNO:",
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