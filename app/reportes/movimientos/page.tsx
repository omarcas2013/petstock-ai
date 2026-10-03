"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getBogotaDateKey,
  getBogotaMonthStartKey,
} from "@/lib/dates";

type MovementRow = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  stock_before: number | null;
  stock_after: number | null;
  created_at: string;
  product_name: string | null;
  product_sku: string | null;
};

type MovementsReport = {
  total_entries: number;
  total_exits: number;
  total_adjustment_variance: number;
  net_change: number;
  movement_count: number;
  movements: MovementRow[];
};

// "Hoy" en Bogotá, no en la zona del navegador.
function getTodayString() {
  return getBogotaDateKey();
}

export default function ReporteMovimientosPage() {
  const router = useRouter();

  const [report, setReport] = useState<MovementsReport | null>(
    null
  );
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

  // Rango que realmente respondió el servidor (puede quedar atrás de
  // startDate/endDate mientras una carga está en curso o si falló),
  // para que el encabezado "Período" nunca muestre fechas que el
  // reporte en pantalla todavía no refleja.
  const [loadedRange, setLoadedRange] = useState({
    desde: startDate,
    hasta: endDate,
  });

  // Descarta una respuesta tardía si el usuario cambió las fechas
  // otra vez antes de que esta llegara.
  const latestRequestRef = useRef(0);

  const loadReport = useCallback(
    async (desde: string, hasta: string) => {
      const requestId = ++latestRequestRef.current;

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `/api/reports/movements?desde=${desde}&hasta=${hasta}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (latestRequestRef.current !== requestId) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Error cargando los movimientos."
          );
        }

        setReport(result.report ?? null);
        setLoadedRange({ desde, hasta });
      } catch (error) {
        if (latestRequestRef.current !== requestId) {
          return;
        }

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
        if (latestRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport(startDate, endDate);
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date(date));
  }

  function formatShortDate(date: string) {
    if (!date) {
      return "";
    }

    const [year, month, day] = date.split("-");

    if (!year || !month || !day) {
      return date;
    }

    return `${day}/${month}/${year}`;
  }

  function movementLabel(movementType: string) {
    switch (movementType.toLowerCase()) {
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

  function movementClass(movementType: string) {
    switch (movementType.toLowerCase()) {
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

  function formatSigned(value: number) {
    return value > 0 ? `+${value}` : String(value);
  }

  /*
   * search y typeFilter solo exploran el detalle del período ya
   * cargado: los totales de arriba (del servidor) siempre son del
   * período completo, para no tener que repetir en el navegador la
   * misma agregación que ya hace report_movements_summary.
   */
  const filteredMovements = useMemo(() => {
    const text = search.trim().toLowerCase();
    const movements = report?.movements ?? [];

    return movements.filter((movement) => {
      const productName =
        movement.product_name?.toLowerCase() || "";

      const sku = movement.product_sku?.toLowerCase() || "";

      const reason = movement.reason?.toLowerCase() || "";

      const matchesSearch =
        text === "" ||
        productName.includes(text) ||
        sku.includes(text) ||
        reason.includes(text);

      const matchesType =
        typeFilter === "todos" ||
        movement.movement_type.toLowerCase() === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [report, search, typeFilter]);

  const hasActiveFilter =
    search.trim() !== "" || typeFilter !== "todos";

  /*
   * Los totales respetan el filtro por tipo y la búsqueda, igual que
   * antes de paginar/mover el cálculo al servidor: report_*_summary
   * siempre trae el período completo, pero la tarjeta de resumen
   * recalcula sobre filteredMovements (lo que de verdad se está
   * viendo en la tabla de detalle).
   */
  const filteredTotals = useMemo(() => {
    let entries = 0;
    let exits = 0;
    let adjustmentVariance = 0;

    for (const movement of filteredMovements) {
      const type = movement.movement_type.toLowerCase();

      if (type === "entrada") {
        entries += Number(movement.quantity || 0);
      } else if (type === "salida") {
        exits += Number(movement.quantity || 0);
      } else if (
        type === "ajuste" &&
        movement.stock_before !== null &&
        movement.stock_after !== null
      ) {
        adjustmentVariance +=
          movement.stock_after - movement.stock_before;
      }
    }

    return {
      count: filteredMovements.length,
      entries,
      exits,
      adjustmentVariance,
      netChange: entries - exits + adjustmentVariance,
    };
  }, [filteredMovements]);

  function handlePrint() {
    window.print();
  }

  function setToday() {
    const today = getTodayString();

    setStartDate(today);
    setEndDate(today);
    void loadReport(today, today);
  }

  function setThisMonth() {
    const firstDay = getBogotaMonthStartKey();
    const lastDay = getTodayString();

    setStartDate(firstDay);
    setEndDate(lastDay);
    void loadReport(firstDay, lastDay);
  }

  const totalMovements = filteredTotals.count;
  const totalEntries = filteredTotals.entries;
  const totalExits = filteredTotals.exits;
  const totalAdjustments = filteredTotals.adjustmentVariance;
  const netChange = filteredTotals.netChange;

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
                Consulta las entradas, salidas y ajustes del
                inventario.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/")}
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
              Período: {formatShortDate(loadedRange.desde)} al{" "}
              {formatShortDate(loadedRange.hasta)}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Generado el{" "}
              {new Intl.DateTimeFormat("es-CO", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "America/Bogota",
              }).format(new Date())}
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
                    setStartDate(event.target.value)
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
                    setEndDate(event.target.value)
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
                    setTypeFilter(event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                >
                  <option value="todos">Todos</option>
                  <option value="entrada">Entradas</option>
                  <option value="salida">Salidas</option>
                  <option value="ajuste">Ajustes</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">
                Buscar en el detalle
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
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
                onClick={() =>
                  void loadReport(startDate, endDate)
                }
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

              <p className="mt-1 text-sm">{error}</p>

              <button
                type="button"
                onClick={() =>
                  void loadReport(startDate, endDate)
                }
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
                  {formatShortDate(loadedRange.desde)} al{" "}
                  {formatShortDate(loadedRange.hasta)}
                </p>
              </div>

              <div className="mb-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

              <p className="no-print mb-6 text-xs text-gray-400">
                {hasActiveFilter
                  ? "Los totales de arriba reflejan la búsqueda y el filtro de tipo activos."
                  : "Los totales de arriba son del período completo."}
              </p>

              <section className="print-card rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-gray-900">
                    Detalle de movimientos
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Historial de movimientos registrados en el
                    período
                    {hasActiveFilter
                      ? ", filtrado por el buscador y/o el tipo."
                      : "."}
                  </p>
                </div>

                {filteredMovements.length === 0 ? (
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
                        {filteredMovements.map((movement) => (
                          <tr
                            key={movement.id}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-gray-900">
                                {formatDate(
                                  movement.created_at
                                )}
                              </p>

                              <p className="mt-1 font-mono text-xs text-gray-400">
                                {movement.id.slice(0, 8)}...
                              </p>
                            </td>

                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">
                                {movement.product_name ||
                                  "Producto"}
                              </p>

                              {movement.product_sku && (
                                <p className="mt-1 font-mono text-xs text-gray-400">
                                  {movement.product_sku}
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
                              {Number(
                                movement.quantity || 0
                              )}
                            </td>

                            <td className="px-4 py-3 text-sm text-gray-700">
                              {movement.reason || "—"}
                            </td>

                            <td className="px-4 py-3 text-center font-medium text-gray-700">
                              {movement.stock_before ?? "—"}
                            </td>

                            <td className="px-4 py-3 text-center font-bold text-gray-900">
                              {movement.stock_after ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>

                      <tfoot className="border-t-2 border-gray-300">
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-4 text-right font-bold text-gray-900"
                          >
                            VARIACIÓN NETA DE STOCK
                            {hasActiveFilter
                              ? " (filtrado)"
                              : " (período completo)"}
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
                      Período: {formatShortDate(loadedRange.desde)}{" "}
                      al {formatShortDate(loadedRange.hasta)}
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
