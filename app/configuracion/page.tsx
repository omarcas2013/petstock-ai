"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/*
 * Tanda 5: configuración del negocio. Por ahora solo el manejo de lotes
 * y vencimientos (FEFO). Solo el owner puede cambiarla.
 */

type StoreConfig = {
  id: string;
  name: string | null;
  inventory_mode: string | null;
  manages_lots: boolean;
};

const INVENTORY_MODE_LABELS: Record<string, string> = {
  global: "Global (sin ubicaciones)",
  branch: "Por sucursal",
  warehouse: "Por almacén",
  location: "Por almacén y ubicación",
};

export default function ConfiguracionPage() {
  const [store, setStore] = useState<StoreConfig | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/store", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "No se pudo cargar la configuración del negocio."
          );
        }

        if (!cancelled) {
          setStore(result.store);
          setRole(result.role ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la configuración del negocio."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleLots() {
    if (!store) {
      return;
    }

    const next = !store.manages_lots;

    const confirmed = window.confirm(
      next
        ? "¿Activar el manejo de lotes y vencimientos para este negocio? Después podrás marcar qué productos usan lotes."
        : "¿Apagar el manejo de lotes? Solo es posible si ningún lote tiene unidades. Todos los productos dejarán de manejar lotes."
    );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const response = await fetch("/api/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manages_lots: next }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "No se pudo guardar la configuración."
        );
      }

      setStore({ ...store, manages_lots: next });
      setMessage(
        next
          ? "Lotes activados. Marca \"¿Maneja lotes y vencimientos?\" en cada producto que los use."
          : "Lotes desactivados."
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la configuración."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <p className="text-slate-500">Cargando configuración...</p>
      </main>
    );
  }

  if (role !== null && role !== "owner") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-4xl">🔒</p>

          <h1 className="mt-4 text-xl font-bold text-slate-900">
            No tienes acceso a Configuración
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Esta sección es solo para el owner del negocio.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900">
          Configuración del negocio
        </h1>

        <p className="mt-2 text-slate-500">
          {store?.name || "Tu negocio"}
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {message}
          </div>
        )}

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Lotes y vencimientos
              </h2>

              <p className="mt-1 max-w-xl text-sm text-slate-600">
                Al activarlo, cada producto puede marcarse como
                &quot;maneja lotes&quot;. Las ventas y salidas
                descuentan primero el lote que vence antes (FEFO), las
                devoluciones vuelven al lote de la venta y el dashboard
                avisa lo que vence en los próximos 60 días.
              </p>
            </div>

            <button
              type="button"
              onClick={toggleLots}
              disabled={saving || !store}
              className={`shrink-0 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50 ${
                store?.manages_lots
                  ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              {saving
                ? "Guardando..."
                : store?.manages_lots
                  ? "Desactivar lotes"
                  : "Activar lotes"}
            </button>
          </div>

          <p className="mt-4 text-sm">
            Estado:{" "}
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                store?.manages_lots
                  ? "bg-green-50 text-green-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {store?.manages_lots ? "Activo" : "Inactivo"}
            </span>
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Modalidad de inventario
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Define dónde se reciben las compras.
          </p>

          <p className="mt-3 font-semibold text-slate-900">
            {INVENTORY_MODE_LABELS[store?.inventory_mode ?? ""] ??
              store?.inventory_mode ??
              "Sin definir"}
          </p>
        </section>
      </div>
    </main>
  );
}
