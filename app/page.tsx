
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  sale_price: number;
  stock: number;
  minimum_stock: number;
};

type Sale = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  total: number;
  created_at: string;
  sale_items?: SaleItem[];
};

type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: {
    id: string;
    name: string;
    sku: string | null;
  } | null;
};

type Supplier = {
  id: string;
  name: string;
};

type DashboardData = {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
};

export default function DashboardPage() {
  const router = useRouter();

  const [data, setData] = useState<DashboardData>({
    products: [],
    sales: [],
    suppliers: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadDashboard(showRefreshing = false) {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const [
        productsResponse,
        salesResponse,
        suppliersResponse,
      ] = await Promise.all([
        fetch("/api/products", {
          cache: "no-store",
        }),
        fetch("/api/sales", {
          cache: "no-store",
        }),
        fetch("/api/suppliers", {
          cache: "no-store",
        }),
      ]);

      const productsResult =
        await productsResponse.json();

      const salesResult =
        await salesResponse.json();

      const suppliersResult =
        await suppliersResponse.json();

      if (!productsResponse.ok) {
        throw new Error(
          productsResult.error ||
            "Error cargando productos."
        );
      }

      if (!salesResponse.ok) {
        throw new Error(
          salesResult.error ||
            "Error cargando ventas."
        );
      }

      if (!suppliersResponse.ok) {
        throw new Error(
          suppliersResult.error ||
            "Error cargando proveedores."
        );
      }

      setData({
        products:
          productsResult.products || [],
        sales:
          salesResult.sales || [],
        suppliers:
          suppliersResult.suppliers || [],
      });
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando el dashboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

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

  function isSameBogotaDay(
    dateString: string,
    referenceDate = new Date()
  ) {
    const formatter =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

    return (
      formatter.format(new Date(dateString)) ===
      formatter.format(referenceDate)
    );
  }

  function isSameBogotaMonth(
    dateString: string,
    referenceDate = new Date()
  ) {
    const formatter =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
      });

    return (
      formatter.format(new Date(dateString)) ===
      formatter.format(referenceDate)
    );
  }

  const todaySales = useMemo(() => {
    return data.sales.filter((sale) =>
      isSameBogotaDay(sale.created_at)
    );
  }, [data.sales]);

  const monthSales = useMemo(() => {
    return data.sales.filter((sale) =>
      isSameBogotaMonth(sale.created_at)
    );
  }, [data.sales]);

  const todayRevenue = useMemo(() => {
    return todaySales.reduce(
      (sum, sale) =>
        sum + Number(sale.total || 0),
      0
    );
  }, [todaySales]);

  const monthRevenue = useMemo(() => {
    return monthSales.reduce(
      (sum, sale) =>
        sum + Number(sale.total || 0),
      0
    );
  }, [monthSales]);

  const allSaleItems = useMemo(() => {
    return data.sales.flatMap(
      (sale) => sale.sale_items || []
    );
  }, [data.sales]);

  const todayUnits = useMemo(() => {
    return todaySales.reduce(
      (sum, sale) =>
        sum +
        (sale.sale_items || []).reduce(
          (itemSum, item) =>
            itemSum + Number(item.quantity || 0),
          0
        ),
      0
    );
  }, [todaySales]);

  const totalUnitsSold = useMemo(() => {
    return allSaleItems.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0),
      0
    );
  }, [allSaleItems]);

  const lowStockProducts = useMemo(() => {
    return data.products.filter(
      (product) =>
        product.stock > 0 &&
        product.stock <= product.minimum_stock
    );
  }, [data.products]);

  const outOfStockProducts = useMemo(() => {
    return data.products.filter(
      (product) => product.stock <= 0
    );
  }, [data.products]);

  const ticketAverage = useMemo(() => {
    if (todaySales.length === 0) {
      return 0;
    }

    return todayRevenue / todaySales.length;
  }, [todayRevenue, todaySales]);

  const paymentSummary = useMemo(() => {
    const summary = new Map<
      string,
      {
        count: number;
        total: number;
      }
    >();

    for (const sale of todaySales) {
      const method =
        sale.payment_method || "otro";

      const current = summary.get(method) || {
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
      (a, b) => b[1].total - a[1].total
    );
  }, [todaySales]);

  const topProducts = useMemo(() => {
    const quantities = new Map<
      string,
      number
    >();

    for (const item of allSaleItems) {
      quantities.set(
        item.product_id,
        (quantities.get(item.product_id) || 0) +
          Number(item.quantity || 0)
      );
    }

    return [...quantities.entries()]
      .map(([productId, quantity]) => {
        const product =
          data.products.find(
            (item) => item.id === productId
          );

        const saleItem =
          allSaleItems.find(
            (item) =>
              item.product_id === productId
          );

        return {
          productId,
          quantity,
          name:
            product?.name ||
            saleItem?.products?.name ||
            "Producto",
          sku:
            product?.sku ||
            saleItem?.products?.sku ||
            null,
        };
      })
      .sort(
        (a, b) =>
          b.quantity - a.quantity
      )
      .slice(0, 5);
  }, [allSaleItems, data.products]);

  const recentSales = useMemo(() => {
    return [...data.sales]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )
      .slice(0, 5);
  }, [data.sales]);

  const totalInventoryValue = useMemo(() => {
    return data.products.reduce(
      (sum, product) =>
        sum +
        Number(product.sale_price || 0) *
          Number(product.stock || 0),
      0
    );
  }, [data.products]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <p className="mt-2 text-gray-600">
              Cargando dashboard...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* ENCABEZADO */}

        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Dashboard
            </h1>

            <p className="mt-2 text-gray-600">
              Resumen general de tu negocio.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshing
                ? "Actualizando..."
                : "Actualizar"}
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

            <button
              type="button"
              onClick={() =>
                router.push("/inventario")
              }
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              Inventario
            </button>
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">
                Error cargando dashboard
              </p>

              <p className="mt-1 text-sm">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadDashboard(true)
              }
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* MÉTRICAS PRINCIPALES */}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Ventas de hoy
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatPrice(todayRevenue)}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              {todaySales.length}{" "}
              {todaySales.length === 1
                ? "venta"
                : "ventas"}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Ventas del mes
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatPrice(monthRevenue)}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              {monthSales.length}{" "}
              {monthSales.length === 1
                ? "venta"
                : "ventas"}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Unidades hoy
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {todayUnits}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Productos vendidos hoy
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Stock bajo
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {lowStockProducts.length}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              {outOfStockProducts.length} agotados
            </p>
          </div>

        </div>

        {/* MÉTRICAS SECUNDARIAS */}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Ticket promedio hoy
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatPrice(ticketAverage)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Productos
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {data.products.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Proveedores
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {data.suppliers.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Valor inventario
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatPrice(totalInventoryValue)}
            </p>
          </div>

        </div>

        {/* ACCESOS RÁPIDOS */}

        <div className="mt-6 grid gap-4 md:grid-cols-3">

          <button
            type="button"
            onClick={() =>
              router.push("/ventas")
            }
            className="rounded-2xl bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-2xl">
              🛒
            </p>

            <h2 className="mt-3 font-bold text-gray-900">
              Nueva venta
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Registrar una venta rápidamente.
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/inventario")
            }
            className="rounded-2xl bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-2xl">
              📦
            </p>

            <h2 className="mt-3 font-bold text-gray-900">
              Inventario
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Consulta productos y existencias.
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/ventas/historial"
              )
            }
            className="rounded-2xl bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-2xl">
              🧾
            </p>

            <h2 className="mt-3 font-bold text-gray-900">
              Historial de ventas
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Consulta todas las ventas registradas.
            </p>
          </button>

        </div>

        {/* VENTAS RECIENTES + PAGOS */}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Ventas recientes
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Últimas ventas registradas.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/ventas/historial"
                  )
                }
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Ver todas →
              </button>
            </div>

            {recentSales.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="font-medium text-gray-700">
                  Todavía no hay ventas.
                </p>
              </div>
            ) : (
              <div className="divide-y">

                {recentSales.map((sale) => (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/ventas/${sale.id}`
                      )
                    }
                    className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {sale.customer_name ||
                          "Cliente general"}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(
                          sale.created_at
                        )}
                      </p>

                      <p className="mt-1 text-xs capitalize text-gray-400">
                        {sale.payment_method}
                      </p>
                    </div>

                    <span className="font-bold text-gray-900">
                      {formatPrice(
                        Number(sale.total)
                      )}
                    </span>
                  </button>
                ))}

              </div>
            )}

          </section>

          {/* MÉTODOS DE PAGO */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                Métodos de pago
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Resumen de las ventas de hoy.
              </p>
            </div>

            {paymentSummary.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="font-medium text-gray-700">
                  No hay ventas hoy.
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
                        <p className="font-medium capitalize text-gray-900">
                          {method}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {summary.count}{" "}
                          {summary.count === 1
                            ? "venta"
                            : "ventas"}
                        </p>
                      </div>

                      <p className="font-bold text-gray-900">
                        {formatPrice(
                          summary.total
                        )}
                      </p>
                    </div>
                  )
                )}

              </div>
            )}

          </section>

        </div>

        {/* INVENTARIO */}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* STOCK BAJO */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Stock bajo
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Productos que necesitan reposición.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push("/inventario")
                }
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Inventario →
              </button>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="text-2xl">
                  ✅
                </p>

                <p className="mt-2 font-medium text-gray-700">
                  Todo está bien.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  No hay productos con stock bajo.
                </p>
              </div>
            ) : (
              <div className="space-y-3">

                {lowStockProducts
                  .slice(0, 5)
                  .map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {product.name}
                        </p>

                        {product.sku && (
                          <p className="mt-1 font-mono text-xs text-gray-500">
                            {product.sku}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-gray-900">
                          {product.stock}
                        </p>

                        <p className="text-xs text-gray-500">
                          mínimo{" "}
                          {product.minimum_stock}
                        </p>
                      </div>
                    </div>
                  ))}

              </div>
            )}

          </section>

          {/* AGOTADOS */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                Productos agotados
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Productos sin existencias.
              </p>
            </div>

            {outOfStockProducts.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="text-2xl">
                  ✅
                </p>

                <p className="mt-2 font-medium text-gray-700">
                  No hay productos agotados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">

                {outOfStockProducts
                  .slice(0, 5)
                  .map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {product.name}
                        </p>

                        {product.sku && (
                          <p className="mt-1 font-mono text-xs text-gray-500">
                            {product.sku}
                          </p>
                        )}
                      </div>

                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                        Agotado
                      </span>
                    </div>
                  ))}

              </div>
            )}

          </section>

        </div>

        {/* PRODUCTOS MÁS VENDIDOS */}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              Productos más vendidos
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Basado en las ventas registradas.
            </p>
          </div>

          {topProducts.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-8 text-center">
              <p className="font-medium text-gray-700">
                Todavía no hay productos vendidos.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

              {topProducts.map(
                (product, index) => (
                  <div
                    key={product.productId}
                    className="rounded-xl border border-gray-200 p-5"
                  >
                    <p className="text-sm font-bold text-gray-400">
                      #{index + 1}
                    </p>

                    <p className="mt-3 font-semibold text-gray-900">
                      {product.name}
                    </p>

                    {product.sku && (
                      <p className="mt-1 font-mono text-xs text-gray-400">
                        {product.sku}
                      </p>
                    )}

                    <p className="mt-2 text-sm text-gray-500">
                      {product.quantity}{" "}
                      {product.quantity === 1
                        ? "unidad"
                        : "unidades"}
                    </p>
                  </div>
                )
              )}

            </div>
          )}

        </section>

        {/* RESUMEN FINAL */}

        <section className="mt-6 rounded-2xl bg-gray-900 p-6 text-white">

          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

            <div>
              <p className="text-sm text-gray-400">
                Resumen PetStock AI
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                Tu negocio está en marcha 🚀
              </h2>

              <p className="mt-2 max-w-xl text-sm text-gray-400">
                Mantén controladas tus ventas,
                inventario y productos para tomar
                mejores decisiones.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">

              <div>
                <p className="text-sm text-gray-400">
                  Productos
                </p>

                <p className="mt-1 text-xl font-bold">
                  {data.products.length}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-400">
                  Proveedores
                </p>

                <p className="mt-1 text-xl font-bold">
                  {data.suppliers.length}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-400">
                  Ventas
                </p>

                <p className="mt-1 text-xl font-bold">
                  {data.sales.length}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-400">
                  Unidades
                </p>

                <p className="mt-1 text-xl font-bold">
                  {totalUnitsSold}
                </p>
              </div>

            </div>

          </div>

        </section>

      </div>
    </main>
  );
}

