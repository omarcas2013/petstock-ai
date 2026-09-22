"use client";

import Link from "next/link";

const modules = [
  {
    href: "/inventario/entradas/compras",
    icon: "🛒",
    title: "Compras",
    description:
      "Registra las compras realizadas a tus proveedores.",
    action: "Ver compras",
  },
  {
    href: "/inventario/entradas/recepciones",
    icon: "📦",
    title: "Recepciones",
    description:
      "Registra la mercancía que realmente recibes del proveedor.",
    action: "Ver recepciones",
  },
  {
    href: "/inventario/entradas/devoluciones",
    icon: "↩️",
    title: "Devoluciones de clientes",
    description:
      "Registra productos que regresan al inventario desde una venta.",
    action: "Ver devoluciones",
  },
];

export default function EntradasPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2">
              <Link
                href="/inventario"
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                ← Volver a Inventario
              </Link>
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              Entradas de inventario
            </h1>

            <p className="mt-2 text-slate-600">
              Gestiona las diferentes formas en que mercancía ingresa a tu
              inventario.
            </p>
          </div>

          <Link
            href="/inventario/movimientos"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            🔄 Ver movimientos
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {modules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-md"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-3xl">
                {module.icon}
              </div>

              <h2 className="text-xl font-bold text-slate-900">
                {module.title}
              </h2>

              <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600">
                {module.description}
              </p>

              <div className="mt-6 text-sm font-semibold text-slate-900 group-hover:underline">
                {module.action} →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                🛠️ Ajustes y carga manual
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Para inventario inicial o correcciones manuales de existencias.
              </p>
            </div>

            <Link
              href="/inventario"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              📦 Cargar inventario
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
