"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  store_id?: string | null;
};

export default function ReporteInventarioPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/products", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando el inventario.",
        );
      }

      setProducts(
        Array.isArray(result.products)
          ? result.products
          : [],
      );
    } catch (error) {
      console.error(
        "ERROR REPORTE INVENTARIO:",
        error,
      );

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando el reporte de inventario.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadProducts]);

  function formatPrice(price: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(price) || 0);
  }

  function getStatus(product: Product) {
    const stock = Number(product.stock || 0);
    const minimum = Number(
      product.minimum_stock || 0,
    );

    if (stock <= 0) {
      return "agotado";
    }

    if (stock <= minimum) {
      return "bajo";
    }

    return "normal";
  }

  function getStatusLabel(product: Product) {
    const status = getStatus(product);

    if (status === "agotado") {
      return "Agotado";
    }

    if (status === "bajo") {
      return "Stock bajo";
    }

    return "Normal";
  }

  function getStatusClass(product: Product) {
    const status = getStatus(product);

    if (status === "agotado") {
      return "bg-red-50 text-red-700";
    }

    if (status === "bajo") {
      return "bg-yellow-50 text-yellow-700";
    }

    return "bg-green-50 text-green-700";
  }

  const filteredProducts = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return [...products]
      .filter((product) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          product.name
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          product.sku
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          product.brand
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          product.category
            ?.toLowerCase()
            .includes(normalizedSearch)
        );
      })
      .filter((product) => {
        if (statusFilter === "todos") {
          return true;
        }

        return (
          getStatus(product) === statusFilter
        );
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      );
  }, [products, search, statusFilter]);

  const totalProducts = products.length;

  const totalUnits = useMemo(() => {
    return products.reduce(
      (sum, product) =>
        sum + Number(product.stock || 0),
      0,
    );
  }, [products]);

  const totalInventoryValue = useMemo(() => {
    return products.reduce(
      (sum, product) =>
        sum +
        Number(product.stock || 0) *
          Number(product.sale_price || 0),
      0,
    );
  }, [products]);

  const lowStockProducts = useMemo(() => {
    return products.filter(
      (product) => getStatus(product) === "bajo",
    );
  }, [products]);

  const outOfStockProducts = useMemo(() => {
    return products.filter(
      (product) =>
        getStatus(product) === "agotado",
    );
  }, [products]);

  const normalStockProducts = useMemo(() => {
    return products.filter(
      (product) =>
        getStatus(product) === "normal",
    );
  }, [products]);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
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
            font-size: 11px;
          }

          th,
          td {
            padding: 6px 8px !important;
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
                Reporte de inventario
              </h1>

              <p className="mt-2 text-gray-600">
                Consulta el estado actual de todos
                tus productos.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push("/reportes")
                }
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                Reportes
              </button>

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
                Imprimir reporte
              </button>
            </div>
          </div>

          {/* ENCABEZADO DE IMPRESIÓN */}

          <div className="mb-6 hidden print:block">
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Reporte de inventario
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Inventario actual de productos
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

          {/* ERROR */}

          {error && (
            <div className="no-print mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
              <p className="font-semibold">
                Error cargando inventario
              </p>

              <p className="mt-1 text-sm">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadProducts()}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* CARGANDO */}

          {loading ? (
            <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
              <p className="text-sm font-medium text-gray-500">
                PetStock AI
              </p>

              <p className="mt-2 text-gray-600">
                Cargando inventario...
              </p>
            </div>
          ) : (
            <>
              {/* FILTROS */}

              <section className="no-print mb-6 rounded-2xl bg-white p-6 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="inventory-search"
                      className="text-sm font-medium text-gray-700"
                    >
                      Buscar producto
                    </label>

                    <input
                      id="inventory-search"
                      type="text"
                      value={search}
                      onChange={(event) =>
                        setSearch(event.target.value)
                      }
                      placeholder="Nombre, SKU, marca o categoría..."
                      className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="inventory-status"
                      className="text-sm font-medium text-gray-700"
                    >
                      Estado del inventario
                    </label>

                    <select
                      id="inventory-status"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(
                          event.target.value,
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                    >
                      <option value="todos">
                        Todos
                      </option>

                      <option value="normal">
                        Stock normal
                      </option>

                      <option value="bajo">
                        Stock bajo
                      </option>

                      <option value="agotado">
                        Agotados
                      </option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("todos");
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Limpiar filtros
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void loadProducts()
                    }
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Actualizar datos
                  </button>
                </div>
              </section>

              {/* MÉTRICAS */}

              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Productos
                  </p>

                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {totalProducts}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    Productos registrados
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Unidades en stock
                  </p>

                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {totalUnits}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    Existencias actuales
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Valor del inventario
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {formatPrice(
                      totalInventoryValue,
                    )}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    Calculado a precio de venta
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Alertas
                  </p>

                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {lowStockProducts.length +
                      outOfStockProducts.length}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    Stock bajo o agotado
                  </p>
                </div>
              </div>

              {/* ESTADOS */}

              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div className="print-break rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">
                      Stock normal
                    </p>

                    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                      Normal
                    </span>
                  </div>

                  <p className="mt-3 text-2xl font-bold text-gray-900">
                    {normalStockProducts.length}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">
                      Stock bajo
                    </p>

                    <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                      Atención
                    </span>
                  </div>

                  <p className="mt-3 text-2xl font-bold text-gray-900">
                    {lowStockProducts.length}
                  </p>
                </div>

                <div className="print-break rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">
                      Agotados
                    </p>

                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      Crítico
                    </span>
                  </div>

                  <p className="mt-3 text-2xl font-bold text-gray-900">
                    {outOfStockProducts.length}
                  </p>
                </div>
              </div>

              {/* TABLA */}

              <section className="print-card rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-gray-900">
                    Inventario actual
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {filteredProducts.length}{" "}
                    {filteredProducts.length === 1
                      ? "producto"
                      : "productos"}{" "}
                    mostrados.
                  </p>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 p-10 text-center">
                    <p className="font-medium text-gray-700">
                      No hay productos para mostrar.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Prueba con otros filtros.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px]">
                      <thead className="border-b bg-gray-50">
                        <tr className="text-left text-sm text-gray-500">
                          <th className="px-4 py-3 font-medium">
                            Producto
                          </th>

                          <th className="px-4 py-3 font-medium">
                            SKU
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Marca
                          </th>

                          <th className="px-4 py-3 font-medium">
                            Categoría
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Stock
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Mínimo
                          </th>

                          <th className="px-4 py-3 text-right font-medium">
                            Precio
                          </th>

                          <th className="px-4 py-3 text-right font-medium">
                            Valor stock
                          </th>

                          <th className="px-4 py-3 text-center font-medium">
                            Estado
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y">
                        {filteredProducts.map(
                          (product) => {
                            const stock = Number(
                              product.stock || 0,
                            );

                            const minimum = Number(
                              product.minimum_stock ||
                                0,
                            );

                            const value =
                              stock *
                              Number(
                                product.sale_price ||
                                  0,
                              );

                            return (
                              <tr
                                key={product.id}
                                className="hover:bg-gray-50"
                              >
                                <td className="px-4 py-4">
                                  <p className="font-medium text-gray-900">
                                    {product.name}
                                  </p>
                                </td>

                                <td className="px-4 py-4">
                                  {product.sku ? (
                                    <span className="font-mono text-xs text-gray-500">
                                      {product.sku}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-gray-400">
                                      —
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-4 text-sm text-gray-700">
                                  {product.brand ||
                                    "—"}
                                </td>

                                <td className="px-4 py-4 text-sm text-gray-700">
                                  {product.category ||
                                    "—"}
                                </td>

                                <td className="px-4 py-4 text-center">
                                  <span className="font-bold text-gray-900">
                                    {stock}
                                  </span>
                                </td>

                                <td className="px-4 py-4 text-center text-sm text-gray-600">
                                  {minimum}
                                </td>

                                <td className="px-4 py-4 text-right text-sm font-medium text-gray-900">
                                  {formatPrice(
                                    Number(
                                      product.sale_price ||
                                        0,
                                    ),
                                  )}
                                </td>

                                <td className="px-4 py-4 text-right text-sm font-semibold text-gray-900">
                                  {formatPrice(value)}
                                </td>

                                <td className="px-4 py-4 text-center">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                      product,
                                    )}`}
                                  >
                                    {getStatusLabel(
                                      product,
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>

                      <tfoot className="border-t-2 border-gray-300">
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-4 text-right font-bold text-gray-900"
                          >
                            TOTAL
                          </td>

                          <td className="px-4 py-4 text-center font-bold text-gray-900">
                            {filteredProducts.reduce(
                              (sum, product) =>
                                sum +
                                Number(
                                  product.stock || 0,
                                ),
                              0,
                            )}
                          </td>

                          <td />

                          <td />

                          <td className="px-4 py-4 text-right text-lg font-bold text-gray-900">
                            {formatPrice(
                              filteredProducts.reduce(
                                (sum, product) =>
                                  sum +
                                  Number(
                                    product.stock ||
                                      0,
                                  ) *
                                    Number(
                                      product.sale_price ||
                                        0,
                                    ),
                                0,
                              ),
                            )}
                          </td>

                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* PIE */}

              <section className="mt-6 rounded-2xl bg-gray-900 p-6 text-white print:mt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-gray-400">
                      PetStock AI
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      Reporte de inventario generado
                      correctamente
                    </p>

                    <p className="mt-1 text-sm text-gray-400">
                      {totalProducts} productos ·{" "}
                      {totalUnits} unidades
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm text-gray-400">
                      Valor total del inventario
                    </p>

                    <p className="text-2xl font-bold">
                      {formatPrice(
                        totalInventoryValue,
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