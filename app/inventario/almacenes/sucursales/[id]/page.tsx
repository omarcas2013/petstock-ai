"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Branch = {
  id: string;
  store_id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type WarehouseBranch = {
  id: string;
  name: string;
  code: string;
};

type Warehouse = {
  id: string;
  store_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: WarehouseBranch | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCapacity(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Sin capacidad definida";
  }

  return `${value.toLocaleString("es-CO")} unidades`;
}

export default function BranchDetailPage() {
  const params = useParams();
  const router = useRouter();

  const branchId = Array.isArray(params?.id)
    ? params.id[0]
    : params?.id;

  const [branch, setBranch] = useState<Branch | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [error, setError] = useState("");

  async function loadBranch() {
    if (!branchId) return;

    try {
      setError("");

      const response = await fetch(
        `/api/inventory/branches/${branchId}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "No se pudo cargar la sucursal."
        );
      }

      setBranch(data.branch ?? null);
    } catch (err) {
      console.error("Error cargando sucursal:", err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la sucursal."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadWarehouses() {
    if (!branchId) return;

    try {
      setLoadingWarehouses(true);

      const response = await fetch(
        "/api/inventory/warehouses",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "No se pudieron cargar los almacenes."
        );
      }

      const allWarehouses: Warehouse[] =
        data.warehouses ?? [];

      const branchWarehouses = allWarehouses.filter(
        (warehouse) =>
          warehouse.branch_id === branchId
      );

      setWarehouses(branchWarehouses);
    } catch (err) {
      console.error(
        "Error cargando almacenes de la sucursal:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los almacenes."
      );
    } finally {
      setLoadingWarehouses(false);
    }
  }

  useEffect(() => {
    if (!branchId) return;

    loadBranch();
    loadWarehouses();
  }, [branchId]);

  const activeWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) => warehouse.is_active
      ),
    [warehouses]
  );

  const inactiveWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) => !warehouse.is_active
      ),
    [warehouses]
  );

  const totalCapacity = useMemo(() => {
    return warehouses.reduce((total, warehouse) => {
      return total + (warehouse.capacity ?? 0);
    }, 0);
  }, [warehouses]);

  const warehousesWithCapacity = useMemo(() => {
    return warehouses.filter(
      (warehouse) =>
        warehouse.capacity !== null &&
        warehouse.capacity !== undefined
    );
  }, [warehouses]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="animate-pulse space-y-5">
              <div className="h-8 w-64 rounded bg-slate-200" />
              <div className="h-4 w-96 rounded bg-slate-200" />
              <div className="grid gap-4 md:grid-cols-4">
                <div className="h-28 rounded-xl bg-slate-100" />
                <div className="h-28 rounded-xl bg-slate-100" />
                <div className="h-28 rounded-xl bg-slate-100" />
                <div className="h-28 rounded-xl bg-slate-100" />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error && !branch) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <Link
              href="/inventario/almacenes/sucursales"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Volver a sucursales
            </Link>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-bold text-red-800">
              No se pudo cargar la sucursal
            </h1>

            <p className="mt-2 text-sm text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadBranch();
                loadWarehouses();
              }}
              className="mt-5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!branch) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Sucursal no encontrada
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              La sucursal solicitada no existe o no está
              disponible.
            </p>

            <Link
              href="/inventario/almacenes/sucursales"
              className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Volver a sucursales
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/inventario/almacenes/sucursales"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Volver a sucursales
            </Link>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {branch.name}
              </h1>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  branch.is_active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {branch.is_active
                  ? "Activa"
                  : "Inactiva"}
              </span>

              <span className="rounded-lg bg-blue-50 px-3 py-1 font-mono text-sm font-semibold text-blue-700">
                {branch.code}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Detalle de la sucursal y almacenes asociados.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventario/almacenes/sucursales"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              🏢 Sucursales
            </Link>

            <Link
              href="/inventario/almacenes"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              🏭 Almacenes
            </Link>
          </div>
        </div>

        {/* ERROR SECUNDARIO */}
        {error && branch && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {/* RESUMEN */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Almacenes
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {warehouses.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {activeWarehouses.length} activos ·{" "}
              {inactiveWarehouses.length} inactivos
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Capacidad total
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalCapacity.toLocaleString("es-CO")}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              unidades configuradas
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Almacenes con capacidad
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {warehousesWithCapacity.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              de {warehouses.length} asociados
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Estado
            </p>

            <p
              className={`mt-2 text-2xl font-bold ${
                branch.is_active
                  ? "text-emerald-600"
                  : "text-slate-500"
              }`}
            >
              {branch.is_active
                ? "Operativa"
                : "Inactiva"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Código {branch.code}
            </p>
          </div>
        </section>

        {/* INFORMACIÓN DE LA SUCURSAL */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-bold text-slate-900">
              Información de la sucursal
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Datos generales y de contacto.
            </p>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Nombre
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {branch.name}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Código
              </p>

              <p className="mt-1 font-mono font-semibold text-slate-900">
                {branch.code}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Teléfono
              </p>

              <p className="mt-1 font-medium text-slate-700">
                {branch.phone || "No registrado"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Email
              </p>

              <p className="mt-1 break-all font-medium text-slate-700">
                {branch.email || "No registrado"}
              </p>
            </div>

            <div className="md:col-span-2 xl:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Dirección
              </p>

              <p className="mt-1 font-medium text-slate-700">
                {branch.address || "No registrada"}
              </p>
            </div>

            <div className="md:col-span-2 xl:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Descripción
              </p>

              <p className="mt-1 whitespace-pre-wrap font-medium text-slate-700">
                {branch.description ||
                  "Sin descripción registrada."}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Creada
              </p>

              <p className="mt-1 text-sm font-medium text-slate-700">
                {formatDate(branch.created_at)}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Última actualización
              </p>

              <p className="mt-1 text-sm font-medium text-slate-700">
                {formatDate(branch.updated_at)}
              </p>
            </div>
          </div>
        </section>

        {/* ALMACENES */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Almacenes de la sucursal
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Almacenes asociados a {branch.name}.
              </p>
            </div>

            <Link
              href="/inventario/almacenes"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Gestionar almacenes
            </Link>
          </div>

          {loadingWarehouses ? (
            <div className="space-y-3 p-6">
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">🏭</div>

              <h3 className="mt-3 text-lg font-bold text-slate-900">
                No hay almacenes asociados
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Esta sucursal todavía no tiene almacenes
                asignados.
              </p>

              <Link
                href="/inventario/almacenes"
                className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Ir a almacenes
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Almacén
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Código
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dirección
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Capacidad
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Estado
                    </th>

                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 bg-white">
                  {warehouses.map((warehouse) => (
                    <tr
                      key={warehouse.id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {warehouse.name}
                          </p>

                          {warehouse.description && (
                            <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                              {warehouse.description}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
                          {warehouse.code}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {warehouse.address ||
                          "Sin dirección"}
                      </td>

                      <td className="px-6 py-4 text-sm font-medium text-slate-700">
                        {formatCapacity(
                          warehouse.capacity
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            warehouse.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {warehouse.is_active
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/inventario/almacenes/${warehouse.id}`
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Ver almacén →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ESTRUCTURA */}
        <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Estructura de inventario
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Esta sucursal forma parte de la estructura física
            de inventario.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-semibold">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100">
              🏢 {branch.name}
            </div>

            <span className="text-slate-400">→</span>

            <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100">
              🏭 Almacenes
            </div>

            <span className="text-slate-400">→</span>

            <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100">
              📦 Ubicaciones
            </div>

            <span className="text-slate-400">→</span>

            <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-blue-100">
              📊 Stock
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}