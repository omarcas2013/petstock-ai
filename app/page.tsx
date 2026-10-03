"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getBogotaDateKey,
  getBogotaMonthStartKey,
} from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

const REPORT_ROLES = ["owner", "admin", "manager"];

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

type RecentSale = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  total: number;
  created_at: string;
};

type Supplier = {
  id: string;
  name: string;
};

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

type SalesReport = {
  total_revenue: number;
  sale_count: number;
  total_units: number;
  average_ticket: number;
  payment_summary: PaymentSummaryRow[];
  top_products: TopProductRow[];
  sales: {
    id: string;
    customer_name: string | null;
    payment_method: string;
    total: number;
    created_at: string;
    units: number;
  }[];
};

type DailySales = {
  key: string;
  label: string;
  total: number;
  count: number;
};

/*
 * tanda 3, auditoría de Parte B (BLOQUEANTE #1): este dashboard
 * calculaba todo en el navegador a partir de /api/sales SIN límite
 * (traía todas las ventas). Ahora que /api/sales pagina (20 filas por
 * defecto), esos cálculos quedaban truncados a la primera página en
 * vez de representar "hoy"/"el mes"/"la semana". Se reemplazan por
 * report_sales_summary (vía /api/reports/sales), que ya hace esa
 * agregación en SQL sobre el rango completo pedido — el mismo patrón
 * que /reportes/ventas.
 *
 * report_sales_summary es manager+ (assert_store_role en la función):
 * un employee no puede llamarla, así que las tarjetas que dependen de
 * ella se ocultan para employee en vez de romper el dashboard con un
 * 403. "Ventas recientes" sigue viniendo de /api/sales (accesible
 * para todos los roles: SALES_ROLES = ALL_ROLES) para que employee
 * también la vea.
 */
function getTodayKey() {
  return getBogotaDateKey();
}

export default function DashboardPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);

  const [canViewReports, setCanViewReports] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  const [todayReport, setTodayReport] =
    useState<SalesReport | null>(null);
  const [weekReport, setWeekReport] =
    useState<SalesReport | null>(null);
  const [monthReport, setMonthReport] =
    useState<SalesReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (showRefreshing = false) => {
      try {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const supabase = createClient();

        const { data: role } = await supabase.rpc(
          "get_my_role"
        );

        const canReport = REPORT_ROLES.includes(
          typeof role === "string" ? role : ""
        );

        setCanViewReports(canReport);
        setRoleChecked(true);

        const today = getTodayKey();

        const weekStartDate = new Date();
        weekStartDate.setDate(weekStartDate.getDate() - 6);
        const weekStart = getBogotaDateKey(weekStartDate);

        const monthStart = getBogotaMonthStartKey();

        const fetches: [
          Promise<Response>,
          Promise<Response>,
          Promise<Response>
        ] = canReport
          ? [
              fetch(
                `/api/reports/sales?desde=${today}&hasta=${today}`,
                { cache: "no-store" }
              ),
              fetch(
                `/api/reports/sales?desde=${weekStart}&hasta=${today}`,
                { cache: "no-store" }
              ),
              fetch(
                `/api/reports/sales?desde=${monthStart}&hasta=${today}`,
                { cache: "no-store" }
              ),
            ]
          : [
              Promise.resolve(
                new Response(null, { status: 204 })
              ),
              Promise.resolve(
                new Response(null, { status: 204 })
              ),
              Promise.resolve(
                new Response(null, { status: 204 })
              ),
            ];

        const [
          productsResponse,
          suppliersResponse,
          recentSalesResponse,
          todayResponse,
          weekResponse,
          monthResponse,
        ] = await Promise.all([
          fetch("/api/products", { cache: "no-store" }),
          fetch("/api/suppliers", { cache: "no-store" }),
          fetch("/api/sales?limit=5", { cache: "no-store" }),
          ...fetches,
        ]);

        const productsResult = await productsResponse.json();
        const suppliersResult = await suppliersResponse.json();
        const recentSalesResult =
          await recentSalesResponse.json();

        if (!productsResponse.ok) {
          throw new Error(
            productsResult.error || "Error cargando productos."
          );
        }

        if (!suppliersResponse.ok) {
          throw new Error(
            suppliersResult.error ||
              "Error cargando proveedores."
          );
        }

        if (!recentSalesResponse.ok) {
          throw new Error(
            recentSalesResult.error ||
              "Error cargando ventas recientes."
          );
        }

        setProducts(productsResult.products || []);
        setSuppliers(suppliersResult.suppliers || []);
        setRecentSales(recentSalesResult.sales || []);

        if (canReport) {
          const todayResult = await todayResponse.json();
          const weekResult = await weekResponse.json();
          const monthResult = await monthResponse.json();

          if (!todayResponse.ok) {
            throw new Error(
              todayResult.error ||
                "Error cargando el reporte de hoy."
            );
          }

          if (!weekResponse.ok) {
            throw new Error(
              weekResult.error ||
                "Error cargando el reporte de la semana."
            );
          }

          if (!monthResponse.ok) {
            throw new Error(
              monthResult.error ||
                "Error cargando el reporte del mes."
            );
          }

          setTodayReport(todayResult.report ?? null);
          setWeekReport(weekResult.report ?? null);
          setMonthReport(monthResult.report ?? null);
        } else {
          setTodayReport(null);
          setWeekReport(null);
          setMonthReport(null);
        }
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
    },
    []
  );

  useEffect(() => {
    const load = async () => {
      await loadDashboard();
    };

    load();
  }, [loadDashboard]);

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

  const lowStockProducts = useMemo(() => {
    return products.filter(
      (product) =>
        product.stock > 0 &&
        product.stock <= product.minimum_stock
    );
  }, [products]);

  const outOfStockProducts = useMemo(() => {
    return products.filter((product) => product.stock <= 0);
  }, [products]);

  const totalInventoryValue = useMemo(() => {
    return products.reduce(
      (sum, product) =>
        sum +
        Number(product.sale_price || 0) *
          Number(product.stock || 0),
      0
    );
  }, [products]);

  /*
   * El gráfico de 7 días se arma a partir de weekReport.sales (ya
   * acotado a los últimos 7 días por el rango pedido), agrupando por
   * día de Bogotá — igual que antes, pero sin depender de tener
   * TODAS las ventas en memoria.
   */
  const last7Days = useMemo<DailySales[]>(() => {
    const days: DailySales[] = [];
    const now = new Date();
    const sales = weekReport?.sales ?? [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);

      const key = getBogotaDateKey(date);

      const salesForDay = sales.filter(
        (sale) =>
          getBogotaDateKey(new Date(sale.created_at)) === key
      );

      const total = salesForDay.reduce(
        (sum, sale) => sum + Number(sale.total || 0),
        0
      );

      const label = new Intl.DateTimeFormat("es-CO", {
        weekday: "short",
        day: "numeric",
        timeZone: "America/Bogota",
      })
        .format(date)
        .replace(".", "");

      days.push({
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        total,
        count: salesForDay.length,
      });
    }

    return days;
  }, [weekReport]);

  const maxDailySales = useMemo(() => {
    return Math.max(...last7Days.map((day) => day.total), 1);
  }, [last7Days]);

  const weeklyRevenue = weekReport?.total_revenue ?? 0;
  const weeklySalesCount = weekReport?.sale_count ?? 0;

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
            {canViewReports && (
              <button
                type="button"
                onClick={() => router.push("/reportes")}
                className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
              >
                📊 Reportes
              </button>
            )}

            <button
              type="button"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">
                Error cargando dashboard
              </p>

              <p className="mt-1 text-sm">{error}</p>
            </div>

            <button
              type="button"
              onClick={() => loadDashboard(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        )}

        {roleChecked && !canViewReports && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Las cifras de ventas y los reportes son solo para
            owner, admin o manager. Aquí ves el inventario y las
            ventas recientes.
          </div>
        )}

        {canViewReports && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">
                Ventas de hoy
              </p>

              <p className="mt-2 text-3xl font-bold text-gray-900">
                {formatPrice(todayReport?.total_revenue ?? 0)}
              </p>

              <p className="mt-2 text-sm text-gray-500">
                {todayReport?.sale_count ?? 0}{" "}
                {(todayReport?.sale_count ?? 0) === 1
                  ? "venta"
                  : "ventas"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">
                Ventas del mes
              </p>

              <p className="mt-2 text-3xl font-bold text-gray-900">
                {formatPrice(monthReport?.total_revenue ?? 0)}
              </p>

              <p className="mt-2 text-sm text-gray-500">
                {monthReport?.sale_count ?? 0}{" "}
                {(monthReport?.sale_count ?? 0) === 1
                  ? "venta"
                  : "ventas"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">
                Unidades hoy
              </p>

              <p className="mt-2 text-3xl font-bold text-gray-900">
                {todayReport?.total_units ?? 0}
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
        )}

        {!canViewReports && (
          <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">
                Productos
              </p>

              <p className="mt-2 text-3xl font-bold text-gray-900">
                {products.length}
              </p>
            </div>
          </div>
        )}

        {canViewReports && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Ticket promedio hoy
              </p>

              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatPrice(todayReport?.average_ticket ?? 0)}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Productos</p>

              <p className="mt-2 text-2xl font-bold text-gray-900">
                {products.length}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Proveedores
              </p>

              <p className="mt-2 text-2xl font-bold text-gray-900">
                {suppliers.length}
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
        )}

        {canViewReports && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Ventas últimos 7 días
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Evolución de las ventas registradas.
                </p>
              </div>

              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-gray-500">
                    Total semana
                  </p>

                  <p className="mt-1 font-bold text-gray-900">
                    {formatPrice(weeklyRevenue)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Ventas</p>

                  <p className="mt-1 font-bold text-gray-900">
                    {weeklySalesCount}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-72">
              <div className="flex h-full items-end gap-3">
                {last7Days.map((day) => {
                  const height =
                    day.total === 0
                      ? 3
                      : Math.max(
                          (day.total / maxDailySales) * 100,
                          8
                        );

                  return (
                    <div
                      key={day.key}
                      className="flex h-full flex-1 flex-col items-center justify-end"
                    >
                      <div className="mb-2 text-center">
                        <p className="text-xs font-semibold text-gray-700">
                          {day.total > 0
                            ? formatPrice(day.total)
                            : "$0"}
                        </p>
                      </div>

                      <div className="flex h-48 w-full items-end justify-center">
                        <div
                          className="w-full max-w-12 rounded-t-lg bg-gray-900 transition-all duration-300 hover:bg-gray-700"
                          style={{
                            height: `${height}%`,
                          }}
                          title={`${day.label}: ${formatPrice(
                            day.total
                          )}`}
                        />
                      </div>

                      <div className="mt-3 text-center">
                        <p className="text-xs font-medium text-gray-600">
                          {day.label}
                        </p>

                        <p className="mt-1 text-[10px] text-gray-400">
                          {day.count}{" "}
                          {day.count === 1 ? "venta" : "ventas"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {canViewReports && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                Métodos de pago
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Resumen de las ventas de hoy.
              </p>
            </div>

            {(todayReport?.payment_summary.length ?? 0) === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="text-2xl">💳</p>

                <p className="mt-2 font-medium text-gray-700">
                  No hay ventas hoy.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Aquí aparecerá el resumen por método de pago.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {(todayReport?.payment_summary ?? []).map(
                  (summary) => (
                    <div
                      key={summary.payment_method}
                      className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                    >
                      <div>
                        <p className="font-medium capitalize text-gray-900">
                          {summary.payment_method}
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
                  )
                )}
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
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
              onClick={() => router.push("/ventas/historial")}
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
                  onClick={() => router.push(`/ventas/${sale.id}`)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {sale.customer_name || "Cliente general"}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(sale.created_at)}
                    </p>

                    <p className="mt-1 text-xs capitalize text-gray-400">
                      {sale.payment_method}
                    </p>
                  </div>

                  <span className="font-bold text-gray-900">
                    {formatPrice(Number(sale.total))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
                onClick={() => router.push("/inventario")}
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Inventario →
              </button>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="text-2xl">✅</p>

                <p className="mt-2 font-medium text-gray-700">
                  Todo está bien.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  No hay productos con stock bajo.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 5).map((product) => (
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
                        mínimo {product.minimum_stock}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

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
                <p className="text-2xl">✅</p>

                <p className="mt-2 font-medium text-gray-700">
                  No hay productos agotados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {outOfStockProducts.slice(0, 5).map((product) => (
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

        {canViewReports && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                Productos más vendidos
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Últimos 7 días.
              </p>
            </div>

            {(weekReport?.top_products.length ?? 0) === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="font-medium text-gray-700">
                  Todavía no hay productos vendidos.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {(weekReport?.top_products ?? [])
                  .slice(0, 5)
                  .map((product, index) => (
                    <div
                      key={product.product_id}
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
                  ))}
              </div>
            )}
          </section>
        )}

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
                Mantén controladas tus ventas, inventario y
                productos para tomar mejores decisiones.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <p className="text-sm text-gray-400">
                  Productos
                </p>

                <p className="mt-1 text-xl font-bold">
                  {products.length}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-400">
                  Proveedores
                </p>

                <p className="mt-1 text-xl font-bold">
                  {suppliers.length}
                </p>
              </div>

              {canViewReports && (
                <>
                  <div>
                    <p className="text-sm text-gray-400">
                      Ventas (mes)
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {monthReport?.sale_count ?? 0}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-400">
                      Unidades (mes)
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {monthReport?.total_units ?? 0}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
