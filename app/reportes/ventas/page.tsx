"use client";

import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getBogotaDateKey,
  getBogotaMonthStartKey,
} from "@/lib/dates";

type PaymentSummaryRow = {
  payment_method: string;
  count: number;
  total: number;
};

type TopProductRow = {
  product_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  revenue: number;
};

type SaleRow = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  total: number;
  created_at: string;
  units: number;
};

type SalesReport = {
  total_revenue: number;
  sale_count: number;
  total_units: number;
  average_ticket: number;
  payment_summary: PaymentSummaryRow[];
  top_products: TopProductRow[];
  sales: SaleRow[];
};

// "Hoy" en Bogotá, no en la zona del navegador.
function getTodayString() {
  return getBogotaDateKey();
}

export default function ReporteVentasPage() {
  const router = useRouter();

  const initialToday = getTodayString();

  const [report, setReport] = useState<SalesReport | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Tanda 4: 403 (employee) muestra un aviso en vez del error.
  const [accessDenied, setAccessDenied] = useState(false);

  const [startDate, setStartDate] = useState(initialToday);
  const [endDate, setEndDate] = useState(initialToday);

  // Rango que realmente respondió el servidor (ver reportes de
  // movimientos: evita que el encabezado muestre fechas que el
  // reporte en pantalla todavía no refleja).
  const [loadedRange, setLoadedRange] = useState({
    desde: initialToday,
    hasta: initialToday,
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
          `/api/reports/sales?desde=${desde}&hasta=${hasta}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (latestRequestRef.current !== requestId) {
          return;
        }

        if (response.status === 403) {
          setAccessDenied(true);
          return;
        }

        if (!response.ok) {
          throw new Error(
            result.error || "Error cargando el reporte."
          );
        }

        setReport(result.report ?? null);
        setLoadedRange({ desde, hasta });
      } catch (error) {
        if (latestRequestRef.current !== requestId) {
          return;
        }

        console.error("ERROR REPORTE VENTAS:", error);

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

  function formatPrice(price: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(price) || 0);
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date(date));
  }

  function formatShortDate(date: string) {
    const [year, month, day] = date.split("-");

    if (!year || !month || !day) {
      return date;
    }

    return `${day}/${month}/${year}`;
  }

  function paymentLabel(paymentMethod: string) {
    switch (paymentMethod) {
      case "efectivo":
        return "Efectivo";

      case "tarjeta":
        return "Tarjeta";

      case "transferencia":
        return "Transferencia";

      case "otro":
        return "Otro";

      default:
        return paymentMethod;
    }
  }

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

  const paymentSummary = report?.payment_summary ?? [];
  const topProducts = report?.top_products ?? [];
  const sales = report?.sales ?? [];
  const totalRevenue = report?.total_revenue ?? 0;
  const totalUnits = report?.total_units ?? 0;
  const saleCount = report?.sale_count ?? 0;
  const averageTicket = report?.average_ticket ?? 0;


  if (accessDenied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-4xl">🔒</p>

          <h1 className="mt-4 text-xl font-bold text-slate-900">
            No tienes acceso a Reportes
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Esta sección es solo para owner, admin o manager.
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
        }
      `}</style>

      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="print-container mx-auto max-w-7xl">
          {/* ENCABEZADO */}

          <div className="no-print mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                PetStock AI
              </p>

              <h1 className="mt-1 text-3xl font-bold text-gray-900">
                Reporte de ventas
              </h1>

              <p className="mt-2 text-gray-600">
                Consulta y genera reportes de las ventas
                registradas.
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

          {/* TITULO PARA IMPRESIÓN */}

          <div className="mb-6 hidden print:block">
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Reporte de ventas
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

          {/* FILTROS */}

          <section className="no-print mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="sales-start-date"
                  className="text-sm font-medium text-gray-700"
                >
                  Fecha inicial
                </label>

                <input
                  id="sales-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) =>
                    setStartDate(event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
              </div>

              <div>
                <label
                  htmlFor="sales-end-date"
                  className="text-sm font-medium text-gray-700"
                >
                  Fecha final
                </label>

                <input
                  id="sales-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) =>
                    setEndDate(event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
              </div>
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
                Actualizar datos
              </button>
            </div>
          </section>

          {/* ERROR */}

          {error && (
            <div className="no-print mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
              <p className="font-semibold">
                Error cargando reporte
              </p>

              <p className="mt-1 text-sm">{error}</p>

              <button
                type="button"
                onClick={() =>
                  void loadReport(startDate, endDate)
                }
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* CARGANDO */}

          {loading ? (
            <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">
                Cargando reporte...
              </p>
            </div>
          ) : (
            <>
              {/* PERÍODO */}

              <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Período del reporte
                </p>

                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatShortDate(loadedRange.desde)} al{" "}
                  {formatShortDate(loadedRange.hasta)}
                </p>
              </div>

              {/* MÉTRICAS */}

              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Total vendido
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {formatPrice(totalRevenue)}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Número de ventas
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {saleCount}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Unidades vendidas
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {totalUnits}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Ticket promedio
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {formatPrice(averageTicket)}
                  </p>
                </div>
              </div>

              {/* RESUMEN */}

              <div className="mb-6 grid gap-6 lg:grid-cols-2">
                {/* MÉTODOS DE PAGO */}

                <section className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <h2 className="text-xl font-bold text-gray-900">
                      Métodos de pago
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Distribución de las ventas del
                      período.
                    </p>
                  </div>

                  {paymentSummary.length === 0 ? (
                    <div className="rounded-xl bg-gray-50 p-8 text-center">
                      <p className="font-medium text-gray-700">
                        No hay ventas en este período.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {paymentSummary.map((summary) => (
                        <div
                          key={summary.payment_method}
                          className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {paymentLabel(
                                summary.payment_method
                              )}
                            </p>

                            <p className="mt-1 text-xs text-gray-500">
                              {summary.count}{" "}
                              {summary.count === 1
                                ? "venta"
                                : "ventas"}
                            </p>
                          </div>

                          <p className="font-bold text-gray-900">
                            {formatPrice(summary.total)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* PRODUCTOS MÁS VENDIDOS */}

                <section className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <h2 className="text-xl font-bold text-gray-900">
                      Productos más vendidos
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Ranking por unidades vendidas.
                    </p>
                  </div>

                  {topProducts.length === 0 ? (
                    <div className="rounded-xl bg-gray-50 p-8 text-center">
                      <p className="font-medium text-gray-700">
                        No hay productos vendidos.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topProducts.map((product, index) => (
                        <div
                          key={product.product_id}
                          className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                              {index + 1}
                            </span>

                            <div>
                              <p className="font-medium text-gray-900">
                                {product.name}
                              </p>

                              {product.sku && (
                                <p className="mt-1 font-mono text-xs text-gray-400">
                                  {product.sku}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="font-bold text-gray-900">
                              {product.quantity}{" "}
                              {product.quantity === 1
                                ? "unidad"
                                : "unidades"}
                            </p>

                            <p className="mt-1 text-xs text-gray-500">
                              {formatPrice(product.revenue)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* DETALLE DE VENTAS */}

              <section className="print-card rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-gray-900">
                    Detalle de ventas
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Todas las ventas incluidas en el período
                    seleccionado.
                  </p>
                </div>

                {sales.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 p-10 text-center">
                    <p className="font-medium text-gray-700">
                      No hay ventas para este período.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Selecciona otro rango de fechas.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[750px]">
                      <thead className="border-b bg-gray-50">
                        <tr className="text-left text-sm text-gray-500">
                          <th className="px-4 py-3 font-medium">
                            Fecha
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Cliente
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Pago
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Unidades
                          </th>

                          <th className="px-4 py-3 text-right font-medium">
                            Total
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y">
                        {sales.map((sale) => (
                          <tr
                            key={sale.id}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-gray-900">
                                {formatDate(
                                  sale.created_at
                                )}
                              </p>

                              <p className="mt-1 font-mono text-xs text-gray-400">
                                {sale.id.slice(0, 8)}...
                              </p>
                            </td>

                            <td className="px-4 py-3 text-sm text-gray-700">
                              {sale.customer_name ||
                                "Cliente general"}
                            </td>

                            <td className="px-4 py-3 text-sm text-gray-700">
                              {paymentLabel(
                                sale.payment_method
                              )}
                            </td>

                            <td className="px-4 py-3 text-center text-sm text-gray-700">
                              {sale.units}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-gray-900">
                              {formatPrice(
                                Number(sale.total || 0)
                              )}
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
                            TOTAL
                          </td>

                          <td className="px-4 py-4 text-center font-bold text-gray-900">
                            {totalUnits}
                          </td>

                          <td className="px-4 py-4 text-right text-lg font-bold text-gray-900">
                            {formatPrice(totalRevenue)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* PIE DEL REPORTE */}

              <section className="mt-6 rounded-2xl bg-gray-900 p-6 text-white print:mt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-gray-400">
                      PetStock AI
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      Reporte generado correctamente
                    </p>

                    <p className="mt-1 text-sm text-gray-400">
                      Período: {formatShortDate(loadedRange.desde)}{" "}
                      al {formatShortDate(loadedRange.hasta)}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm text-gray-400">
                      Total vendido
                    </p>

                    <p className="text-2xl font-bold">
                      {formatPrice(totalRevenue)}
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
