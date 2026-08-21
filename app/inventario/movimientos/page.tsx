"use client";

import { useEffect, useMemo, useState } from "react";

type MovementType = "entrada" | "salida" | "ajuste";

type Movement = {
  id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  stock_before: number | null;
  stock_after: number | null;
  reason: string | null;
  created_at: string;
  products:
    | {
        name: string;
        sku: string | null;
      }
    | null;
};

export default function MovimientosPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] =
    useState<"todos" | MovementType>("todos");
   
 
  async function loadMovements() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/inventory/movements"
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando movimientos"
        );
      }

      setMovements(result.movements || []);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando movimientos"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  loadMovements();
  }, []);

  const filteredMovements = useMemo(() => {
    const searchText = search
      .trim()
      .toLowerCase();

    return movements.filter((movement) => {
      const matchesType =
        typeFilter === "todos" ||
        movement.movement_type === typeFilter;

      if (!matchesType) {
        return false;
      }

      if (!searchText) {
        return true;
      }

      const productName =
        movement.products?.name?.toLowerCase() || "";

      const sku =
        movement.products?.sku?.toLowerCase() || "";

      const reason =
        movement.reason?.toLowerCase() || "";

      return (
        productName.includes(searchText) ||
        sku.includes(searchText) ||
        reason.includes(searchText)
      );
    });
  }, [movements, search, typeFilter]);

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  }

  function getTypeLabel(type: MovementType) {
    if (type === "entrada") {
      return "Entrada";
    }

    if (type === "salida") {
      return "Salida";
    }

    return "Ajuste";
  }

  function getTypeClass(type: MovementType) {
    if (type === "entrada") {
      return "bg-green-100 text-green-700";
    }

    if (type === "salida") {
      return "bg-red-100 text-red-700";
    }

    return "bg-blue-100 text-blue-700";
  }

  function getQuantity(movement: Movement) {
    if (movement.movement_type === "entrada") {
      return `+${movement.quantity}`;
    }

    if (movement.movement_type === "salida") {
      return `-${movement.quantity}`;
    }

    return movement.quantity.toString();
  }

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
              Movimientos de inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Consulta el historial de entradas, salidas y ajustes.
            </p>
          </div>

          <a
            href="/inventario"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Volver al inventario
          </a>
        </div>

        {/* FILTROS */}

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">

          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="text-sm font-medium text-gray-700">
                Buscar
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Producto, SKU o motivo..."
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Tipo de movimiento
              </label>

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(
                    e.target.value as
                      | "todos"
                      | MovementType
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
              >
                <option value="todos">
                  Todos
                </option>

                <option value="entrada">
                  Entradas
                </option>

                <option value="salida">
                  Salidas
                </option>

                <option value="ajuste">
                  Ajustes
                </option>
              </select>
            </div>

          </div>

        </div>

        {/* CONTADOR */}

        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Mostrando{" "}
            <span className="font-semibold text-gray-700">
              {filteredMovements.length}
            </span>{" "}
            movimiento
            {filteredMovements.length !== 1
              ? "s"
              : ""}
          </p>
        </div>

        {/* LOADING */}

        {loading && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando movimientos...
            </p>
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-medium">
              Error cargando movimientos
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              onClick={loadMovements}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {/* TABLA */}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            {filteredMovements.length === 0 ? (
              <div className="p-12 text-center">

                <div className="text-4xl">
                  📦
                </div>

                <p className="mt-4 font-medium text-gray-700">
                  No encontramos movimientos.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Prueba cambiando los filtros.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[900px]">

                  <thead className="border-b bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">

                      <th className="px-5 py-4 font-medium">
                        Fecha
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Producto
                      </th>

                      <th className="px-5 py-4 font-medium">
                        SKU
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Tipo
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Cantidad
                      </th>
                        
                      <th className="px-5 py-4 font-medium">
                        Stock
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Motivo
                      </th>

                    </tr>
                  </thead>

                  <tbody className="divide-y">

                    {filteredMovements.map(
                      (movement) => (
                        <tr
                          key={movement.id}
                          className="hover:bg-gray-50"
                        >

                          <td className="px-5 py-4 text-sm text-gray-600">
                            {formatDate(
                              movement.created_at
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-medium text-gray-900">
                              {movement.products
                                ?.name || "—"}
                            </div>
                          </td>

                          <td className="px-5 py-4 font-mono text-sm text-gray-600">
                            {movement.products
                              ?.sku || "—"}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${getTypeClass(
                                movement.movement_type
                              )}`}
                            >
                              {getTypeLabel(
                                movement.movement_type
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-semibold">
                            {getQuantity(
                              movement
                            )}
                          </td>
                            <td className="px-5 py-4 text-sm">
                            {movement.stock_before !== null &&
                            movement.stock_after !== null ? (
                            <span className="font-medium text-gray-700">
                             {movement.stock_before} →{" "}
                             {movement.stock_after}
                            </span>
                             ) : (
                             <span className="text-gray-400">
                               —
                              </span>
                             )}
                            </td>
                            
                          <td className="px-5 py-4 text-gray-700">
                            {movement.reason ||
                              "—"}
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