"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  sku: string | null;
};

type Movement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  stock_before: number | null;
  stock_after: number | null;
  created_at: string;
  products?: Product | null;
};

function getTodayString() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(
    today.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    today.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function ReporteMovimientosPage() {
  const router = useRouter();

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState(
    getTodayString()
  );

  const [endDate, setEndDate] = useState(
    getTodayString()
  );

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");

  useEffect(() => {
    loadMovements();
  }, []);

  async function loadMovements() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/inventory/movements",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando los movimientos."
        );
      }

      setMovements(
        Array.isArray(result.movements)
          ? result.movements
          : []
      );
    } catch (error) {
      console.error(
        "ERROR REPORTE MOVIMIENTOS:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando el reporte."
      );
    } finally {
      setLoading(false);
    }
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat(
      "es-CO",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone:
          "America/Bogota",
      }
    ).format(new Date(date));
  }

  function formatShortDate(date: string) {
    if (!date) {
      return "";
    }

    const [
      year,
      month,
      day,
    ] = date.split("-");

    if (
      !year ||
      !month ||
      !day
    ) {
      return date;
    }

    return `${day}/${month}/${year}`;
  }

  function movementLabel(
    movementType: string
  ) {
    switch (
      movementType.toLowerCase()
    ) {
      case "entrada":
        return "Entrada";

      case "salida":
        return "Salida";

      case "ajuste":
        return "Ajuste";

      default:
        return movementType;
    }
  }

  function movementClass(
    movementType: string
  ) {
    switch (
      movementType.toLowerCase()
    ) {
      case "entrada":
        return "bg-green-100 text-green-700";

      case "salida":
        return "bg-red-100 text-red-700";

      case "ajuste":
        return "bg-yellow-100 text-yellow-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  const filteredMovements =
    useMemo(() => {
      const text = search
        .trim()
        .toLowerCase();

      const result =
        movements.filter(
          (movement) => {
            const movementDate =
              new Date(
                movement.created_at
              );

            let matchesDate = true;

            if (
              startDate &&
              endDate
            ) {
              const start =
                new Date(
                  `${startDate}T00:00:00`
                );

              const end =
                new Date(
                  `${endDate}T23:59:59.999`
                );

              matchesDate =
                movementDate >=
                  start &&
                movementDate <=
                  end;
            }

            const productName =
              movement.products?.name?.toLowerCase() ||
              "";

            const sku =
              movement.products?.sku?.toLowerCase() ||
              "";

            const reason =
              movement.reason
                ?.toLowerCase() || "";

            const matchesSearch =
              text === "" ||
              productName.includes(
                text
              ) ||
              sku.includes(text) ||
              reason.includes(text);

            const matchesType =
              typeFilter === "todos" ||
              movement.movement_type.toLowerCase() ===
                typeFilter;

            return (
              matchesDate &&
              matchesSearch &&
              matchesType
            );
          }
        );

      return result.sort(
        (a, b) =>
          new Date(
            b.created_at
          ).getTime() -
          new Date(
            a.created_at
          ).getTime()
      );
    }, [
      movements,
      startDate,
      endDate,
      search,
      typeFilter,
    ]);

  const totalMovements =
    filteredMovements.length;

  const totalEntries =
    filteredMovements
      .filter(
        (movement) =>
          movement.movement_type.toLowerCase() ===
          "entrada"
      )
      .reduce(
        (sum, movement) =>
          sum +
          Number(
            movement.quantity || 0
          ),
        0
      );

  const totalExits =
    filteredMovements
      .filter(
        (movement) =>
          movement.movement_type.toLowerCase() ===
          "salida"
      )
      .reduce(
        (sum, movement) =>
          sum +
          Number(
            movement.quantity || 0
          ),
        0
      );

  /*
   * En un ajuste, quantity es el stock final,
   * no las unidades movidas. La variación real es
   * stock_after - stock_before.
   */
  const totalAdjustments =
    filteredMovements
      .filter(
        (movement) =>
          movement.movement_type.toLowerCase() ===
            "ajuste" &&
          movement.stock_before !== null &&
          movement.stock_after !== null
      )
      .reduce(
        (sum, movement) =>
          sum +
          Number(movement.stock_after) -
          Number(movement.stock_before),
        0
      );

  const netChange =
    totalEntries -
    totalExits +
    totalAdjustments;

  function formatSigned(value: number) {
    return value > 0 ? `+${value}` : String(value);
  }

  function handlePrint() {
    window.print();
  }

  function setToday() {
    const today =
      getTodayString();

    setStartDate(today);
    setEndDate(today);
  }

  function setThisMonth() {
    const today = new Date();

    const year =
      today.getFullYear();

    const month = String(
      today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      today.getDate()
    ).padStart(2, "0");

    setStartDate(
      `${year}-${month}-01`
    );

    setEndDate(
      `${year}-${month}-${day}`
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }

          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-container {
            max-width: none !important;
            padding: 0 !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
          }

          .print-break {
            break-inside: avoid;
          }

          table {
            font-size: 10px !important;
          }

          th,
          td {
            padding: 6px 7px !important;
          }
        }
      `}</style>

      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="print-container mx-auto max-w-7xl">
          <div className="no-print mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                PetStock AI
              </p>

              <h1 className="mt-1 text-3xl font-bold text-gray-900">
                Movimientos de inventario
              </h1>

              <p className="mt-2 text-gray-600">
                Consulta las entradas, salidas y ajustes del inventario.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push("/")
                }
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                Dashboard
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
              >
                🖨️ Imprimir reporte
              </button>
            </div>
          </div>

          <div className="mb-6 hidden print:block">
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Reporte de movimientos de inventario
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Período:{" "}
              {formatShortDate(
                startDate
              )}{" "}
              al{" "}
              {formatShortDate(
                endDate
              )}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Generado el{" "}
              {new Intl.DateTimeFormat(
                "es-CO",
                {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone:
                    "America/Bogota",
                }
              ).format(new Date())}
            </p>
          </div>

          <section className="no-print mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Fecha inicial
                </label>

                <input
                  type="date"
                  value={startDate}
                  onChange={(event) =>
                    setStartDate(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Fecha final
                </label>

                <input
                  type="date"
                  value={endDate}
                  onChange={(event) =>
                    setEndDate(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Tipo de movimiento
                </label>

                <select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(
                      event.target.value
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

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">
                Buscar
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Producto, SKU o motivo..."
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={setToday}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hoy
              </button>

              <button
                type="button"
                onClick={setThisMonth}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Este mes
              </button>

              <button
                type="button"
                onClick={loadMovements}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Actualizar
              </button>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("todos");
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Limpiar filtros
              </button>
            </div>
          </section>

          {error && (
            <div className="no-print mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
              <p className="font-semibold">
                Error cargando movimientos
              </p>

              <p className="mt-1 text-sm">
                {error}
              </p>

              <button
                type="button"
                onClick={loadMovements}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Reintentar
              </button>
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">
                Cargando movimientos...
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Período del reporte
                </p>

                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatShortDate(
                    startDate
                  )}{" "}
                  al{" "}
                  {formatShortDate(
                    endDate
                  )}
                </p>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Movimientos
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {totalMovements}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Unidades entradas
                  </p>

                  <p className="mt-2 text-2xl font-bold text-green-600">
                    {totalEntries}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Unidades salidas
                  </p>

                  <p className="mt-2 text-2xl font-bold text-red-600">
                    {totalExits}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Variación por ajustes
                  </p>

                  <p className="mt-2 text-2xl font-bold text-yellow-600">
                    {formatSigned(totalAdjustments)}
                  </p>
                </div>
              </div>

              <section className="print-card rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-gray-900">
                    Detalle de movimientos
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Historial de movimientos registrados en el período.
                  </p>
                </div>

                {filteredMovements.length ===
                0 ? (
                  <div className="rounded-xl bg-gray-50 p-10 text-center">
                    <p className="font-medium text-gray-700">
                      No encontramos movimientos.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Prueba cambiando las fechas o filtros.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[950px]">
                      <thead className="border-b bg-gray-50">
                        <tr className="text-left text-sm text-gray-500">
                          <th className="px-4 py-3 font-medium">
                            Fecha
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Producto
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Tipo
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Cantidad
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Motivo
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Antes
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Después
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y">
                        {filteredMovements.map(
                          (movement) => {
                            const quantity =
                              Number(
                                movement.quantity ||
                                  0
                              );

                            return (
                              <tr
                                key={
                                  movement.id
                                }
                                className="hover:bg-gray-50"
                              >
                                <td className="px-4 py-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {formatDate(
                                      movement.created_at
                                    )}
                                  </p>

                                  <p className="mt-1 font-mono text-xs text-gray-400">
                                    {movement.id.slice(
                                      0,
                                      8
                                    )}
                                    ...
                                  </p>
                                </td>

                                <td className="px-4 py-3">
                                  <p className="font-medium text-gray-900">
                                    {movement.products?.name ||
                                      "Producto"}
                                  </p>

                                  {movement.products?.sku && (
                                    <p className="mt-1 font-mono text-xs text-gray-400">
                                      {
                                        movement.products
                                          .sku
                                      }
                                    </p>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${movementClass(
                                      movement.movement_type
                                    )}`}
                                  >
                                    {movementLabel(
                                      movement.movement_type
                                    )}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-center font-bold text-gray-900">
                                  {quantity}
                                </td>

                                <td className="px-4 py-3 text-sm text-gray-700">
                                  {movement.reason ||
                                    "—"}
                                </td>

                                <td className="px-4 py-3 text-center font-medium text-gray-700">
                                  {movement.stock_before ??
                                    "—"}
                                </td>

                                <td className="px-4 py-3 text-center font-bold text-gray-900">
                                  {movement.stock_after ??
                                    "—"}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>

                      <tfoot className="border-t-2 border-gray-300">
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-4 text-right font-bold text-gray-900"
                          >
                            VARIACIÓN NETA DE STOCK
                          </td>

                          <td className="px-4 py-4 text-center font-bold text-gray-900">
                            {formatSigned(netChange)}
                          </td>

                          <td className="px-4 py-4"></td>

                          <td className="px-4 py-4"></td>

                          <td className="px-4 py-4"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              <section className="mt-6 rounded-2xl bg-gray-900 p-6 text-white print:mt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-gray-400">
                      PetStock AI
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      Reporte de movimientos
                    </p>

                    <p className="mt-1 text-sm text-gray-400">
                      Período:{" "}
                      {formatShortDate(
                        startDate
                      )}{" "}
                      al{" "}
                      {formatShortDate(
                        endDate
                      )}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm text-gray-400">
                      Movimientos registrados
                    </p>

                    <p className="text-2xl font-bold">
                      {totalMovements}
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}