"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type InventoryMode =
  | "global"
  | "branch"
  | "warehouse"
  | "location";

type Branch = {
  id: string;
  name: string;
  code: string | null;
};

type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  branch_id: string | null;
};

type Location = {
  id: string;
  name: string;
  code: string | null;
  warehouse_id: string;
};

type Receipt = {
  id: string;
  receipt_number: string | null;
  received_at: string;
  status: string;
  scope: InventoryMode;
  branch_id: string | null;
  warehouse_id: string | null;
  location_id: string | null;

  branches: {
    id: string;
    name: string;
    code: string | null;
  } | null;

  warehouses: {
    id: string;
    name: string;
    code: string | null;
  } | null;

  locations: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type Purchase = {
  id: string;
  document_number: string | null;
  purchase_date: string;
  status: "pendiente" | "recibida" | "cancelada";
  subtotal: number;
  total: number;
  notes: string | null;

  suppliers: {
    id: string;
    name: string;
  } | null;

  purchase_items: {
    id: string;
    quantity: number;
    unit_cost: number;
    subtotal: number;

    products: {
      id: string;
      name: string;
      sku: string | null;
    } | null;
  }[];

  receipts: Receipt[] | null;
};

const RECEPTIONS_PAGE_SIZE = 10;

export default function RecepcionesPage() {
  // Cada sección pagina por separado contra GET /api/purchases con
  // su propio status=: antes se traía una sola página (20 filas, sin
  // filtrar por estado) y se separaba en memoria, así que con más de
  // 20 compras podían faltar pendientes o recepciones enteras.
  const [pendingPurchases, setPendingPurchases] = useState<
    Purchase[]
  >([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingOffset, setPendingOffset] = useState(0);
  const [loadingPending, setLoadingPending] = useState(true);

  const [receivedPurchases, setReceivedPurchases] = useState<
    Purchase[]
  >([]);
  const [receivedTotal, setReceivedTotal] = useState(0);
  const [receivedOffset, setReceivedOffset] = useState(0);
  const [loadingReceived, setLoadingReceived] = useState(true);

  // 403 de GET /api/purchases: la página no se usa ni se muestra
  // vacía, se reemplaza por un aviso de acceso.
  const [accessDenied, setAccessDenied] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [receivingPurchaseId, setReceivingPurchaseId] =
    useState<string | null>(null);

  const [selectedPurchase, setSelectedPurchase] =
    useState<Purchase | null>(null);

  const [showReceiveModal, setShowReceiveModal] =
    useState(false);

  const [inventoryMode, setInventoryMode] =
    useState<InventoryMode>("global");

  const [loadingInventoryMode, setLoadingInventoryMode] =
    useState(false);

  const [loadingLocations, setLoadingLocations] =
    useState(false);

  const [selectedBranchId, setSelectedBranchId] =
    useState("");

  const [selectedWarehouseId, setSelectedWarehouseId] =
    useState("");

  const [selectedLocationId, setSelectedLocationId] =
    useState("");

  async function loadPendingPurchases(
    nextOffset: number
  ) {
    try {
      setLoadingPending(true);

      const response = await fetch(
        `/api/purchases?status=pendiente&limit=${RECEPTIONS_PAGE_SIZE}&offset=${nextOffset}`
      );

      if (response.status === 403) {
        setAccessDenied(true);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudieron cargar las compras pendientes."
        );
      }

      setPendingPurchases(data.purchases ?? []);
      setPendingTotal(
        typeof data.total === "number" ? data.total : 0
      );
      setPendingOffset(nextOffset);
    } catch (error) {
      console.error(
        "Error cargando compras pendientes:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las compras pendientes."
      );
    } finally {
      setLoadingPending(false);
    }
  }

  async function loadReceivedPurchases(
    nextOffset: number
  ) {
    try {
      setLoadingReceived(true);

      const response = await fetch(
        `/api/purchases?status=recibida&limit=${RECEPTIONS_PAGE_SIZE}&offset=${nextOffset}`
      );

      if (response.status === 403) {
        setAccessDenied(true);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo cargar el historial de recepciones."
        );
      }

      setReceivedPurchases(data.purchases ?? []);
      setReceivedTotal(
        typeof data.total === "number" ? data.total : 0
      );
      setReceivedOffset(nextOffset);
    } catch (error) {
      console.error(
        "Error cargando historial de recepciones:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el historial de recepciones."
      );
    } finally {
      setLoadingReceived(false);
    }
  }

  async function loadData() {
    try {
      const branchesPromise = fetch(
        "/api/inventory/branches"
      );
      const warehousesPromise = fetch(
        "/api/inventory/warehouses"
      );

      await Promise.all([
        loadPendingPurchases(0),
        loadReceivedPurchases(0),
      ]);

      const [branchesResponse, warehousesResponse] =
        await Promise.all([
          branchesPromise,
          warehousesPromise,
        ]);

      if (branchesResponse.ok) {
        const branchesData =
          await branchesResponse.json();

        setBranches(branchesData.branches ?? []);
      } else {
        setBranches([]);
      }

      if (warehousesResponse.ok) {
        const warehousesData =
          await warehousesResponse.json();

        setWarehouses(warehousesData.warehouses ?? []);
      } else {
        setWarehouses([]);
      }
    } catch (error) {
      console.error(
        "Error cargando recepciones:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Error cargando las recepciones."
      );
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInventoryMode(
    purchaseId: string
  ) {
    try {
      setLoadingInventoryMode(true);

      const response = await fetch(
        `/api/purchases/${purchaseId}/receive`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo determinar el modo de inventario."
        );
      }

      const mode = data.inventory_mode as InventoryMode;

      if (
        ![
          "global",
          "branch",
          "warehouse",
          "location",
        ].includes(mode)
      ) {
        throw new Error(
          "La tienda tiene un modo de inventario inválido."
        );
      }

      setInventoryMode(mode);
    } catch (error) {
      console.error(
        "Error obteniendo modo de inventario:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "No se pudo determinar el modo de inventario."
      );

      setInventoryMode("global");
    } finally {
      setLoadingInventoryMode(false);
    }
  }

  async function loadLocations(
    warehouseId: string
  ) {
    if (!warehouseId) {
      setLocations([]);
      setSelectedLocationId("");
      return;
    }

    try {
      setLoadingLocations(true);

      const response = await fetch(
        `/api/inventory/locations?warehouse_id=${encodeURIComponent(
          warehouseId
        )}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudieron cargar las ubicaciones."
        );
      }

      setLocations(data.locations ?? []);
    } catch (error) {
      console.error(
        "Error cargando ubicaciones:",
        error
      );

      setLocations([]);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las ubicaciones."
      );
    } finally {
      setLoadingLocations(false);
    }
  }

  function openReceiveModal(purchase: Purchase) {
    if (purchase.status !== "pendiente") {
      alert(
        "Esta compra ya no está pendiente de recepción."
      );
      return;
    }

    setSelectedPurchase(purchase);
    setInventoryMode("global");

    setSelectedBranchId("");
    setSelectedWarehouseId("");
    setSelectedLocationId("");

    setLocations([]);

    setShowReceiveModal(true);

    void loadInventoryMode(purchase.id);
  }

  function closeReceiveModal() {
    if (receivingPurchaseId) {
      return;
    }

    setShowReceiveModal(false);
    setSelectedPurchase(null);

    setSelectedBranchId("");
    setSelectedWarehouseId("");
    setSelectedLocationId("");

    setLocations([]);
  }

  async function handleWarehouseChange(
    warehouseId: string
  ) {
    setSelectedWarehouseId(warehouseId);
    setSelectedLocationId("");
    setLocations([]);

    if (!warehouseId) {
      return;
    }

    await loadLocations(warehouseId);
  }

  function validateReceiveScope() {
    if (inventoryMode === "global") {
      return true;
    }

    if (inventoryMode === "branch") {
      if (!selectedBranchId) {
        alert(
          "Selecciona la sucursal donde ingresará la mercancía."
        );
        return false;
      }

      return true;
    }

    if (inventoryMode === "warehouse") {
      if (!selectedWarehouseId) {
        alert(
          "Selecciona el almacén donde ingresará la mercancía."
        );
        return false;
      }

      return true;
    }

    if (inventoryMode === "location") {
      if (!selectedWarehouseId) {
        alert(
          "Selecciona el almacén donde ingresará la mercancía."
        );
        return false;
      }

      if (!selectedLocationId) {
        alert(
          "Selecciona la ubicación donde ingresará la mercancía."
        );
        return false;
      }

      return true;
    }

    return false;
  }

  async function confirmReceivePurchase() {
    if (!selectedPurchase) {
      return;
    }

    if (!validateReceiveScope()) {
      return;
    }

    const purchaseId = selectedPurchase.id;

    const body: {
      branch_id?: string;
      warehouse_id?: string;
      location_id?: string;
    } = {};

    if (inventoryMode === "branch") {
      body.branch_id = selectedBranchId;
    }

    if (
      inventoryMode === "warehouse" ||
      inventoryMode === "location"
    ) {
      body.warehouse_id = selectedWarehouseId;
    }

    if (inventoryMode === "location") {
      body.location_id = selectedLocationId;
    }

    try {
      setReceivingPurchaseId(purchaseId);

      const response = await fetch(
        `/api/purchases/${purchaseId}/receive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No se pudo registrar la recepción."
        );
      }

      alert(
        "Recepción registrada correctamente.\n\n" +
          "El stock fue actualizado y la compra quedó marcada como recibida."
      );

      setShowReceiveModal(false);
      setSelectedPurchase(null);

      setSelectedBranchId("");
      setSelectedWarehouseId("");
      setSelectedLocationId("");

      setLocations([]);

      await loadData();
    } catch (error) {
      console.error(
        "Error registrando recepción:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Error registrando la recepción."
      );
    } finally {
      setReceivingPurchaseId(null);
    }
  }

  function formatMoney(value: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatDate(value: string) {
    if (!value) {
      return "—";
    }

    return new Date(value).toLocaleDateString(
      "es-CO"
    );
  }

  function formatDateTime(value: string) {
    if (!value) {
      return "—";
    }

    return new Date(value).toLocaleString(
      "es-CO",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    );
  }

  function totalProducts(purchase: Purchase) {
    return purchase.purchase_items?.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    );
  }

  function getReceipt(purchase: Purchase) {
    if (
      !purchase.receipts ||
      purchase.receipts.length === 0
    ) {
      return null;
    }

    return [...purchase.receipts].sort(
      (a, b) =>
        new Date(b.received_at).getTime() -
        new Date(a.received_at).getTime()
    )[0];
  }

  function getScopeLabel(
    receipt: Receipt | null
  ) {
    if (!receipt) {
      return "Sin recepción";
    }

    switch (receipt.scope) {
      case "global":
        return "Inventario global";

      case "branch":
        return receipt.branches?.name
          ? `Sucursal: ${receipt.branches.name}`
          : "Sucursal";

      case "warehouse":
        return receipt.warehouses?.name
          ? `Almacén: ${receipt.warehouses.name}`
          : "Almacén";

      case "location":
        if (
          receipt.warehouses?.name &&
          receipt.locations?.name
        ) {
          return `${receipt.warehouses.name} → ${receipt.locations.name}`;
        }

        if (receipt.locations?.name) {
          return `Ubicación: ${receipt.locations.name}`;
        }

        if (receipt.warehouses?.name) {
          return `Almacén: ${receipt.warehouses.name}`;
        }

        return "Almacén / ubicación";

      default:
        return "—";
    }
  }

  function getReceiptDestination(
    receipt: Receipt | null
  ) {
    if (!receipt) {
      return null;
    }

    return {
      branch:
        receipt.branches?.name || null,

      warehouse:
        receipt.warehouses?.name || null,

      location:
        receipt.locations?.name || null,
    };
  }

  function openDetail(purchase: Purchase) {
    setSelectedPurchase(purchase);
    setShowReceiveModal(false);
  }

  function closeDetail() {
    setSelectedPurchase(null);
  }

  const selectedTotal = selectedPurchase
    ? Number(selectedPurchase.total) ||
      selectedPurchase.purchase_items.reduce(
        (sum, item) =>
          sum +
          Number(item.quantity) *
            Number(item.unit_cost),
        0
      )
    : 0;

  const selectedReceipt = selectedPurchase
    ? getReceipt(selectedPurchase)
    : null;

  const selectedDestination =
    getReceiptDestination(selectedReceipt);

  const selectedWarehouse =
    warehouses.find(
      (warehouse) =>
        warehouse.id === selectedWarehouseId
    ) || null;

  const availableLocations = locations.filter(
    (location) =>
      location.warehouse_id ===
      selectedWarehouseId
  );

  if (accessDenied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-4xl">🔒</p>

          <h1 className="mt-4 text-xl font-bold text-slate-900">
            No tienes acceso a Compras
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Esta sección es solo para owner, admin o manager.
          </p>

          <Link
            href="/inventario"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Volver al inventario
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* ENCABEZADO */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/inventario/entradas"
              className="mb-2 inline-block text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Volver a Entradas
            </Link>

            <h1 className="text-3xl font-bold text-slate-900">
              📦 Recepciones de proveedores
            </h1>

            <p className="mt-1 text-slate-600">
              Registra la mercancía que realmente recibes de
              tus proveedores.
            </p>
          </div>

          <Link
            href="/inventario/entradas/compras"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            🛒 Ver compras
          </Link>
        </div>

        {/* RESUMEN */}
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-700">
              Pendientes de recibir
            </p>

            <p className="mt-1 text-3xl font-bold text-amber-900">
              {pendingTotal}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-700">
              Recepciones realizadas
            </p>

            <p className="mt-1 text-3xl font-bold text-emerald-900">
              {receivedTotal}
            </p>
          </div>
        </div>

        {/* INFORMACIÓN */}
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="font-semibold text-blue-900">
            ℹ️ ¿Cómo funciona una recepción?
          </p>

          <p className="mt-1 text-sm leading-6 text-blue-800">
            Una compra representa lo que adquiriste al
            proveedor. La recepción confirma que la mercancía
            llegó físicamente. Al confirmar una recepción, el
            sistema actualiza automáticamente el stock y
            registra el movimiento de entrada.
          </p>
        </div>

        {/* PENDIENTES */}
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              📦 Pendientes de recepción
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Compras que todavía no han ingresado al inventario.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loadingPending ? (
              <div className="p-8 text-center text-slate-500">
                Cargando recepciones...
              </div>
            ) : pendingPurchases.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl">✅</div>

                <h3 className="mt-4 text-xl font-bold text-slate-900">
                  No hay compras pendientes
                </h3>

                <p className="mt-2 text-slate-500">
                  Todas las compras registradas han sido
                  recibidas.
                </p>

                <Link
                  href="/inventario/entradas/compras"
                  className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  🛒 Ver compras
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Fecha
                      </th>

                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Documento
                      </th>

                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Proveedor
                      </th>

                      <th className="px-5 py-4 text-center font-semibold text-slate-700">
                        Productos
                      </th>

                      <th className="px-5 py-4 text-right font-semibold text-slate-700">
                        Total
                      </th>

                      <th className="px-5 py-4 text-center font-semibold text-slate-700">
                        Acción
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {pendingPurchases.map(
                      (purchase) => (
                        <tr
                          key={purchase.id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-4">
                            {formatDate(
                              purchase.purchase_date
                            )}
                          </td>

                          <td className="px-5 py-4 font-medium text-slate-900">
                            {purchase.document_number ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-slate-700">
                            {purchase.suppliers?.name ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-center text-slate-700">
                            {totalProducts(purchase)}
                          </td>

                          <td className="px-5 py-4 text-right font-semibold text-slate-900">
                            {formatMoney(
                              Number(purchase.total)
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-wrap justify-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openDetail(purchase)
                                }
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                👁️ Ver detalle
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openReceiveModal(
                                    purchase
                                  )
                                }
                                disabled={
                                  receivingPurchaseId ===
                                  purchase.id
                                }
                                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                📦 Recibir mercancía
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingPending && pendingPurchases.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
                <p className="text-sm text-slate-500">
                  Página{" "}
                  {Math.floor(
                    pendingOffset / RECEPTIONS_PAGE_SIZE
                  ) + 1}{" "}
                  de{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      pendingTotal / RECEPTIONS_PAGE_SIZE
                    )
                  )}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pendingOffset === 0}
                    onClick={() =>
                      loadPendingPurchases(
                        Math.max(
                          0,
                          pendingOffset -
                            RECEPTIONS_PAGE_SIZE
                        )
                      )
                    }
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    disabled={
                      pendingOffset +
                        RECEPTIONS_PAGE_SIZE >=
                      pendingTotal
                    }
                    onClick={() =>
                      loadPendingPurchases(
                        pendingOffset +
                          RECEPTIONS_PAGE_SIZE
                      )
                    }
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* HISTORIAL */}
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              📋 Historial de recepciones
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Compras cuya mercancía ya fue ingresada al
              inventario.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loadingReceived ? (
              <div className="p-8 text-center text-slate-500">
                Cargando historial...
              </div>
            ) : receivedPurchases.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                Todavía no hay recepciones registradas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Fecha
                      </th>

                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Documento
                      </th>

                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Proveedor
                      </th>

                      <th className="px-5 py-4 text-center font-semibold text-slate-700">
                        Productos
                      </th>

                      <th className="px-5 py-4 text-right font-semibold text-slate-700">
                        Total
                      </th>

                      <th className="px-5 py-4 text-left font-semibold text-slate-700">
                        Destino
                      </th>

                      <th className="px-5 py-4 text-center font-semibold text-slate-700">
                        Estado
                      </th>

                      <th className="px-5 py-4 text-center font-semibold text-slate-700">
                        Acción
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {receivedPurchases.map(
                      (purchase) => {
                        const receipt =
                          getReceipt(purchase);

                        return (
                          <tr
                            key={purchase.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-5 py-4">
                              {formatDate(
                                receipt?.received_at ||
                                  purchase.purchase_date
                              )}
                            </td>

                            <td className="px-5 py-4 font-medium text-slate-900">
                              {purchase.document_number ||
                                "—"}
                            </td>

                            <td className="px-5 py-4 text-slate-700">
                              {purchase.suppliers?.name ||
                                "—"}
                            </td>

                            <td className="px-5 py-4 text-center text-slate-700">
                              {totalProducts(purchase)}
                            </td>

                            <td className="px-5 py-4 text-right font-semibold text-slate-900">
                              {formatMoney(
                                Number(purchase.total)
                              )}
                            </td>

                            <td className="px-5 py-4">
                              {receipt ? (
                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {getScopeLabel(
                                      receipt
                                    )}
                                  </p>

                                  {receipt.scope ===
                                    "location" &&
                                    receipt.warehouses
                                      ?.code && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        Almacén:{" "}
                                        {
                                          receipt
                                            .warehouses
                                            .code
                                        }
                                      </p>
                                    )}

                                  {receipt.scope ===
                                    "location" &&
                                    receipt.locations
                                      ?.code && (
                                      <p className="text-xs text-slate-500">
                                        Ubicación:{" "}
                                        {
                                          receipt
                                            .locations
                                            .code
                                        }
                                      </p>
                                    )}

                                  {receipt.scope ===
                                    "branch" &&
                                    receipt.branches
                                      ?.code && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        Código:{" "}
                                        {
                                          receipt.branches
                                            .code
                                        }
                                      </p>
                                    )}
                                </div>
                              ) : (
                                <span className="text-slate-400">
                                  Sin destino registrado
                                </span>
                              )}
                            </td>

                            <td className="px-5 py-4 text-center">
                              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                ✓ Recibida
                              </span>
                            </td>

                            <td className="px-5 py-4 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  openDetail(purchase)
                                }
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                👁️ Ver detalle
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingReceived &&
              receivedPurchases.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
                  <p className="text-sm text-slate-500">
                    Página{" "}
                    {Math.floor(
                      receivedOffset /
                        RECEPTIONS_PAGE_SIZE
                    ) + 1}{" "}
                    de{" "}
                    {Math.max(
                      1,
                      Math.ceil(
                        receivedTotal /
                          RECEPTIONS_PAGE_SIZE
                      )
                    )}
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={receivedOffset === 0}
                      onClick={() =>
                        loadReceivedPurchases(
                          Math.max(
                            0,
                            receivedOffset -
                              RECEPTIONS_PAGE_SIZE
                          )
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>

                    <button
                      type="button"
                      disabled={
                        receivedOffset +
                          RECEPTIONS_PAGE_SIZE >=
                        receivedTotal
                      }
                      onClick={() =>
                        loadReceivedPurchases(
                          receivedOffset +
                            RECEPTIONS_PAGE_SIZE
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
          </div>
        </section>
      </div>

      {/* MODAL DE RECEPCIÓN */}
      {showReceiveModal &&
        selectedPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    📦 Confirmar recepción
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Revisa la mercancía y define dónde ingresará
                    al inventario.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeReceiveModal}
                  disabled={!!receivingPurchaseId}
                  className="rounded-lg px-3 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto space-y-6 p-6">
                {/* DATOS */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Proveedor
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedPurchase.suppliers
                        ?.name || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Documento
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedPurchase.document_number ||
                        "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Fecha
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {formatDate(
                        selectedPurchase.purchase_date
                      )}
                    </p>
                  </div>
                </div>

                {/* CONFIGURACIÓN DE INVENTARIO */}
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Destino de la recepción
                    </p>

                    <h3 className="mt-1 text-lg font-bold text-blue-950">
                      {loadingInventoryMode
                        ? "Consultando configuración..."
                        : inventoryMode === "global"
                        ? "Inventario global"
                        : inventoryMode === "branch"
                        ? "Recepción por sucursal"
                        : inventoryMode ===
                          "warehouse"
                        ? "Recepción por almacén"
                        : "Recepción por ubicación"}
                    </h3>
                  </div>

                  {loadingInventoryMode ? (
                    <div className="rounded-xl bg-white p-4 text-sm text-slate-500">
                      Consultando el modo de inventario de la
                      tienda...
                    </div>
                  ) : inventoryMode === "global" ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="font-semibold text-emerald-900">
                        ✓ Inventario global
                      </p>

                      <p className="mt-1 text-sm leading-6 text-emerald-800">
                        Esta recepción ingresará al inventario
                        global de la tienda.
                      </p>
                    </div>
                  ) : inventoryMode === "branch" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Sucursal
                      </label>

                      <select
                        value={selectedBranchId}
                        onChange={(event) =>
                          setSelectedBranchId(
                            event.target.value
                          )
                        }
                        disabled={
                          !!receivingPurchaseId
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">
                          Selecciona una sucursal
                        </option>

                        {branches.map((branch) => (
                          <option
                            key={branch.id}
                            value={branch.id}
                          >
                            {branch.name}
                            {branch.code
                              ? ` — ${branch.code}`
                              : ""}
                          </option>
                        ))}
                      </select>

                      {branches.length === 0 && (
                        <p className="mt-2 text-sm text-amber-700">
                          No hay sucursales disponibles.
                        </p>
                      )}
                    </div>
                  ) : inventoryMode ===
                    "warehouse" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Almacén
                      </label>

                      <select
                        value={selectedWarehouseId}
                        onChange={(event) =>
                          handleWarehouseChange(
                            event.target.value
                          )
                        }
                        disabled={
                          !!receivingPurchaseId
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">
                          Selecciona un almacén
                        </option>

                        {warehouses.map(
                          (warehouse) => (
                            <option
                              key={warehouse.id}
                              value={warehouse.id}
                            >
                              {warehouse.name}
                              {warehouse.code
                                ? ` — ${warehouse.code}`
                                : ""}
                            </option>
                          )
                        )}
                      </select>

                      {warehouses.length === 0 && (
                        <p className="mt-2 text-sm text-amber-700">
                          No hay almacenes disponibles.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                          Almacén
                        </label>

                        <select
                          value={
                            selectedWarehouseId
                          }
                          onChange={(event) =>
                            handleWarehouseChange(
                              event.target.value
                            )
                          }
                          disabled={
                            !!receivingPurchaseId
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                        >
                          <option value="">
                            Selecciona un almacén
                          </option>

                          {warehouses.map(
                            (warehouse) => (
                              <option
                                key={warehouse.id}
                                value={warehouse.id}
                              >
                                {warehouse.name}
                                {warehouse.code
                                  ? ` — ${warehouse.code}`
                                  : ""}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                          Ubicación
                        </label>

                        <select
                          value={selectedLocationId}
                          onChange={(event) =>
                            setSelectedLocationId(
                              event.target.value
                            )
                          }
                          disabled={
                            !selectedWarehouseId ||
                            !!receivingPurchaseId ||
                            loadingLocations
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                        >
                          <option value="">
                            {loadingLocations
                              ? "Cargando ubicaciones..."
                              : !selectedWarehouseId
                              ? "Primero selecciona un almacén"
                              : "Selecciona una ubicación"}
                          </option>

                          {availableLocations.map(
                            (location) => (
                              <option
                                key={location.id}
                                value={location.id}
                              >
                                {location.name}
                                {location.code
                                  ? ` — ${location.code}`
                                  : ""}
                              </option>
                            )
                          )}
                        </select>

                        {selectedWarehouseId &&
                          !loadingLocations &&
                          availableLocations.length ===
                            0 && (
                            <p className="mt-2 text-sm text-amber-700">
                              Este almacén no tiene ubicaciones
                              disponibles.
                            </p>
                          )}
                      </div>

                      {selectedWarehouse && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Destino seleccionado
                          </p>

                          <p className="mt-1 font-semibold text-slate-900">
                            {selectedWarehouse.name}
                            {selectedWarehouse.code
                              ? ` (${selectedWarehouse.code})`
                              : ""}
                          </p>

                          {selectedLocationId && (
                            <p className="mt-1 text-sm text-slate-600">
                              →{" "}
                              {
                                availableLocations.find(
                                  (location) =>
                                    location.id ===
                                    selectedLocationId
                                )?.name
                              }
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* PRODUCTOS */}
                <div>
                  <h3 className="mb-3 font-semibold text-slate-900">
                    Productos recibidos
                  </h3>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-600">
                            Producto
                          </th>

                          <th className="px-4 py-3 text-left font-semibold text-slate-600">
                            SKU
                          </th>

                          <th className="px-4 py-3 text-right font-semibold text-slate-600">
                            Cantidad
                          </th>

                          <th className="px-4 py-3 text-right font-semibold text-slate-600">
                            Costo unitario
                          </th>

                          <th className="px-4 py-3 text-right font-semibold text-slate-600">
                            Subtotal
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {selectedPurchase.purchase_items.map(
                          (item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {item.products?.name ||
                                  "Producto"}
                              </td>

                              <td className="px-4 py-3 text-slate-500">
                                {item.products?.sku ||
                                  "—"}
                              </td>

                              <td className="px-4 py-3 text-right text-slate-700">
                                {Number(
                                  item.quantity
                                )}
                              </td>

                              <td className="px-4 py-3 text-right text-slate-700">
                                {formatMoney(
                                  Number(
                                    item.unit_cost
                                  )
                                )}
                              </td>

                              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                {formatMoney(
                                  Number(
                                    item.subtotal
                                  ) ||
                                    Number(
                                      item.quantity
                                    ) *
                                      Number(
                                        item.unit_cost
                                      )
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>

                      <tfoot className="border-t border-slate-200 bg-slate-50">
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-4 text-right font-semibold text-slate-700"
                          >
                            Total
                          </td>

                          <td className="px-4 py-4 text-right text-lg font-bold text-slate-900">
                            {formatMoney(
                              selectedTotal
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* AVISO */}
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-3">
                    <div className="text-xl">
                      ⚠️
                    </div>

                    <div>
                      <p className="font-semibold text-amber-900">
                        Antes de confirmar
                      </p>

                      <p className="mt-1 text-sm leading-6 text-amber-800">
                        Al confirmar esta recepción, las
                        cantidades indicadas se agregarán al
                        stock y se registrará un movimiento de
                        entrada.
                      </p>

                      <p className="mt-2 text-sm font-semibold text-amber-900">
                        Esta acción no debe repetirse para la
                        misma compra.
                      </p>
                    </div>
                  </div>
                </div>

                {selectedPurchase.notes && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Notas de la compra
                    </p>

                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {selectedPurchase.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* FOOTER */}
              <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReceiveModal}
                  disabled={!!receivingPurchaseId}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmReceivePurchase}
                  disabled={
                    !!receivingPurchaseId ||
                    loadingInventoryMode
                  }
                  className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {receivingPurchaseId
                    ? "Registrando recepción..."
                    : loadingInventoryMode
                    ? "Consultando configuración..."
                    : "✓ Confirmar recepción"}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* MODAL DE DETALLE */}
      {!showReceiveModal &&
        selectedPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    📋 Detalle de la compra
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Información de los productos y destino de
                    esta recepción.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg px-3 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6 p-6">
                {/* DATOS */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Proveedor
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedPurchase.suppliers
                        ?.name || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Documento
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedPurchase.document_number ||
                        "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Estado
                    </p>

                    <p className="mt-1">
                      {selectedPurchase.status ===
                      "recibida" ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          ✓ Recibida
                        </span>
                      ) : selectedPurchase.status ===
                        "pendiente" ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Pendiente
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                          Cancelada
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* DESTINO */}
                {selectedReceipt && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">
                        📍
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Destino de la recepción
                        </p>

                        <p className="mt-1 text-lg font-bold text-emerald-950">
                          {getScopeLabel(
                            selectedReceipt
                          )}
                        </p>

                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {selectedDestination?.branch && (
                            <div className="rounded-xl bg-white/70 p-3">
                              <p className="text-xs font-semibold text-slate-500">
                                Sucursal
                              </p>

                              <p className="mt-1 font-semibold text-slate-900">
                                {
                                  selectedDestination.branch
                                }
                              </p>
                            </div>
                          )}

                          {selectedDestination?.warehouse && (
                            <div className="rounded-xl bg-white/70 p-3">
                              <p className="text-xs font-semibold text-slate-500">
                                Almacén
                              </p>

                              <p className="mt-1 font-semibold text-slate-900">
                                {
                                  selectedDestination.warehouse
                                }
                              </p>

                              {selectedReceipt
                                .warehouses
                                ?.code && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Código:{" "}
                                  {
                                    selectedReceipt
                                      .warehouses
                                      .code
                                  }
                                </p>
                              )}
                            </div>
                          )}

                          {selectedDestination?.location && (
                            <div className="rounded-xl bg-white/70 p-3">
                              <p className="text-xs font-semibold text-slate-500">
                                Ubicación
                              </p>

                              <p className="mt-1 font-semibold text-slate-900">
                                {
                                  selectedDestination.location
                                }
                              </p>

                              {selectedReceipt
                                .locations?.code && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Código:{" "}
                                  {
                                    selectedReceipt
                                      .locations.code
                                  }
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-emerald-800">
                          <span>
                            Recepción:{" "}
                            {selectedReceipt.receipt_number ||
                              "—"}
                          </span>

                          <span>
                            Recibida:{" "}
                            {formatDateTime(
                              selectedReceipt.received_at
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!selectedReceipt &&
                  selectedPurchase.status ===
                    "recibida" && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <p className="font-semibold text-slate-900">
                        📍 Sin destino registrado
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Esta recepción histórica no tiene un
                        destino físico registrado.
                      </p>
                    </div>
                  )}

                {/* PRODUCTOS */}
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">
                          Producto
                        </th>

                        <th className="px-4 py-3 text-left font-semibold text-slate-600">
                          SKU
                        </th>

                        <th className="px-4 py-3 text-right font-semibold text-slate-600">
                          Cantidad
                        </th>

                        <th className="px-4 py-3 text-right font-semibold text-slate-600">
                          Costo
                        </th>

                        <th className="px-4 py-3 text-right font-semibold text-slate-600">
                          Subtotal
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {selectedPurchase.purchase_items.map(
                        (item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {item.products?.name ||
                                "Producto"}
                            </td>

                            <td className="px-4 py-3 text-slate-500">
                              {item.products?.sku ||
                                "—"}
                            </td>

                            <td className="px-4 py-3 text-right text-slate-700">
                              {Number(
                                item.quantity
                              )}
                            </td>

                            <td className="px-4 py-3 text-right text-slate-700">
                              {formatMoney(
                                Number(
                                  item.unit_cost
                                )
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-slate-900">
                              {formatMoney(
                                Number(
                                  item.subtotal
                                ) ||
                                  Number(
                                    item.quantity
                                  ) *
                                    Number(
                                      item.unit_cost
                                    )
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>

                    <tfoot className="border-t border-slate-200 bg-slate-50">
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-4 text-right font-semibold text-slate-700"
                        >
                          Total
                        </td>

                        <td className="px-4 py-4 text-right text-lg font-bold text-slate-900">
                          {formatMoney(
                            selectedTotal
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {selectedPurchase.notes && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Notas
                    </p>

                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {selectedPurchase.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-5">
                {selectedPurchase.status ===
                  "pendiente" && (
                  <button
                    type="button"
                    onClick={() =>
                      openReceiveModal(
                        selectedPurchase
                      )
                    }
                    className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    📦 Recibir mercancía
                  </button>
                )}

                {selectedPurchase.status ===
                  "recibida" && (
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
    </main>
  );
}