"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Mismos roles de la matriz de tanda 3. Se duplica aquí (en vez de
// importar lib/auth/require-role.ts) porque ese módulo usa el
// cliente de Supabase del servidor (cookies), que no se puede
// importar desde un componente "use client".
const INVENTORY_MANAGER_ROLES = [
  "owner",
  "admin",
  "manager",
] as const;

type NavItem = {
  name: string;
  href: string;
  icon: string;
  // Si no se indica, el enlace es visible para cualquier rol.
  roles?: readonly string[];
};

const mainNavigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/",
    icon: "🏠",
  },
  {
    name: "Ventas",
    href: "/ventas",
    icon: "🛒",
  },
  {
    name: "Historial de ventas",
    href: "/ventas/historial",
    icon: "🧾",
  },
  {
    name: "Inventario",
    href: "/inventario",
    icon: "📦",
  },
  {
    name: "Escanear código",
    href: "/inventario/escaner",
    icon: "📷",
  },
  {
    name: "Proveedores",
    href: "/proveedores",
    icon: "🏢",
  },
];

// tanda 3, Parte C.1: Entradas, Movimientos y Reportes, visibles
// según el rol (employee solo ve Devoluciones dentro de Entradas).
const entradasNavigation: NavItem[] = [
  {
    name: "Compras",
    href: "/inventario/entradas/compras",
    icon: "🛍️",
    roles: INVENTORY_MANAGER_ROLES,
  },
  {
    name: "Recepciones",
    href: "/inventario/entradas/recepciones",
    icon: "📦",
    roles: INVENTORY_MANAGER_ROLES,
  },
  {
    name: "Devoluciones",
    href: "/inventario/entradas/devoluciones",
    icon: "↩️",
  },
];

const otherNavigation: NavItem[] = [
  {
    name: "Movimientos",
    href: "/inventario/movimientos",
    icon: "🔄",
    roles: INVENTORY_MANAGER_ROLES,
  },
  {
    name: "Reportes",
    href: "/reportes",
    icon: "📊",
    roles: INVENTORY_MANAGER_ROLES,
  },
  // Tanda 5: configuración del negocio (lotes), solo owner.
  {
    name: "Configuración",
    href: "/configuracion",
    icon: "⚙️",
    roles: ["owner"],
  },
];

function isVisible(item: NavItem, role: string | null) {
  if (!item.roles) {
    return true;
  }

  if (!role) {
    return false;
  }

  return (item.roles as readonly string[]).includes(role);
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);

  /*
   * En celular arranca ABIERTO a propósito: al cargar la aplicación,
   * lo primero que se ve es el menú completo (no el contenido de la
   * página), y solo se cierra cuando el cliente elige una opción.
   * En escritorio no aplica ("lg:translate-x-0" ya lo deja siempre
   * visible y fijo, sin depender de este estado).
   */
  const [mobileOpen, setMobileOpen] =
    useState(true);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const { data } = await supabase.rpc("get_my_role");

        if (!cancelled) {
          setRole(typeof data === "string" ? data : null);
        }
      } catch (error) {
        console.error("Error obteniendo el rol:", error);
      }
    }

    const timer = window.setTimeout(() => {
      void loadRole();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    try {
      setLoggingOut(true);

      await supabase.auth.signOut();

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error(
        "Error cerrando sesión:",
        error
      );

      setLoggingOut(false);
    }
  }

  /*
   * tanda 3, Parte C.1: "resaltar solo la opción más específica".
   * En vez de reglas especiales por cada ruta, se calcula qué enlace
   * (de todos los visibles) coincide con la URL actual y, entre los
   * que coinciden, se resalta únicamente el de href más largo
   * (el más específico). Por ejemplo, en /ventas/historial, tanto
   * "/ventas" como "/ventas/historial" coinciden, pero gana este
   * último por ser más largo.
   */
  const visibleHrefs = [
    ...mainNavigation,
    ...entradasNavigation,
    ...otherNavigation,
  ]
    .filter((item) => isVisible(item, role))
    .map((item) => item.href);

  function matches(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    return (
      pathname === href || pathname.startsWith(`${href}/`)
    );
  }

  function isActive(href: string) {
    const matchingHrefs = visibleHrefs.filter(matches);

    if (matchingHrefs.length === 0) {
      return false;
    }

    const mostSpecific = matchingHrefs.reduce((a, b) =>
      b.length > a.length ? b : a
    );

    return href === mostSpecific;
  }

  function renderNavItem(item: NavItem) {
    const active = isActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`
          flex items-center gap-3 rounded-xl px-4 py-3
          text-sm font-medium transition
          ${
            active
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          }
        `}
      >
        <span className="text-lg">{item.icon}</span>

        <span>{item.name}</span>
      </Link>
    );
  }

  return (
    <>
      {/* BOTÓN MENÚ MÓVIL */}

      <button
        type="button"
        onClick={() =>
          setMobileOpen(true)
        }
        className="fixed left-4 top-4 z-40 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xl shadow-sm lg:hidden"
        aria-label="Abrir menú"
      >
        ☰
      </button>

      {/* OVERLAY MÓVIL */}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() =>
            setMobileOpen(false)
          }
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-72 flex-col
          border-r border-gray-200 bg-white
          transition-transform duration-200
          lg:translate-x-0
          ${
            mobileOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >

        {/* LOGO */}

        <div className="flex h-20 items-center border-b border-gray-200 px-6">

          <Link
            href="/"
            onClick={() =>
              setMobileOpen(false)
            }
            className="flex items-center gap-3"
          >

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-xl">
              🐾
            </div>

            <div>

              <p className="font-bold text-gray-900">
                PetStock AI
              </p>

              <p className="text-xs text-gray-500">
                Gestión de tu negocio
              </p>

            </div>

          </Link>

        </div>

        {/* NAVEGACIÓN */}

        <nav className="flex-1 overflow-y-auto p-4">

          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Principal
          </p>

          <div className="space-y-1">
            {mainNavigation.map((item) => renderNavItem(item))}
          </div>

          {entradasNavigation.some((item) =>
            isVisible(item, role)
          ) && (
            <div className="mt-6">
              <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Entradas
              </p>

              <div className="space-y-1">
                {entradasNavigation
                  .filter((item) => isVisible(item, role))
                  .map((item) => renderNavItem(item))}
              </div>
            </div>
          )}

          {otherNavigation.some((item) =>
            isVisible(item, role)
          ) && (
            <div className="mt-6 space-y-1">
              {otherNavigation
                .filter((item) => isVisible(item, role))
                .map((item) => renderNavItem(item))}
            </div>
          )}

        </nav>

        {/* LOGOUT */}

        <div className="border-t border-gray-200 p-4">

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >

            <span className="text-lg">
              🚪
            </span>

            <span>
              {loggingOut
                ? "Cerrando sesión..."
                : "Cerrar sesión"}
            </span>

          </button>

        </div>

      </aside>
    </>
  );
}
