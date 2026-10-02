import { NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

/*
 * =====================================================
 * GET /api/inventory/branches
 * =====================================================
 */

export async function GET() {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data: branches, error } = await supabase
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
      .eq("store_id", profile.store_id)
      .order("name", { ascending: true });

    if (error) {
      console.error("ERROR OBTENIENDO SUCURSALES:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener las sucursales." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      branches: branches || [],
    });
  } catch (error) {
    console.error("ERROR OBTENIENDO SUCURSALES:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

/*
 * =====================================================
 * POST /api/inventory/branches
 * =====================================================
 */

export async function POST(request: Request) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    const name = normalizeText(body.name);
    const code = normalizeText(body.code);
    const description = normalizeText(body.description);
    const address = normalizeText(body.address);
    const phone = normalizeText(body.phone);
    const email = normalizeText(body.email);

    if (!name) {
      return NextResponse.json(
        { error: "El nombre de la sucursal es obligatorio." },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "El código de la sucursal es obligatorio." },
        { status: 400 }
      );
    }

    /*
     * =================================================
     * Verificar sucursal duplicada
     * =================================================
     */

    const { data: existingBranch, error: existingError } =
      await supabase
        .from("branches")
        .select("id")
        .eq("store_id", profile.store_id)
        .eq("code", code)
        .maybeSingle();

    if (existingError) {
      console.error(
        "ERROR VALIDANDO SUCURSAL DUPLICADA:",
        existingError
      );

      return NextResponse.json(
        { error: "No se pudo validar el código de la sucursal." },
        { status: 400 }
      );
    }

    if (existingBranch) {
      return NextResponse.json(
        { error: "Ya existe una sucursal con ese código." },
        { status: 409 }
      );
    }

    /*
     * =================================================
     * Crear sucursal
     * =================================================
     */

    const { data: branch, error: branchError } =
      await supabase
        .from("branches")
        .insert({
          store_id: profile.store_id,
          name,
          code,
          description,
          address,
          phone,
          email,
          is_active: true,
        })
        .select()
        .single();

    if (branchError) {
      console.error("ERROR CREANDO SUCURSAL:", branchError);

      /*
       * 23505 = unique_violation
       */

      if (branchError.code === "23505") {
        return NextResponse.json(
          { error: "Ya existe una sucursal con ese código." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo crear la sucursal." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Sucursal creada correctamente.",
        branch,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR CREANDO SUCURSAL:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
