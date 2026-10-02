"use client";

import { useState } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const navigation = [
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
    name: "Inventario",
    href: "/inventario",
    icon: "📦",
  },
  {
    name: "Escanear código",
    href: "/inventory/scanner",
    icon: "📷",
  },
  {
    name: "Proveedores",
    href: "/proveedores",
    icon: "🏢",
  },
  {
    name: "Historial de ventas",
    href: "/ventas/historial",
    icon: "🧾",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    if (href === "/ventas") {
      return (
        pathname === "/ventas" ||
        (pathname.startsWith("/ventas/") &&
          !pathname.startsWith("/ventas/historial"))
      );
    }

    if (href === "/inventario") {
      return (
        pathname === "/inventario" ||
        pathname.startsWith("/inventario/")
      );
    }

    if (href === "/inventory/scanner") {
      return (
        pathname === "/inventory/scanner" ||
        pathname.startsWith(
          "/inventory/scanner/"
        )
      );
    }

    return pathname === href;
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

            {navigation.map(
              (item) => {

                const active =
                  isActive(
                    item.href
                  );

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() =>
                      setMobileOpen(
                        false
                      )
                    }
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

                    <span className="text-lg">
                      {item.icon}
                    </span>

                    <span>
                      {item.name}
                    </span>

                  </Link>
                );
              }
            )}

          </div>

          {/* PRÓXIMAMENTE */}

          <div className="mt-8">

            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Próximamente
            </p>

            <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-gray-400">

              <span className="text-lg">
                ⚙️
              </span>

              <span>
                Configuración
              </span>

            </div>

          </div>

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
