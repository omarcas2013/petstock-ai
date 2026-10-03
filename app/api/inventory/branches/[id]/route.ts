import { NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";
import { escapeLikePattern } from "@/lib/supabase/like";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

/*
 * =====================================================
 * GET /api/inventory/branches/[id]
 * =====================================================
 */

export async function GET(
  _request: Request,
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
        { error: "ID de sucursal requerido." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
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
      .eq("store_id", profile.store_id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Sucursal no encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      branch: data,
    });
  } catch (error) {
    console.error("GET /api/inventory/branches/[id]:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

/*
 * =====================================================
 * PUT /api/inventory/branches/[id]
 * =====================================================
 *
 * Un solo camino de actualización (antes había un atajo para
 * is_active que ignoraba cualquier otro campo enviado en la misma
 * petición y nunca llegaba a validar nombre duplicado). Si un campo
 * no viene en el body (undefined), se conserva el valor actual.
 */

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
        { error: "ID de sucursal requerido." },
        { status: 400 }
      );
    }

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    /*
     * Verificar que la sucursal
     * pertenezca a la tienda.
     */

    const { data: existingBranch, error: existingError } =
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
          is_active
        `
        )
        .eq("id", id)
        .eq("store_id", storeId)
        .single();

    if (existingError || !existingBranch) {
      return NextResponse.json(
        { error: "Sucursal no encontrada." },
        { status: 404 }
      );
    }

    /*
     * Si un campo no viene (undefined), se conserva el valor
     * actual en vez de limpiarlo.
     */

    const name =
      body.name !== undefined
        ? normalizeText(body.name)
        : existingBranch.name;

    if (!name) {
      return NextResponse.json(
        { error: "El nombre de la sucursal es obligatorio." },
        { status: 400 }
      );
    }

    /*
     * El código no se modifica
     * desde el frontend de edición.
     */

    const code = existingBranch.code;

    const description =
      body.description !== undefined
        ? normalizeText(body.description)
        : existingBranch.description;

    const address =
      body.address !== undefined
        ? normalizeText(body.address)
        : existingBranch.address;

    const phone =
      body.phone !== undefined
        ? normalizeText(body.phone)
        : existingBranch.phone;

    const email =
      body.email !== undefined
        ? normalizeText(body.email)
        : existingBranch.email;

    const isActive =
      typeof body.is_active === "boolean"
        ? body.is_active
        : existingBranch.is_active;

    /*
     * Verificar nombre duplicado.
     *
     * No permitimos dos sucursales
     * con el mismo nombre dentro
     * de la misma tienda.
     */

    const { data: duplicateName, error: duplicateError } =
      await supabase
        .from("branches")
        .select("id")
        .eq("store_id", storeId)
        .ilike("name", escapeLikePattern(name))
        .neq("id", id)
        .maybeSingle();

    if (duplicateError) {
      console.error(
        "Error verificando nombre duplicado:",
        duplicateError
      );

      return NextResponse.json(
        { error: "No se pudo validar el nombre de la sucursal." },
        { status: 400 }
      );
    }

    if (duplicateName) {
      return NextResponse.json(
        { error: "Ya existe otra sucursal con ese nombre." },
        { status: 409 }
      );
    }

    const updateData = {
      name,
      code,
      description,
      address,
      phone,
      email,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("branches")
      .update(updateData)
      .eq("id", id)
      .eq("store_id", storeId)
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
      console.error("Error actualizando sucursal:", error);

      // P0001 = el trigger A7 bloqueó la desactivación porque la
      // sucursal tiene existencias (quantity > 0) asociadas.
      if (error.code === "P0001") {
        return NextResponse.json(
          {
            error: rpcErrorMessage(
              error,
              "No se pudo actualizar la sucursal."
            ),
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo actualizar la sucursal." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      branch: data,
    });
  } catch (error) {
    console.error("PUT /api/inventory/branches/[id]:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
