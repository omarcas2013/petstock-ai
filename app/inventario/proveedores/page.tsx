"use client";

import { useEffect, useMemo, useState } from "react";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  async function loadSuppliers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/suppliers");

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando proveedores"
        );
      }

      setSuppliers(result.suppliers || []);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando proveedores"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return suppliers;
    }

    return suppliers.filter((supplier) => {
      return (
        supplier.name
          .toLowerCase()
          .includes(searchText) ||
        supplier.phone
          ?.toLowerCase()
          .includes(searchText) ||
        supplier.email
          ?.toLowerCase()
          .includes(searchText)
      );
    });
  }, [suppliers, search]);

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* ENCABEZADO */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Proveedores
            </h1>

            <p className="mt-2 text-gray-600">
              Gestiona los proveedores de tus productos.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/inventario"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Volver al inventario
            </a>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              + Nuevo proveedor
            </button>
          </div>
        </div>

        {/* BUSCADOR */}

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-gray-700">
            Buscar proveedor
          </label>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, teléfono o email..."
            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>

        {/* CONTADOR */}

        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Mostrando{" "}
            <span className="font-semibold text-gray-700">
              {filteredSuppliers.length}
            </span>{" "}
            proveedor
            {filteredSuppliers.length !== 1 ? "es" : ""}
          </p>
        </div>

        {/* LOADING */}

        {loading && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando proveedores...
            </p>
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-medium">
              Error cargando proveedores
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={loadSuppliers}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {/* TABLA */}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            {filteredSuppliers.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl">
                  🏢
                </div>

                <p className="mt-4 font-medium text-gray-700">
                  No encontramos proveedores.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Prueba con otro término de búsqueda.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[800px]">

                  <thead className="border-b bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">

                      <th className="px-5 py-4 font-medium">
                        Proveedor
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Teléfono
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Email
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Registrado
                      </th>

                      <th className="w-[130px] whitespace-nowrap px-5 py-4 font-medium">
                        Acciones
                      </th>

                    </tr>
                  </thead>

                  <tbody className="divide-y">

                    {filteredSuppliers.map(
                      (supplier) => (
                        <tr
                          key={supplier.id}
                          className="hover:bg-gray-50"
                        >

                          <td className="px-5 py-4">
                            <div className="font-medium text-gray-900">
                              {supplier.name}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {supplier.phone || "—"}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {supplier.email || "—"}
                          </td>

                          <td className="px-5 py-4 text-sm text-gray-600">
                            {new Intl.DateTimeFormat(
                              "es-CO",
                              {
                                dateStyle: "medium",
                              }
                            ).format(
                              new Date(
                                supplier.created_at
                              )
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <button
                              type="button"
                              className="inline-flex w-fit min-w-[90px] items-center justify-center whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Editar
                            </button>
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </div>
        )}

      </div>
    </main>
  );
}