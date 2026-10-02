import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/*
 * =======================================================================
 * MATRIZ DE ROLES (tanda-2-seguridad.md, confirmada contra RLS)
 * =======================================================================
 *
 * | Acción                                              | owner admin manager employee |
 * | Vender, devoluciones                                |   ✓     ✓      ✓       ✓     |
 * | Compras y recepciones                               |   ✓     ✓      ✓             |
 * | Movimientos/ajustes/traslados/cargue/escáner (stock) |   ✓     ✓      ✓             |
 * | Crear/editar proveedores, almacenes, ubicaciones,    |   ✓     ✓      ✓             |
 * |   productos                                          |                              |
 * | Borrar proveedores, almacenes, ubicaciones, productos|   ✓     ✓                    |
 * | Ver costo de compra (purchase_price)                |   ✓     ✓      ✓             |
 * =======================================================================
 */

export type Role = "owner" | "admin" | "manager" | "employee";

export const ALL_ROLES: Role[] = [
  "owner",
  "admin",
  "manager",
  "employee",
];

/** Vender y registrar devoluciones. */
export const SALES_ROLES: Role[] = ALL_ROLES;

/**
 * Compras, recepciones, movimientos manuales, ajustes, traslados,
 * carga inicial/masiva y movimientos de stock desde el escáner.
 */
export const INVENTORY_MANAGER_ROLES: Role[] = [
  "owner",
  "admin",
  "manager",
];

/** Crear o editar proveedores, almacenes, sucursales, ubicaciones, productos. */
export const CATALOG_WRITE_ROLES: Role[] = [
  "owner",
  "admin",
  "manager",
];

/** Borrar proveedores, almacenes, sucursales, ubicaciones, productos. */
export const CATALOG_DELETE_ROLES: Role[] = [
  "owner",
  "admin",
];

/** Ver el costo de compra (purchase_price). */
export const COST_VIEW_ROLES: Role[] = [
  "owner",
  "admin",
  "manager",
];

export type Profile = {
  store_id: string;
  role: Role;
};

type AuthSuccess = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
};

type AuthFailure = {
  ok: false;
  response: NextResponse;
};

export type AuthResult = AuthSuccess | AuthFailure;

function unauthenticated(): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "No autenticado" },
      { status: 401 }
    ),
  };
}

function profileLookupFailed(): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    ),
  };
}

function noStore(): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "No se encontró la tienda del usuario" },
      { status: 400 }
    ),
  };
}

function noRole(): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "No tienes permisos para esta acción" },
      { status: 403 }
    ),
  };
}

function forbidden(): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "No tienes permisos para esta acción" },
      { status: 403 }
    ),
  };
}

/**
 * Obtiene el usuario autenticado y su perfil (store_id, role) a través
 * del cliente de sesión, sin exigir ningún rol en particular. Útil
 * para rutas de lectura que solo necesitan la tienda del usuario.
 *
 * Devuelve 401 si no hay sesión, 400 si el perfil no tiene tienda u
 * rol asignados.
 */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return unauthenticated();
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("store_id, role")
    .eq("id", user.id)
    .single();

  /*
   * Tres casos distintos, tres respuestas distintas:
   *
   * - La consulta falló por una razón que no es "no encontrado"
   *   (conexión, permisos de la propia tabla profiles, etc.):
   *   es un error nuestro, no del usuario -> 500 genérico, sin
   *   detalle de Postgres.
   * - El perfil existe pero no tiene tienda asignada: el usuario
   *   quedó mal configurado -> 400, mensaje explicativo.
   * - El perfil tiene tienda pero no tiene rol: también es una
   *   cuenta mal configurada, pero la tratamos como "sin permisos"
   *   -> 403, igual que un rol no autorizado.
   */
  if (profileError) {
    console.error(
      "Error consultando el perfil del usuario:",
      profileError
    );

    return profileLookupFailed();
  }

  if (!profile?.store_id) {
    return noStore();
  }

  if (!profile.role) {
    return noRole();
  }

  return {
    ok: true,
    supabase,
    user,
    profile: {
      store_id: profile.store_id,
      role: profile.role as Role,
    },
  };
}

/**
 * Igual que requireUser(), pero además exige que el rol del usuario
 * esté en allowedRoles. Devuelve 403 si no lo está.
 *
 * Uso típico en una ruta:
 *
 *   const auth = await requireRole(INVENTORY_MANAGER_ROLES);
 *   if (!auth.ok) return auth.response;
 *   const { supabase, profile } = auth;
 */
export async function requireRole(
  allowedRoles: Role[]
): Promise<AuthResult> {
  const auth = await requireUser();

  if (!auth.ok) {
    return auth;
  }

  if (!allowedRoles.includes(auth.profile.role)) {
    return forbidden();
  }

  return auth;
}

/**
 * Oculta campos de costo (purchase_price, unit_cost, subtotal, total
 * de una compra, etc.) cuando el rol no está en COST_VIEW_ROLES.
 *
 * Única función que decide "¿puede este rol ver costos?": las rutas
 * que devuelven costos la usan en vez de repetir
 * `COST_VIEW_ROLES.includes(role)` cada una por su cuenta.
 *
 * Uso típico:
 *
 *   hideCostFields(product, profile.role, ["purchase_price"])
 *
 * Para un registro con un arreglo anidado (por ejemplo, las líneas de
 * una compra), se llama una vez por cada elemento del arreglo.
 */
export function hideCostFields<T extends Record<string, unknown>>(
  record: T,
  role: Role,
  fields: readonly string[]
): T {
  if (COST_VIEW_ROLES.includes(role)) {
    return record;
  }

  const masked: Record<string, unknown> = { ...record };

  for (const field of fields) {
    masked[field] = null;
  }

  return masked as T;
}
