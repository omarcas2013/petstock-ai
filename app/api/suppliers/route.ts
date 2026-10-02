import { NextResponse } from "next/server";
import {
  CATALOG_WRITE_ROLES,
  requireRole,
  requireUser,
} from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireUser();

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, phone, email, created_at")
      .eq("store_id", profile.store_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ERROR OBTENIENDO PROVEEDORES:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener los proveedores." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      suppliers: data || [],
    });
  } catch (error) {
    console.error("ERROR INTERNO:", error);

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
      .insert({
        store_id: profile.store_id,
        name,
        phone: phone || null,
        email: email || null,
      })
      .select("id, name, phone, email, created_at")
      .single();

    if (error) {
      console.error("ERROR GUARDANDO PROVEEDOR:", error);

      return NextResponse.json(
        { error: "No se pudo guardar el proveedor." },
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
    console.error("ERROR INTERNO:", error);

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
