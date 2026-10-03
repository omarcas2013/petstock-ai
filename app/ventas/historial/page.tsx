"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  sku: string | null;
  name: string;
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

const PAGE_SIZE = 20;

export default function HistorialVentasPage() {
  const router = useRouter();

  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] =
    useState("todos");

  const [sortOrder, setSortOrder] =
    useState("recent");

  const loadSales = useCallback(
    async (nextOffset: number) => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();

        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(nextOffset));

        if (search.trim()) {
          params.set("search", search.trim());
        }

        if (paymentFilter !== "todos") {
          params.set("payment_method", paymentFilter);
        }

        params.set("sort", sortOrder);

        const response = await fetch(
          `/api/sales?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Error cargando las ventas."
          );
        }

        setSales(
          Array.isArray(result.sales) ? result.sales : []
        );
        setTotal(
          typeof result.total === "number" ? result.total : 0
        );
        setOffset(nextOffset);
      } catch (error) {
        console.error("ERROR HISTORIAL:", error);

        setError(
          error instanceof Error
            ? error.message
            : "Error cargando las ventas."
        );

        setSales([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [search, paymentFilter, sortOrder]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadSales(0);
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, paymentFilter, sortOrder]);

  function formatPrice(
    price: number
  ) {
    return new Intl.NumberFormat(
      "es-CO",
      {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }
    ).format(price);
  }

  function formatDate(
    date: string
  ) {
    return new Intl.DateTimeFormat(
      "es-CO",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date(date));
  }

  function paymentLabel(
    paymentMethod: string
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

  const pageTotal = sales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  );

  const pageUnits = sales.reduce((sum, sale) => {
    const items = Array.isArray(sale.sale_items)
      ? sale.sale_items
      : [];

    return (
      sum +
      items.reduce(
        (itemSum, item) => itemSum + Number(item.quantity || 0),
        0
      )
    );
  }, 0);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Historial de ventas
            </h1>

            <p className="mt-2 text-gray-600">
              Consulta y revisa todas las ventas registradas.
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
              onClick={() =>
                router.push("/ventas")
              }
              className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              + Nueva venta
            </button>
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-semibold">
              Error
            </p>

            <p className="mt-1">
              {error}
            </p>

            <button
              type="button"
              onClick={() => loadSales(offset)}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* FILTROS */}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
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
                placeholder="Cliente o ID de venta..."
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Método de pago
              </label>

              <select
                value={paymentFilter}
                onChange={(event) =>
                  setPaymentFilter(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
              >
                <option value="todos">
                  Todos
                </option>

                <option value="efectivo">
                  Efectivo
                </option>

                <option value="tarjeta">
                  Tarjeta
                </option>

                <option value="transferencia">
                  Transferencia
                </option>

                <option value="otro">
                  Otro
                </option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Ordenar
              </label>

              <select
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
              >
                <option value="recent">
                  Más recientes
                </option>

                <option value="oldest">
                  Más antiguas
                </option>

                <option value="highest">
                  Mayor valor
                </option>

                <option value="lowest">
                  Menor valor
                </option>
              </select>
            </div>
          </div>
        </section>

        {/* RESUMEN */}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Ventas encontradas
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {total}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total vendido (página actual)
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatPrice(
                pageTotal
              )}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Unidades (página actual)
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {pageUnits}
            </p>
          </div>
        </div>

        {/* CONTENIDO */}

        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando ventas...
            </p>
          </div>
        ) : sales.length ===
          0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <div className="text-4xl">
              🧾
            </div>

            <p className="mt-4 font-medium text-gray-700">
              No encontramos ventas.
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Prueba cambiando los filtros.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-5 py-4 font-medium">
                      Fecha
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Cliente
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Pago
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Productos
                    </th>

                    <th className="px-5 py-4 text-right font-medium">
                      Total
                    </th>

                    <th className="px-5 py-4 text-right font-medium">
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {sales.map(
                    (sale) => {
                      const items =
                        Array.isArray(
                          sale.sale_items
                        )
                          ? sale.sale_items
                          : [];

                      const units =
                        items.reduce(
                          (
                            sum,
                            item
                          ) =>
                            sum +
                            Number(
                              item.quantity ||
                                0
                            ),
                          0
                        );

                      return (
                        <tr
                          key={sale.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-900">
                              {formatDate(
                                sale.created_at
                              )}
                            </p>

                            <p className="mt-1 font-mono text-xs text-gray-400">
                              {sale.id.slice(
                                0,
                                8
                              )}
                              ...
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-900">
                              {sale.customer_name ||
                                "Cliente general"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                              {paymentLabel(
                                sale.payment_method
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {units}{" "}
                            {units === 1
                              ? "unidad"
                              : "unidades"}
                          </td>

                          <td className="px-5 py-4 text-right font-bold text-gray-900">
                            {formatPrice(
                              Number(
                                sale.total ||
                                  0
                              )
                            )}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/ventas/${sale.id}`
                                )
                              }
                              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINACIÓN */}

            <div className="flex items-center justify-between border-t px-5 py-4">
              <p className="text-sm text-gray-500">
                Página {currentPage} de {totalPages} ·{" "}
                {total} ventas en total
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() =>
                    loadSales(Math.max(0, offset - PAGE_SIZE))
                  }
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>

                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => loadSales(offset + PAGE_SIZE)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
