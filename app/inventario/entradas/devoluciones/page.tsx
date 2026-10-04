"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Sale = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  total: number;
  created_at: string;
};

type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
  // Lo que YA se devolvió (devoluciones "confirmada") y lo que
  // queda disponible para devolver (tanda 3, Parte B #8): el máximo
  // es lo que queda, no lo vendido.
  already_returned?: number;
  remaining_to_return?: number;
  products:
    | {
        id: string;
        name: string;
        sku: string | null;
      }
    | null;
};

type CustomerReturn = {
  id: string;
  sale_id: string;
  customer_name: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  customer_return_items:
    | {
        id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
        products:
          | {
              name: string;
              sku: string | null;
            }
          | null;
      }[]
    | null;
};

type ReturnForm = {
  saleId: string;
  saleItemId: string;
  quantity: string;
  reason: string;
};

export default function DevolucionesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedReturn, setSelectedReturn] =
    useState<CustomerReturn | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  // Búsqueda de la venta a devolver: /api/sales solo devuelve las 20
  // más recientes por defecto, así que sin esto una venta más
  // antigua que esas 20 quedaba inalcanzable desde este selector.
  const [saleSearch, setSaleSearch] = useState("");
  const [loadingSales, setLoadingSales] = useState(false);

  const [form, setForm] = useState<ReturnForm>({
    saleId: "",
    saleItemId: "",
    quantity: "",
    reason: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [salesResponse, returnsResponse] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/inventory/returns"),
      ]);

      const salesData = await salesResponse.json();
      const returnsData = await returnsResponse.json();

      if (!salesResponse.ok) {
        throw new Error(
          salesData.error || "No se pudieron cargar las ventas."
        );
      }

      if (!returnsResponse.ok) {
        throw new Error(
          returnsData.error ||
            "No se pudieron cargar las devoluciones."
        );
      }

      setSales(salesData.sales ?? []);
      setReturns(returnsData.returns ?? []);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los datos."
      );
    } finally {
      setLoading(false);
    }
  }

  // Descarta una respuesta de búsqueda de ventas que llegue tarde
  // (si el usuario sigue escribiendo, la última petición manda).
  const latestSaleSearchRef = useRef(0);

  async function loadSales(term: string) {
    const requestId = ++latestSaleSearchRef.current;

    try {
      setLoadingSales(true);

      const params = new URLSearchParams();

      params.set("limit", "30");

      if (term.trim()) {
        params.set("search", term.trim());
      }

      const response = await fetch(
        `/api/sales?${params.toString()}`
      );

      const data = await response.json();

      if (latestSaleSearchRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudieron buscar las ventas."
        );
      }

      setSales(data.sales ?? []);
    } catch (err) {
      if (latestSaleSearchRef.current !== requestId) {
        return;
      }

      console.error(err);
    } finally {
      if (latestSaleSearchRef.current === requestId) {
        setLoadingSales(false);
      }
    }
  }

  // Guarda el id de la venta de la última petición disparada, para
  // poder descartar una respuesta tardía si el usuario ya eligió otra
  // venta antes de que esta llegara (p. ej. clic rápido entre ventas).
  const latestSaleRequestRef = useRef<string | null>(null);

  async function loadSaleItems(saleId: string) {
    latestSaleRequestRef.current = saleId;

    try {
      setLoadingItems(true);
      setError("");

      const response = await fetch(
        `/api/sales/${saleId}`
      );

      const data = await response.json();

      if (latestSaleRequestRef.current !== saleId) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron cargar los productos de la venta."
        );
      }

      const items = data.sale?.sale_items ?? [];

      setSaleItems(items);

      // Si la venta tiene un solo producto y todavía queda algo
      // por devolver, lo seleccionamos de una vez para no obligar
      // un clic extra.
      if (
        items.length === 1 &&
        (items[0].remaining_to_return ?? items[0].quantity) > 0
      ) {
        setForm((current) => ({
          ...current,
          saleItemId: items[0].id,
        }));
      }
    } catch (err) {
      if (latestSaleRequestRef.current !== saleId) {
        return;
      }

      console.error(err);

      setSaleItems([]);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los productos."
      );
    } finally {
      if (latestSaleRequestRef.current === saleId) {
        setLoadingItems(false);
      }
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!showForm) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadSales(saleSearch);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [saleSearch, showForm]);

  const filteredReturns = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return returns;
    }

    return returns.filter((item) => {
      const customer =
        item.customer_name?.toLowerCase() ?? "";

      const reason =
        item.reason?.toLowerCase() ?? "";

      const saleId = item.sale_id.toLowerCase();

      const products =
        item.customer_return_items
          ?.map(
            (returnItem) =>
              returnItem.products?.name?.toLowerCase() ?? ""
          )
          .join(" ") ?? "";

      return (
        customer.includes(term) ||
        reason.includes(term) ||
        saleId.includes(term) ||
        products.includes(term)
      );
    });
  }, [returns, search]);

  const totalReturns = returns.length;

  const totalReturnedProducts = returns.reduce(
    (total, item) =>
      total +
      (item.customer_return_items?.reduce(
        (sum, returnItem) => sum + returnItem.quantity,
        0
      ) ?? 0),
    0
  );

  const openNewReturn = () => {
    setError("");
    setSuccess("");
    setSelectedSale(null);
    setSaleItems([]);
    setSaleSearch("");

    setForm({
      saleId: "",
      saleItemId: "",
      quantity: "",
      reason: "",
    });

    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setSelectedSale(null);
    setSaleItems([]);
    setError("");
  };

  const handleSaleChange = async (
    saleId: string
  ) => {
    const sale =
      sales.find((item) => item.id === saleId) ?? null;

    setSelectedSale(sale);

    setForm((current) => ({
      ...current,
      saleId,
      saleItemId: "",
      quantity: "",
    }));

    if (saleId) {
      await loadSaleItems(saleId);
    } else {
      // Sin venta seleccionada: ninguna petición en curso debe
      // poder repoblar la lista después de esto.
      latestSaleRequestRef.current = null;
      setSaleItems([]);
    }
  };

  const selectedItem = saleItems.find(
    (item) => item.id === form.saleItemId
  );

  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.saleId) {
      setError("Selecciona una venta.");
      return;
    }

    if (!form.saleItemId) {
      setError("Selecciona el producto que será devuelto.");
      return;
    }

    const quantity = Number(form.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError(
        "La cantidad debe ser un número entero mayor que cero."
      );
      return;
    }

    const maxReturnable =
      selectedItem?.remaining_to_return ??
      selectedItem?.quantity ??
      0;

    if (selectedItem && quantity > maxReturnable) {
      setError(
        `La cantidad máxima es ${maxReturnable} unidades (${selectedItem.quantity} vendidas, ${
          selectedItem.already_returned ?? 0
        } ya devueltas).`
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/inventory/returns",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sale_id: form.saleId,
            sale_item_id: form.saleItemId,
            quantity,
            reason: form.reason.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo registrar la devolución."
        );
      }

      setSuccess(
        `Devolución registrada correctamente. Stock: ${data.stock_before} → ${data.stock_after}.`
      );

      setShowForm(false);

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar la devolución."
      );
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (
    customerReturn: CustomerReturn
  ) => {
    setSelectedReturn(customerReturn);
    setShowDetail(true);
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedReturn(null);
  };

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (value: string) => {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

  const shortId = (id: string) => {
    return id.slice(0, 8);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}
        <div className="mb-8">
          <div className="mb-3">
            <Link
              href="/inventario/entradas"
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              ← Volver a Entradas
            </Link>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                ↩️ Devoluciones de clientes
              </h1>

              <p className="mt-2 text-slate-600">
                Registra productos que regresan al inventario
                desde una venta.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/ventas"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                🛒 Ver ventas
              </Link>

              <button
                type="button"
                onClick={openNewReturn}
                className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                + Nueva devolución
              </button>
            </div>
          </div>
        </div>

        {/* MENSAJES */}
        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            ✓ {success}
          </div>
        )}

        {error && !showForm && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* RESUMEN */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Devoluciones realizadas
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalReturns}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Productos devueltos
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalReturnedProducts}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Impacto en inventario
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-600">
              +{totalReturnedProducts}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Unidades ingresadas
            </p>
          </div>
        </div>

        {/* INFORMACIÓN */}
        <div className="mb-8 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="font-bold text-blue-900">
            ℹ️ ¿Cómo funciona una devolución?
          </h2>

          <p className="mt-2 text-sm leading-6 text-blue-800">
            Selecciona una venta, elige el producto que el
            cliente está devolviendo e indica la cantidad.
            Al confirmar, el sistema aumenta automáticamente
            el stock y registra un movimiento de entrada.
          </p>
        </div>

        {/* FILTROS */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Historial de devoluciones
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {filteredReturns.length} devolución
                {filteredReturns.length === 1 ? "" : "es"}
                encontradas
              </p>
            </div>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar venta, cliente o producto..."
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 md:w-80"
            />
          </div>
        </div>

        {/* TABLA */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Cargando devoluciones...
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">↩️</div>

              <h3 className="mt-4 font-bold text-slate-900">
                No hay devoluciones
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Cuando registres una devolución de cliente,
                aparecerá aquí.
              </p>

              <button
                type="button"
                onClick={openNewReturn}
                className="mt-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                + Registrar devolución
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 text-left font-semibold text-slate-700">
                      Fecha
                    </th>

                    <th className="px-5 py-4 text-left font-semibold text-slate-700">
                      Venta
                    </th>

                    <th className="px-5 py-4 text-left font-semibold text-slate-700">
                      Cliente
                    </th>

                    <th className="px-5 py-4 text-left font-semibold text-slate-700">
                      Productos
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-slate-700">
                      Cantidad
                    </th>

                    <th className="px-5 py-4 text-left font-semibold text-slate-700">
                      Motivo
                    </th>

                    <th className="px-5 py-4 text-right font-semibold text-slate-700">
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredReturns.map((customerReturn) => {
                    const items =
                      customerReturn.customer_return_items ?? [];

                    const quantity = items.reduce(
                      (sum, item) =>
                        sum + item.quantity,
                      0
                    );

                    return (
                      <tr
                        key={customerReturn.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {formatDate(
                            customerReturn.created_at
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="font-mono text-xs text-slate-600">
                            #{shortId(
                              customerReturn.sale_id
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-medium text-slate-900">
                          {customerReturn.customer_name ||
                            "Cliente general"}
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className="text-slate-700"
                              >
                                {item.products?.name ??
                                  "Producto"}
                                <span className="ml-2 text-xs text-slate-400">
                                  × {item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right font-bold text-emerald-600">
                          +{quantity}
                        </td>

                        <td className="max-w-xs px-5 py-4 text-slate-600">
                          {customerReturn.reason ||
                            "Sin motivo especificado"}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openDetail(customerReturn)
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            👁️ Ver detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          MODAL NUEVA DEVOLUCIÓN
          ===================================================== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    ↩️ Nueva devolución
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Selecciona la venta y el producto que
                    está devolviendo el cliente.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-6 p-6"
            >
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              {/* VENTA */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Venta
                </label>

                <input
                  type="text"
                  value={saleSearch}
                  onChange={(event) =>
                    setSaleSearch(event.target.value)
                  }
                  disabled={saving}
                  placeholder="Buscar por cliente o ID de venta..."
                  className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />

                <p className="mb-2 text-xs text-slate-400">
                  {loadingSales
                    ? "Buscando..."
                    : saleSearch.trim()
                    ? `${sales.length} resultado${
                        sales.length === 1 ? "" : "s"
                      }`
                    : "Mostrando las ventas más recientes."}
                </p>

                <select
                  value={form.saleId}
                  onChange={(event) =>
                    handleSaleChange(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">
                    Selecciona una venta...
                  </option>

                  {sales.map((sale) => (
                    <option
                      key={sale.id}
                      value={sale.id}
                    >
                      #{shortId(sale.id)} —{" "}
                      {sale.customer_name ||
                        "Cliente general"}{" "}
                      — {formatMoney(Number(sale.total))} —{" "}
                      {formatDate(sale.created_at)}
                    </option>
                  ))}
                </select>
              </div>

              {/* RESUMEN VENTA */}
              {selectedSale && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Cliente
                      </p>

                      <p className="mt-1 font-semibold text-slate-900">
                        {selectedSale.customer_name ||
                          "Cliente general"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Fecha
                      </p>

                      <p className="mt-1 font-semibold text-slate-900">
                        {formatDate(
                          selectedSale.created_at
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Total
                      </p>

                      <p className="mt-1 font-semibold text-slate-900">
                        {formatMoney(
                          Number(selectedSale.total)
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* PRODUCTOS */}
              {form.saleId && (
                <div>
                  <label className="mb-3 block text-sm font-semibold text-slate-700">
                    Producto a devolver
                  </label>

                  {loadingItems ? (
                    <div className="rounded-xl border border-slate-200 p-5 text-center text-sm text-slate-500">
                      Cargando productos de la venta...
                    </div>
                  ) : saleItems.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                      Esta venta no tiene productos disponibles.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {saleItems.map((item) => {
                        const isSelected =
                          form.saleItemId === item.id;

                        const remaining =
                          item.remaining_to_return ??
                          item.quantity;

                        const fullyReturned =
                          remaining <= 0;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                saleItemId: item.id,
                                quantity: "",
                              }))
                            }
                            disabled={
                              saving || fullyReturned
                            }
                            className={`w-full rounded-xl border p-4 text-left transition ${
                              isSelected
                                ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                                : fullyReturned
                                ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-bold text-slate-900">
                                  {item.products?.name ??
                                    "Producto"}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  SKU:{" "}
                                  {item.products?.sku ||
                                    "Sin SKU"}
                                </p>

                                {fullyReturned && (
                                  <p className="mt-1 text-xs font-semibold text-amber-700">
                                    Ya devuelto por completo
                                  </p>
                                )}
                              </div>

                              <div className="flex gap-6 text-sm">
                                <div>
                                  <p className="text-xs text-slate-400">
                                    Vendidos
                                  </p>

                                  <p className="font-bold text-slate-900">
                                    {item.quantity}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-slate-400">
                                    Disponible
                                  </p>

                                  <p className="font-bold text-slate-900">
                                    {remaining}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-slate-400">
                                    Precio
                                  </p>

                                  <p className="font-bold text-slate-900">
                                    {formatMoney(
                                      Number(
                                        item.unit_price
                                      )
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* CANTIDAD */}
              {selectedItem && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="mb-4">
                    <p className="font-bold text-emerald-900">
                      {selectedItem.products?.name}
                    </p>

                    <p className="mt-1 text-sm text-emerald-700">
                      Máximo disponible para devolver:{" "}
                      <strong>
                        {selectedItem.remaining_to_return ??
                          selectedItem.quantity}
                      </strong>{" "}
                      unidades
                      {(selectedItem.already_returned ?? 0) >
                        0 && (
                        <>
                          {" "}
                          ({selectedItem.quantity} vendidas,{" "}
                          {selectedItem.already_returned}{" "}
                          ya devueltas)
                        </>
                      )}
                    </p>
                  </div>

                  <label className="mb-2 block text-sm font-semibold text-emerald-900">
                    Cantidad a devolver
                  </label>

                  <input
                    type="number"
                    onWheel={(event) => event.currentTarget.blur()}
                    min="1"
                    max={
                      selectedItem.remaining_to_return ??
                      selectedItem.quantity
                    }
                    step="1"
                    value={form.quantity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    disabled={saving}
                    placeholder="Ej. 1"
                    className="w-full rounded-lg border border-emerald-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              )}

              {/* MOTIVO */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Motivo de la devolución
                </label>

                <textarea
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  disabled={saving}
                  rows={3}
                  placeholder="Ej. Producto defectuoso, producto equivocado, cliente no lo necesitaba..."
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              {/* AVISO */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <strong>⚠️ Importante:</strong> al confirmar,
                el sistema aumentará automáticamente el stock
                y registrará un movimiento de entrada.
              </div>

              {/* BOTONES */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    !form.saleId ||
                    !form.saleItemId ||
                    !form.quantity
                  }
                  className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Registrando..."
                    : "✓ Confirmar devolución"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAL DETALLE
          ===================================================== */}
      {showDetail && selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Detalle de devolución
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Devolución #
                    {shortId(selectedReturn.id)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Venta
                  </p>

                  <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                    #{selectedReturn.sale_id}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Fecha
                  </p>

                  <p className="mt-1 font-semibold text-slate-900">
                    {formatDate(
                      selectedReturn.created_at
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Cliente
                  </p>

                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedReturn.customer_name ||
                      "Cliente general"}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Estado
                  </p>

                  <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    {selectedReturn.status}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="mb-3 font-bold text-slate-900">
                  Productos devueltos
                </h3>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">
                          Producto
                        </th>

                        <th className="px-4 py-3 text-right font-semibold text-slate-600">
                          Cantidad
                        </th>

                        <th className="px-4 py-3 text-right font-semibold text-slate-600">
                          Precio
                        </th>

                        <th className="px-4 py-3 text-right font-semibold text-slate-600">
                          Subtotal
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {(
                        selectedReturn.customer_return_items ??
                        []
                      ).map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {item.products?.name ??
                                "Producto"}
                            </p>

                            <p className="text-xs text-slate-500">
                              SKU:{" "}
                              {item.products?.sku ||
                                "Sin SKU"}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-right font-bold text-emerald-600">
                            +{item.quantity}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatMoney(
                              Number(item.unit_price)
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {formatMoney(
                              Number(item.subtotal)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Motivo
                </p>

                <p className="mt-2 text-sm text-slate-700">
                  {selectedReturn.reason ||
                    "Sin motivo especificado"}
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}