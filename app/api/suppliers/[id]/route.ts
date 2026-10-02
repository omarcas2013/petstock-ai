import { NextResponse } from "next/server";
import {
  CATALOG_DELETE_ROLES,
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

/*
|--------------------------------------------------------------------------
| GET /api/suppliers/[id]
|--------------------------------------------------------------------------
| Obtiene un proveedor de la tienda del usuario.
*/

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
        { error: "No se proporcionó el ID del proveedor." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, phone, email, created_at")
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .maybeSingle();

    if (error) {
      console.error("ERROR OBTENIENDO PROVEEDOR:", error);

      return NextResponse.json(
        { error: "No se pudo obtener el proveedor." },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Proveedor no encontrado." },
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
      { error: "Error interno del servidor." },
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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(CATALOG_WRITE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "No se proporcionó el ID del proveedor." },
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

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const phone =
      typeof body.phone === "string" ? body.phone.trim() : null;

    const email =
      typeof body.email === "string" ? body.email.trim() : null;

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del proveedor es obligatorio." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("suppliers")
      .update({
        name,
        phone: phone || null,
        email: email || null,
      })
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .select("id, name, phone, email, created_at")
      .maybeSingle();

    if (error) {
      console.error("ERROR ACTUALIZANDO PROVEEDOR:", error);

      return NextResponse.json(
        { error: "No se pudo actualizar el proveedor." },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Proveedor no encontrado." },
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
      { error: "Error interno del servidor." },
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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(CATALOG_DELETE_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "No se proporcionó el ID del proveedor." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", id)
      .eq("store_id", profile.store_id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("ERROR ELIMINANDO PROVEEDOR:", error);

      // 23503 = foreign_key_violation: el proveedor tiene productos
      // o compras asociadas y no se puede borrar sin antes
      // reasignarlos o eliminarlos.
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              "No se puede eliminar: el proveedor tiene productos o compras asociadas.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo eliminar el proveedor." },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Proveedor no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Proveedor eliminado correctamente.",
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO ELIMINANDO PROVEEDOR:",
      error
    );

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
