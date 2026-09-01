"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  sku: string | null;
};

type SaleItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: Product | null;
};

type Sale = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  total: number;
  created_at: string;
  sale_items?: SaleItem[] | null;
};

type ProductSummary = {
  productId: string;
  name: string;
  sku: string | null;
  quantity: number;
  revenue: number;
};

function getTodayString() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(
    today.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    today.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function ReporteVentasPage() {
  const router = useRouter();

  const initialToday = getTodayString();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] =
    useState(initialToday);

  const [endDate, setEndDate] =
    useState(initialToday);

  const loadSales = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/sales", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando las ventas.",
        );
      }

      setSales(
        Array.isArray(result.sales)
          ? result.sales
          : [],
      );
    } catch (error) {
      console.error(
        "ERROR REPORTE VENTAS:",
        error,
      );

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando el reporte.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSales();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadSales]);

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
    const [year, month, day] =
      date.split("-");

    if (!year || !month || !day) {
      return date;
    }

    return `${day}/${month}/${year}`;
  }

  const filteredSales = useMemo(() => {
    if (!startDate || !endDate) {
      return sales;
    }

    const start = new Date(
      `${startDate}T00:00:00`,
    );

    const end = new Date(
      `${endDate}T23:59:59.999`,
    );

    return sales
      .filter((sale) => {
        const saleDate = new Date(
          sale.created_at,
        );

        return (
          saleDate >= start &&
          saleDate <= end
        );
      })
      .sort(
        (a, b) =>
          new Date(
            b.created_at,
          ).getTime() -
          new Date(
            a.created_at,
          ).getTime(),
      );
  }, [sales, startDate, endDate]);

  const totalRevenue = useMemo(() => {
    return filteredSales.reduce(
      (sum, sale) =>
        sum + Number(sale.total || 0),
      0,
    );
  }, [filteredSales]);

  const totalUnits = useMemo(() => {
    return filteredSales.reduce(
      (sum, sale) => {
        const items = Array.isArray(
          sale.sale_items,
        )
          ? sale.sale_items
          : [];

        return (
          sum +
          items.reduce(
            (itemSum, item) =>
              itemSum +
              Number(item.quantity || 0),
            0,
          )
        );
      },
      0,
    );
  }, [filteredSales]);

  const averageTicket = useMemo(() => {
    if (filteredSales.length === 0) {
      return 0;
    }

    return (
      totalRevenue /
      filteredSales.length
    );
  }, [
    filteredSales.length,
    totalRevenue,
  ]);

  const paymentSummary = useMemo(() => {
    const summary = new Map<
      string,
      {
        count: number;
        total: number;
      }
    >();

    for (const sale of filteredSales) {
      const method =
        sale.payment_method || "otro";

      const current =
        summary.get(method) || {
          count: 0,
          total: 0,
        };

      summary.set(method, {
        count: current.count + 1,
        total:
          current.total +
          Number(sale.total || 0),
      });
    }

    return [...summary.entries()].sort(
      (a, b) =>
        b[1].total - a[1].total,
    );
  }, [filteredSales]);

  const productSummary = useMemo(() => {
    const products = new Map<
      string,
      ProductSummary
    >();

    for (const sale of filteredSales) {
      const items = Array.isArray(
        sale.sale_items,
      )
        ? sale.sale_items
        : [];

      for (const item of items) {
        const existing =
          products.get(item.product_id);

        const productName =
          item.products?.name ||
          "Producto";

        const sku =
          item.products?.sku || null;

        if (existing) {
          existing.quantity += Number(
            item.quantity || 0,
          );

          existing.revenue += Number(
            item.subtotal || 0,
          );
        } else {
          products.set(item.product_id, {
            productId:
              item.product_id,
            name: productName,
            sku,
            quantity: Number(
              item.quantity || 0,
            ),
            revenue: Number(
              item.subtotal || 0,
            ),
          });
        }
      }
    }

    return [...products.values()]
      .sort(
        (a, b) =>
          b.quantity - a.quantity,
      )
      .slice(0, 10);
  }, [filteredSales]);

  function paymentLabel(
    paymentMethod: string,
  ) {
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
  }

  function setThisMonth() {
    const today = new Date();

    const year = today.getFullYear();

    const month = String(
      today.getMonth() + 1,
    ).padStart(2, "0");

    const day = String(
      today.getDate(),
    ).padStart(2, "0");

    const firstDay = `${year}-${month}-01`;
    const lastDay = `${year}-${month}-${day}`;

    setStartDate(firstDay);
    setEndDate(lastDay);
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
                Consulta y genera reportes de
                las ventas registradas.
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

          {/* TITULO PARA IMPRESIÓN */}

          <div className="mb-6 hidden print:block">
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Reporte de ventas
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Período:{" "}
              {formatShortDate(startDate)}{" "}
              al{" "}
              {formatShortDate(endDate)}
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
                },
              ).format(new Date())}
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
                    setStartDate(
                      event.target.value,
                    )
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
                    setEndDate(
                      event.target.value,
                    )
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
                  void loadSales()
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

              <p className="mt-1 text-sm">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadSales()
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
                  {formatShortDate(startDate)}{" "}
                  al{" "}
                  {formatShortDate(endDate)}
                </p>
              </div>

              {/* MÉTRICAS */}

              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Total vendido
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {formatPrice(
                      totalRevenue,
                    )}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Número de ventas
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {filteredSales.length}
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
                    {formatPrice(
                      averageTicket,
                    )}
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
                      Distribución de las ventas
                      del período.
                    </p>
                  </div>

                  {paymentSummary.length ===
                  0 ? (
                    <div className="rounded-xl bg-gray-50 p-8 text-center">
                      <p className="font-medium text-gray-700">
                        No hay ventas en este
                        período.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {paymentSummary.map(
                        ([method, summary]) => (
                          <div
                            key={method}
                            className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                {paymentLabel(
                                  method,
                                )}
                              </p>

                              <p className="mt-1 text-xs text-gray-500">
                                {summary.count}{" "}
                                {summary.count ===
                                1
                                  ? "venta"
                                  : "ventas"}
                              </p>
                            </div>

                            <p className="font-bold text-gray-900">
                              {formatPrice(
                                summary.total,
                              )}
                            </p>
                          </div>
                        ),
                      )}
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
                      Ranking por unidades
                      vendidas.
                    </p>
                  </div>

                  {productSummary.length ===
                  0 ? (
                    <div className="rounded-xl bg-gray-50 p-8 text-center">
                      <p className="font-medium text-gray-700">
                        No hay productos vendidos.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {productSummary.map(
                        (
                          product,
                          index,
                        ) => (
                          <div
                            key={
                              product.productId
                            }
                            className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                                {index + 1}
                              </span>

                              <div>
                                <p className="font-medium text-gray-900">
                                  {
                                    product.name
                                  }
                                </p>

                                {product.sku && (
                                  <p className="mt-1 font-mono text-xs text-gray-400">
                                    {
                                      product.sku
                                    }
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="font-bold text-gray-900">
                                {
                                  product.quantity
                                }{" "}
                                {product.quantity ===
                                1
                                  ? "unidad"
                                  : "unidades"}
                              </p>

                              <p className="mt-1 text-xs text-gray-500">
                                {formatPrice(
                                  product.revenue,
                                )}
                              </p>
                            </div>
                          </div>
                        ),
                      )}
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
                    Todas las ventas incluidas
                    en el período seleccionado.
                  </p>
                </div>

                {filteredSales.length ===
                0 ? (
                  <div className="rounded-xl bg-gray-50 p-10 text-center">
                    <p className="font-medium text-gray-700">
                      No hay ventas para este
                      período.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Selecciona otro rango de
                      fechas.
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
                        {filteredSales.map(
                          (sale) => {
                            const units =
                              Array.isArray(
                                sale.sale_items,
                              )
                                ? sale.sale_items.reduce(
                                    (
                                      sum,
                                      item,
                                    ) =>
                                      sum +
                                      Number(
                                        item.quantity ||
                                          0,
                                      ),
                                    0,
                                  )
                                : 0;

                            return (
                              <tr
                                key={sale.id}
                                className="hover:bg-gray-50"
                              >
                                <td className="px-4 py-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {formatDate(
                                      sale.created_at,
                                    )}
                                  </p>

                                  <p className="mt-1 font-mono text-xs text-gray-400">
                                    {sale.id.slice(
                                      0,
                                      8,
                                    )}
                                    ...
                                  </p>
                                </td>

                                <td className="px-4 py-3 text-sm text-gray-700">
                                  {sale.customer_name ||
                                    "Cliente general"}
                                </td>

                                <td className="px-4 py-3 text-sm text-gray-700">
                                  {paymentLabel(
                                    sale.payment_method,
                                  )}
                                </td>

                                <td className="px-4 py-3 text-center text-sm text-gray-700">
                                  {units}
                                </td>

                                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                  {formatPrice(
                                    Number(
                                      sale.total ||
                                        0,
                                    ),
                                  )}
                                </td>
                              </tr>
                            );
                          },
                        )}
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
                            {formatPrice(
                              totalRevenue,
                            )}
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
                      Reporte generado
                      correctamente
                    </p>

                    <p className="mt-1 text-sm text-gray-400">
                      Período:{" "}
                      {formatShortDate(
                        startDate,
                      )}{" "}
                      al{" "}
                      {formatShortDate(
                        endDate,
                      )}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm text-gray-400">
                      Total vendido
                    </p>

                    <p className="text-2xl font-bold">
                      {formatPrice(
                        totalRevenue,
                      )}
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