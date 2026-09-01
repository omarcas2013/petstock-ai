"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

export default function VentaDetallePage() {
  const router = useRouter();
  const params = useParams();

  const saleId =
    typeof params.id === "string"
      ? params.id
      : "";

  const [sale, setSale] = useState<Sale | null>(
    null
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchSale() {
      if (!saleId) {
        if (!cancelled) {
          setError(
            "No se encontró el ID de la venta."
          );
          setLoading(false);
        }

        return;
      }

      try {
        if (!cancelled) {
          setLoading(true);
          setError("");
        }

        const response = await fetch(
          `/api/sales/${saleId}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "No se pudo cargar la venta."
          );
        }

        if (!cancelled) {
          setSale(result.sale);
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar la venta."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchSale();

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  function formatPrice(price: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(date));
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

  const items =
    sale &&
    Array.isArray(sale.sale_items)
      ? sale.sale_items
      : [];

  const totalUnits = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0),
    0
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando venta...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !sale) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <button
            type="button"
            onClick={() =>
              router.push("/ventas/historial")
            }
            className="no-print mb-6 rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Volver al historial
          </button>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700">
            <h1 className="text-xl font-bold">
              No se pudo cargar la venta
            </h1>

            <p className="mt-2">
              {error ||
                "La venta no existe."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .screen-only {
            display: none !important;
          }

          .print-receipt {
            display: block !important;
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }

          @page {
            margin: 12mm;
          }
        }

        @media screen {
          .print-only {
            display: none;
          }
        }
      `}</style>

      {/* VISTA NORMAL */}

      <main className="screen-only min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                PetStock AI
              </p>

              <h1 className="mt-1 text-3xl font-bold text-gray-900">
                Detalle de venta
              </h1>

              <p className="mt-2 font-mono text-sm text-gray-500">
                {sale.id}
              </p>
            </div>

            <div className="no-print flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/ventas/historial"
                  )
                }
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                ← Historial
              </button>

              <button
                type="button"
                onClick={() =>
                  window.print()
                }
                className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
              >
                🖨️ Imprimir comprobante
              </button>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Fecha
              </p>

              <p className="mt-2 font-semibold text-gray-900">
                {formatDate(
                  sale.created_at
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Cliente
              </p>

              <p className="mt-2 font-semibold text-gray-900">
                {sale.customer_name ||
                  "Cliente general"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Método de pago
              </p>

              <p className="mt-2 font-semibold text-gray-900">
                {paymentLabel(
                  sale.payment_method
                )}
              </p>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b p-6">
              <h2 className="text-xl font-bold text-gray-900">
                Productos
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {totalUnits}{" "}
                {totalUnits === 1
                  ? "unidad"
                  : "unidades"}
              </p>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Esta venta no tiene productos asociados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
                      <th className="px-6 py-4 font-medium">
                        Producto
                      </th>

                      <th className="px-6 py-4 font-medium">
                        SKU
                      </th>

                      <th className="px-6 py-4 text-center font-medium">
                        Cantidad
                      </th>

                      <th className="px-6 py-4 text-right font-medium">
                        Precio
                      </th>

                      <th className="px-6 py-4 text-right font-medium">
                        Subtotal
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {items.map((item) => {
                      const product =
                        item.products;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-5">
                            <p className="font-semibold text-gray-900">
                              {product?.name ||
                                "Producto"}
                            </p>
                          </td>

                          <td className="px-6 py-5">
                            <span className="font-mono text-sm text-gray-500">
                              {product?.sku ||
                                "—"}
                            </span>
                          </td>

                          <td className="px-6 py-5 text-center font-medium text-gray-900">
                            {item.quantity}
                          </td>

                          <td className="px-6 py-5 text-right text-gray-700">
                            {formatPrice(
                              Number(
                                item.unit_price
                              )
                            )}
                          </td>

                          <td className="px-6 py-5 text-right font-semibold text-gray-900">
                            {formatPrice(
                              Number(
                                item.subtotal
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t bg-gray-50 p-6">
              <div className="ml-auto max-w-sm space-y-3">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>

                  <span>
                    {formatPrice(
                      Number(
                        sale.subtotal
                      )
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-lg font-bold text-gray-900">
                    Total
                  </span>

                  <span className="text-2xl font-bold text-gray-900">
                    {formatPrice(
                      Number(sale.total)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* COMPROBANTE PARA IMPRIMIR */}

      <div className="print-only print-receipt">
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            PETSTOCK AI
          </h1>

          <p className="mt-1 text-sm">
            Comprobante de venta
          </p>

          <div className="my-5 border-t border-b py-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <span className="font-semibold">
                Venta:
              </span>

              <span className="font-mono text-xs">
                {sale.id}
              </span>
            </div>

            <div className="mt-2 flex justify-between gap-4">
              <span className="font-semibold">
                Fecha:
              </span>

              <span>
                {formatDate(
                  sale.created_at
                )}
              </span>
            </div>

            <div className="mt-2 flex justify-between gap-4">
              <span className="font-semibold">
                Cliente:
              </span>

              <span>
                {sale.customer_name ||
                  "Cliente general"}
              </span>
            </div>

            <div className="mt-2 flex justify-between gap-4">
              <span className="font-semibold">
                Pago:
              </span>

              <span>
                {paymentLabel(
                  sale.payment_method
                )}
              </span>
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="py-3 text-left">
                Producto
              </th>

              <th className="py-3 text-center">
                Cant.
              </th>

              <th className="py-3 text-right">
                Precio
              </th>

              <th className="py-3 text-right">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => {
              const product =
                item.products;

              return (
                <tr
                  key={item.id}
                  className="border-b"
                >
                  <td className="py-3 pr-2">
                    <div className="font-semibold">
                      {product?.name ||
                        "Producto"}
                    </div>

                    {product?.sku && (
                      <div className="font-mono text-xs">
                        {product.sku}
                      </div>
                    )}
                  </td>

                  <td className="py-3 text-center">
                    {item.quantity}
                  </td>

                  <td className="py-3 text-right">
                    {formatPrice(
                      Number(
                        item.unit_price
                      )
                    )}
                  </td>

                  <td className="py-3 text-right font-semibold">
                    {formatPrice(
                      Number(
                        item.subtotal
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-6 ml-auto max-w-xs">
          <div className="flex justify-between py-2">
            <span>Unidades</span>

            <span className="font-semibold">
              {totalUnits}
            </span>
          </div>

          <div className="flex justify-between border-t pt-3 text-xl font-bold">
            <span>TOTAL</span>

            <span>
              {formatPrice(
                Number(sale.total)
              )}
            </span>
          </div>
        </div>

        <div className="mt-10 border-t pt-5 text-center text-sm">
          <p className="font-semibold">
            Gracias por su compra
          </p>

          <p className="mt-1 text-gray-500">
            PetStock AI
          </p>
        </div>
      </div>
    </>
  );
}