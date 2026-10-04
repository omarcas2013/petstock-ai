"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Supplier = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  purchase_price: number;
  sale_price: number;
};

type PurchaseItem = {
  id?: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  product?: Product | null;
};

type Purchase = {
  id: string;
  created_at: string;
  document_number?: string | null;
  supplier_id?: string | null;
  status: string;
  total?: number | null;
  // GET /api/purchases devuelve la relación como "suppliers".
  suppliers?: Supplier | null;
  purchase_items?: PurchaseItem[];
};

type Branch = {
  id: string;
  name: string;
  code: string;
  is_active?: boolean;
};

type Warehouse = {
  id: string;
  name: string;
  code: string;
  branch_id?: string | null;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  is_active?: boolean;
};

type Location = {
  id: string;
  name: string;
  code: string;
  warehouse_id: string;
  location_type?: string | null;
  capacity?: number | null;
  is_active?: boolean;
};

type InventoryMode =
  | "global"
  | "branch"
  | "warehouse"
  | "location";

type ReceiveModalState = {
  purchaseId: string;
  purchase?: Purchase | null;
};

const PURCHASES_PAGE_SIZE = 20;

export default function ComprasPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [purchasesOffset, setPurchasesOffset] = useState(0);

  // 403 de GET /api/purchases: la página no se usa ni se muestra
  // vacía, se reemplaza por un aviso de acceso.
  const [accessDenied, setAccessDenied] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receivingPurchaseId, setReceivingPurchaseId] =
    useState<string | null>(null);

  // =========================================================
  // ANULAR COMPRA
  // =========================================================

  const [cancelPurchase, setCancelPurchase] =
    useState<Purchase | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [showForm, setShowForm] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");

  const [items, setItems] = useState<PurchaseItem[]>([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  // Se guarda como texto para poder borrar el campo
  // y escribir libremente; se valida al agregar.
  const [quantityInput, setQuantityInput] =
    useState("1");
  const [unitCost, setUnitCost] = useState(0);

  // =========================================================
  // RECEPCIÓN
  // =========================================================

  const [receiveModal, setReceiveModal] =
    useState<ReceiveModalState | null>(null);

  const [inventoryMode, setInventoryMode] =
    useState<InventoryMode>("global");

  const [loadingInventoryMode, setLoadingInventoryMode] =
    useState(false);

  const [selectedBranchId, setSelectedBranchId] =
    useState("");

  const [selectedWarehouseId, setSelectedWarehouseId] =
    useState("");

  const [selectedLocationId, setSelectedLocationId] =
    useState("");

  const [loadingLocations, setLoadingLocations] =
    useState(false);

  // =========================================================
  // CARGAR DATOS
  // =========================================================

  async function loadData(nextOffset: number = purchasesOffset) {
    try {
      setLoading(true);

      const [
        suppliersResponse,
        productsResponse,
        purchasesResponse,
        branchesResponse,
        warehousesResponse,
      ] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/products"),
        fetch(
          `/api/purchases?limit=${PURCHASES_PAGE_SIZE}&offset=${nextOffset}`
        ),
        fetch("/api/inventory/branches"),
        fetch("/api/inventory/warehouses"),
      ]);

      if (purchasesResponse.status === 403) {
        setAccessDenied(true);
        return;
      }

      if (!suppliersResponse.ok) {
        throw new Error(
          "No se pudieron cargar los proveedores."
        );
      }

      if (!productsResponse.ok) {
        throw new Error(
          "No se pudieron cargar los productos."
        );
      }

      if (!purchasesResponse.ok) {
        throw new Error(
          "No se pudieron cargar las compras."
        );
      }

      if (!branchesResponse.ok) {
        throw new Error(
          "No se pudieron cargar las sucursales."
        );
      }

      if (!warehousesResponse.ok) {
        throw new Error(
          "No se pudieron cargar los almacenes."
        );
      }

      const suppliersData =
        await suppliersResponse.json();

      const productsData =
        await productsResponse.json();

      const purchasesData =
        await purchasesResponse.json();

      const branchesData =
        await branchesResponse.json();

      const warehousesData =
        await warehousesResponse.json();

      setSuppliers(
        suppliersData.suppliers ??
          suppliersData ??
          []
      );

      setProducts(
        productsData.products ??
          productsData ??
          []
      );

      setPurchases(
        purchasesData.purchases ??
          purchasesData ??
          []
      );

      setPurchasesTotal(
        typeof purchasesData.total === "number"
          ? purchasesData.total
          : 0
      );

      setPurchasesOffset(nextOffset);

      const branchList =
        branchesData.branches ??
        branchesData ??
        [];

      setBranches(
        branchList.filter(
          (branch: Branch) =>
            branch.is_active !== false
        )
      );

      const warehouseList =
        warehousesData.warehouses ??
        warehousesData ??
        [];

      setWarehouses(
        warehouseList.filter(
          (warehouse: Warehouse) =>
            warehouse.is_active !== false
        )
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los datos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================================================
  // CARGAR MODALIDAD DE INVENTARIO
  // =========================================================

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
          data.error ||
            "No se pudo obtener la modalidad de inventario."
        );
      }

      const mode =
        data.inventory_mode as InventoryMode;

      if (
        ![
          "global",
          "branch",
          "warehouse",
          "location",
        ].includes(mode)
      ) {
        throw new Error(
          "La modalidad de inventario recibida no es válida."
        );
      }

      setInventoryMode(mode);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudo obtener la modalidad de inventario."
      );

      setInventoryMode("global");
    } finally {
      setLoadingInventoryMode(false);
    }
  }

  // =========================================================
  // CARGAR UBICACIONES
  // =========================================================

  async function loadLocations(
    warehouseId: string
  ) {
    if (!warehouseId) {
      setLocations([]);
      return;
    }

    try {
      setLoadingLocations(true);
      setLocations([]);

      const response = await fetch(
        `/api/inventory/locations?warehouse_id=${encodeURIComponent(
          warehouseId
        )}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudieron cargar las ubicaciones."
        );
      }

      const locationList =
        data.locations ?? data ?? [];

      setLocations(
        locationList.filter(
          (location: Location) =>
            location.is_active !== false
        )
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las ubicaciones."
      );
    } finally {
      setLoadingLocations(false);
    }
  }

  // =========================================================
  // AGREGAR PRODUCTO
  // =========================================================

  function addItem() {
    if (!selectedProductId) {
      alert("Selecciona un producto.");
      return;
    }

    const quantity = Number(quantityInput);

    if (
      quantityInput.trim() === "" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      alert(
        "La cantidad debe ser un número entero mayor que cero."
      );
      return;
    }

    if (unitCost < 0) {
      alert(
        "El costo unitario no puede ser negativo."
      );
      return;
    }

    const product = products.find(
      (item) =>
        item.id === selectedProductId
    );

    if (!product) {
      alert("Producto no encontrado.");
      return;
    }

    const existingItem = items.find(
      (item) =>
        item.product_id === selectedProductId
    );

    if (
      existingItem &&
      existingItem.unit_cost !== unitCost
    ) {
      alert(
        `${product.name} ya está en la compra con otro costo unitario. ` +
          "Quítalo y vuelve a agregarlo con la cantidad total y el costo correcto."
      );
      return;
    }

    if (existingItem) {
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.product_id === selectedProductId
            ? {
                ...item,
                quantity:
                  item.quantity + quantity,
              }
            : item
        )
      );
    } else {
      setItems((currentItems) => [
        ...currentItems,
        {
          product_id: selectedProductId,
          quantity,
          unit_cost: unitCost,
          product,
        },
      ]);
    }

    setSelectedProductId("");
    setQuantityInput("1");
    setUnitCost(0);
  }

  function removeItem(productId: string) {
    setItems((currentItems) =>
      currentItems.filter(
        (item) =>
          item.product_id !== productId
      )
    );
  }

  function resetForm() {
    setSupplierId("");
    setDocumentNumber("");
    setItems([]);
    setSelectedProductId("");
    setQuantityInput("1");
    setUnitCost(0);
    setShowForm(false);
  }

  // =========================================================
  // GUARDAR COMPRA
  // =========================================================

  async function savePurchase() {
    if (!supplierId) {
      alert("Selecciona un proveedor.");
      return;
    }

    if (items.length === 0) {
      alert(
        "Agrega al menos un producto a la compra."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/purchases",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            supplier_id: supplierId,
            document_number:
              documentNumber || null,
            items: items.map((item) => ({
              product_id:
                item.product_id,
              quantity: item.quantity,
              unit_cost: item.unit_cost,
            })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo registrar la compra."
        );
      }

      alert(
        "Compra registrada correctamente."
      );

      resetForm();
      await loadData(0);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la compra."
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================================================
  // ABRIR MODAL DE RECEPCIÓN
  // =========================================================

  async function openReceiveModal(
    purchase: Purchase
  ) {
    setReceiveModal({
      purchaseId: purchase.id,
      purchase,
    });

    setInventoryMode("global");
    setSelectedBranchId("");
    setSelectedWarehouseId("");
    setSelectedLocationId("");
    setLocations([]);

    await loadInventoryMode(
      purchase.id
    );
  }

  function closeReceiveModal() {
    if (receivingPurchaseId) {
      return;
    }

    setReceiveModal(null);
    setInventoryMode("global");
    setSelectedBranchId("");
    setSelectedWarehouseId("");
    setSelectedLocationId("");
    setLocations([]);
  }

  // =========================================================
  // CAMBIAR ALMACÉN
  // =========================================================

  async function handleWarehouseChange(
    warehouseId: string
  ) {
    setSelectedWarehouseId(
      warehouseId
    );
    setSelectedLocationId("");

    if (!warehouseId) {
      setLocations([]);
      return;
    }

    await loadLocations(
      warehouseId
    );
  }

  // =========================================================
  // CONFIRMAR RECEPCIÓN
  // =========================================================

  async function confirmReceivePurchase() {
    if (!receiveModal) {
      return;
    }

    if (loadingInventoryMode) {
      alert(
        "Espera a que se cargue la modalidad de inventario."
      );
      return;
    }

    if (
      inventoryMode === "branch" &&
      !selectedBranchId
    ) {
      alert(
        "Selecciona la sucursal donde se recibirá la mercancía."
      );
      return;
    }

    if (
      inventoryMode === "warehouse" &&
      !selectedWarehouseId
    ) {
      alert(
        "Selecciona el almacén donde se recibirá la mercancía."
      );
      return;
    }

    if (
      inventoryMode === "location" &&
      !selectedWarehouseId
    ) {
      alert(
        "Selecciona el almacén donde se recibirá la mercancía."
      );
      return;
    }

    if (
      inventoryMode === "location" &&
      !selectedLocationId
    ) {
      alert(
        "Selecciona la ubicación donde se recibirá la mercancía."
      );
      return;
    }

    let confirmationMessage =
      "¿Confirmas que esta mercancía fue recibida?";

    if (
      inventoryMode === "global"
    ) {
      confirmationMessage =
        "¿Confirmas que esta mercancía fue recibida?\n\nSe actualizará el stock global y se registrará un movimiento de entrada.";
    }

    if (
      inventoryMode === "branch"
    ) {
      confirmationMessage =
        "¿Confirmas que esta mercancía fue recibida en la sucursal seleccionada?\n\nSe actualizará el stock global y también el stock de la sucursal.";
    }

    if (
      inventoryMode === "warehouse"
    ) {
      confirmationMessage =
        "¿Confirmas que esta mercancía fue recibida en el almacén seleccionado?\n\nSe actualizará el stock global y también el stock del almacén.";
    }

    if (
      inventoryMode === "location"
    ) {
      confirmationMessage =
        "¿Confirmas que esta mercancía fue recibida en la ubicación seleccionada?\n\nSe actualizará el stock global y también el stock de la ubicación física.";
    }

    const confirmed =
      window.confirm(
        confirmationMessage
      );

    if (!confirmed) {
      return;
    }

    try {
      setReceivingPurchaseId(
        receiveModal.purchaseId
      );

      const body: {
        branch_id?: string;
        warehouse_id?: string;
        location_id?: string;
      } = {};

      if (
        inventoryMode === "branch"
      ) {
        body.branch_id =
          selectedBranchId;
      }

      if (
        inventoryMode === "warehouse"
      ) {
        body.warehouse_id =
          selectedWarehouseId;
      }

      if (
        inventoryMode === "location"
      ) {
        body.warehouse_id =
          selectedWarehouseId;

        body.location_id =
          selectedLocationId;
      }

      const response = await fetch(
        `/api/purchases/${receiveModal.purchaseId}/receive`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            body
          ),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo registrar la recepción."
        );
      }

      if (
        inventoryMode === "global"
      ) {
        alert(
          "Compra recibida correctamente. El stock global fue actualizado."
        );
      }

      if (
        inventoryMode === "branch"
      ) {
        alert(
          "Compra recibida correctamente. El stock global y el stock de la sucursal fueron actualizados."
        );
      }

      if (
        inventoryMode === "warehouse"
      ) {
        alert(
          "Compra recibida correctamente. El stock global y el stock del almacén fueron actualizados."
        );
      }

      if (
        inventoryMode === "location"
      ) {
        alert(
          "Compra recibida correctamente. El stock global y el stock de la ubicación fueron actualizados."
        );
      }

      setReceiveModal(null);
      setInventoryMode("global");
      setSelectedBranchId("");
      setSelectedWarehouseId("");
      setSelectedLocationId("");
      setLocations([]);

      await loadData();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la recepción."
      );
    } finally {
      setReceivingPurchaseId(
        null
      );
    }
  }

  // =========================================================
  // UTILIDADES
  // =========================================================

  const formTotal = useMemo(() => {
    return items.reduce(
      (total, item) =>
        total +
        item.quantity * item.unit_cost,
      0
    );
  }, [items]);

  function formatDate(date: string) {
    return new Date(
      date
    ).toLocaleDateString("es-CO");
  }

  function formatCurrency(
    value: number
  ) {
    return new Intl.NumberFormat(
      "es-CO",
      {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }
    ).format(value);
  }

  function getPurchaseTotal(
    purchase: Purchase
  ) {
    if (
      typeof purchase.total === "number"
    ) {
      return purchase.total;
    }

    return (
      purchase.purchase_items ?? []
    ).reduce(
      (total, item) =>
        total +
        item.quantity * item.unit_cost,
      0
    );
  }

  function getStatusLabel(
    status: string
  ) {
    const normalized =
      status.toLowerCase();

    if (
      normalized === "recibida" ||
      normalized === "received" ||
      normalized === "completed"
    ) {
      return "Recibida";
    }

    if (
      normalized === "pendiente" ||
      normalized === "pending"
    ) {
      return "Pendiente";
    }

    return status;
  }

  const selectedBranch =
    branches.find(
      (branch) =>
        branch.id ===
        selectedBranchId
    );

  const selectedWarehouse =
    warehouses.find(
      (warehouse) =>
        warehouse.id ===
        selectedWarehouseId
    );

  const selectedLocation =
    locations.find(
      (location) =>
        location.id ===
        selectedLocationId
    );

  // =========================================================
  // TEXTOS DE MODAL
  // =========================================================

  function getInventoryModeTitle() {
    switch (inventoryMode) {
      case "global":
        return "Stock global";

      case "branch":
        return "Stock por sucursal";

      case "warehouse":
        return "Stock por almacén";

      case "location":
        return "Stock por ubicación";

      default:
        return "Inventario";
    }
  }

  function getInventoryModeDescription() {
    switch (inventoryMode) {
      case "global":
        return "La mercancía se recibirá directamente en el inventario general del producto.";

      case "branch":
        return "La mercancía se registrará en una sucursal específica.";

      case "warehouse":
        return "La mercancía se registrará en un almacén específico.";

      case "location":
        return "La mercancía se registrará en una ubicación física específica.";

      default:
        return "";
    }
  }

  // =========================================================
  // ANULAR COMPRA
  // =========================================================

  function openCancelModal(purchase: Purchase) {
    setCancelPurchase(purchase);
    setCancelReason("");
  }

  function closeCancelModal() {
    if (cancelling) {
      return;
    }

    setCancelPurchase(null);
    setCancelReason("");
  }

  async function handleCancelPurchase() {
    if (!cancelPurchase) {
      return;
    }

    const reason = cancelReason.trim();

    if (!reason) {
      alert("El motivo de la anulación es obligatorio.");
      return;
    }

    if (
      !window.confirm(
        `¿Anular la compra ${
          cancelPurchase.document_number || cancelPurchase.id
        }? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setCancelling(true);

    try {
      const response = await fetch(
        `/api/purchases/${cancelPurchase.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo anular la compra."
        );
      }

      setCancelPurchase(null);
      setCancelReason("");

      await loadData();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "No se pudo anular la compra."
      );
    } finally {
      setCancelling(false);
    }
  }

  // =========================================================
  // UI
  // =========================================================

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
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2">
              <Link
                href="/inventario/entradas"
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                ← Volver a Entradas
              </Link>
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              🛒 Compras
            </h1>

            <p className="mt-2 text-slate-600">
              Registra las compras realizadas a tus proveedores.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/inventario/entradas/recepciones"
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
            >
              📦 Recepciones
            </Link>

            <button
              type="button"
              onClick={() =>
                setShowForm(true)
              }
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              + Nueva compra
            </button>
          </div>
        </div>

        {/* AVISO */}
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <div className="text-xl">
              ℹ️
            </div>

            <div>
              <h2 className="font-semibold text-blue-900">
                Importante
              </h2>

              <p className="mt-1 text-sm leading-6 text-blue-800">
                Registrar una compra no modifica el stock. El inventario aumentará cuando registres la recepción de la mercancía. La recepción respetará la modalidad de inventario configurada para tu tienda.
              </p>
            </div>
          </div>
        </div>

        {/* TABLA */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Fecha
                  </th>

                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Documento
                  </th>

                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Proveedor
                  </th>

                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Productos
                  </th>

                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Total
                  </th>

                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Estado
                  </th>

                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700">
                    Acción
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-slate-500"
                    >
                      Cargando compras...
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center"
                    >
                      <div className="text-4xl">
                        🛒
                      </div>

                      <p className="mt-3 font-semibold text-slate-800">
                        No hay compras registradas
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Registra tu primera compra para comenzar.
                      </p>
                    </td>
                  </tr>
                ) : (
                  purchases.map(
                    (purchase) => {
                      const status =
                        getStatusLabel(
                          purchase.status
                        );

                      const normalizedStatus =
                        status.toLowerCase();

                      const isReceived =
                        normalizedStatus ===
                        "recibida";

                      const isCancelled =
                        normalizedStatus ===
                        "cancelada";

                      const productCount =
                        purchase
                          .purchase_items
                          ?.length ?? 0;

                      return (
                        <tr
                          key={purchase.id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            {formatDate(
                              purchase.created_at
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                            {purchase.document_number ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {purchase
                              .suppliers?.name ||
                              "Sin proveedor"}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {productCount}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-900">
                            {formatCurrency(
                              getPurchaseTotal(
                                purchase
                              )
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {isReceived ? (
                              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                Recibida
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                                Cancelada
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                Pendiente
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {isReceived ? (
                              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                                ✓ Recibida
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                                ✕ Anulada
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
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
                                  className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {receivingPurchaseId ===
                                  purchase.id
                                    ? "Recibiendo..."
                                    : "📦 Recibir compra"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openCancelModal(
                                      purchase
                                    )
                                  }
                                  disabled={
                                    receivingPurchaseId ===
                                    purchase.id
                                  }
                                  className="inline-flex items-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  ✕ Anular
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )
                )}
              </tbody>
            </table>
          </div>

          {!loading && purchases.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <p className="text-sm text-slate-500">
                Página{" "}
                {Math.floor(
                  purchasesOffset / PURCHASES_PAGE_SIZE
                ) + 1}{" "}
                de{" "}
                {Math.max(
                  1,
                  Math.ceil(
                    purchasesTotal / PURCHASES_PAGE_SIZE
                  )
                )}{" "}
                · {purchasesTotal} compras en total
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={purchasesOffset === 0}
                  onClick={() =>
                    loadData(
                      Math.max(
                        0,
                        purchasesOffset -
                          PURCHASES_PAGE_SIZE
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
                    purchasesOffset +
                      PURCHASES_PAGE_SIZE >=
                    purchasesTotal
                  }
                  onClick={() =>
                    loadData(
                      purchasesOffset +
                        PURCHASES_PAGE_SIZE
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
      </div>

      {/* =====================================================
          MODAL NUEVA COMPRA
          ===================================================== */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Nueva compra
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Registra los productos comprados al proveedor.
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6 p-6">
              {/* DATOS DE COMPRA */}
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Proveedor
                  </label>

                  <select
                    value={supplierId}
                    onChange={(event) =>
                      setSupplierId(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">
                      Selecciona un proveedor
                    </option>

                    {suppliers.map(
                      (supplier) => (
                        <option
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Número de documento
                  </label>

                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(event) =>
                      setDocumentNumber(
                        event.target.value
                      )
                    }
                    placeholder="Factura, remisión, etc."
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              {/* AGREGAR PRODUCTO */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="mb-4 font-semibold text-slate-900">
                  Agregar producto
                </h3>

                <div className="grid gap-4 md:grid-cols-[1fr_140px_160px_auto]">
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-600">
                      Producto
                    </label>

                    <select
                      value={selectedProductId}
                      onChange={(event) => {
                        const productId =
                          event.target.value;

                        setSelectedProductId(
                          productId
                        );

                        const product =
                          products.find(
                            (item) =>
                              item.id ===
                              productId
                          );

                        if (product) {
                          setUnitCost(
                            Number(
                              product.purchase_price ??
                                0
                            )
                          );
                        } else {
                          setUnitCost(0);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="">
                        Selecciona un producto
                      </option>

                      {products.map(
                        (product) => (
                          <option
                            key={product.id}
                            value={product.id}
                          >
                            {product.name}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-600">
                      Cantidad
                    </label>

                    <input
                      type="number"
                      onWheel={(event) => event.currentTarget.blur()}
                      min="1"
                      step="1"
                      value={quantityInput}
                      onChange={(event) =>
                        setQuantityInput(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-600">
                      Costo unitario
                    </label>

                    <input
                      type="number"
                      onWheel={(event) => event.currentTarget.blur()}
                      min="0"
                      value={unitCost}
                      onChange={(event) =>
                        setUnitCost(
                          Math.max(
                            0,
                            Number(
                              event.target.value
                            ) || 0
                          )
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={addItem}
                      className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* PRODUCTOS */}
              <div>
                <h3 className="mb-3 font-semibold text-slate-900">
                  Productos de la compra
                </h3>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    Todavía no has agregado productos.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                            Producto
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                            Cantidad
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                            Costo
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                            Subtotal
                          </th>

                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {items.map(
                          (item) => (
                            <tr
                              key={
                                item.product_id
                              }
                            >
                              <td className="px-4 py-3 text-sm font-medium text-slate-800">
                                {item.product
                                  ?.name ||
                                  "Producto"}
                              </td>

                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                {item.quantity}
                              </td>

                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                {formatCurrency(
                                  item.unit_cost
                                )}
                              </td>

                              <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                {formatCurrency(
                                  item.quantity *
                                    item.unit_cost
                                )}
                              </td>

                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeItem(
                                      item.product_id
                                    )
                                  }
                                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>

                      <tfoot className="border-t border-slate-200 bg-slate-50">
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-4 text-right font-semibold text-slate-700"
                          >
                            Total
                          </td>

                          <td className="px-4 py-4 text-right text-lg font-bold text-slate-900">
                            {formatCurrency(
                              formTotal
                            )}
                          </td>

                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={savePurchase}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Guardando..."
                  : "Guardar compra"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAL RECIBIR COMPRA
          ===================================================== */}

      {receiveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* HEADER */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  📦 Recibir compra
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {receiveModal.purchase
                    ?.document_number
                    ? `Documento: ${receiveModal.purchase.document_number}`
                    : "Confirma dónde se recibirá la mercancía."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReceiveModal}
                disabled={
                  receivingPurchaseId !==
                  null
                }
                className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* CONTENIDO CON SCROLL */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-6 p-6">
              {/* MODALIDAD */}
              <div>
                <h3 className="mb-3 font-semibold text-slate-900">
                  Modalidad de inventario
                </h3>

                {loadingInventoryMode ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />

                      <div>
                        <p className="font-semibold text-slate-800">
                          Cargando configuración...
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Estamos consultando cómo administra el inventario tu tienda.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl border-2 p-5 ${
                      inventoryMode ===
                      "global"
                        ? "border-slate-300 bg-slate-50"
                        : "border-blue-300 bg-blue-50"
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="text-2xl">
                        {inventoryMode ===
                        "global"
                          ? "📦"
                          : inventoryMode ===
                            "branch"
                          ? "🏢"
                          : inventoryMode ===
                            "warehouse"
                          ? "🏭"
                          : "📍"}
                      </div>

                      <div>
                        <p className="font-semibold text-slate-900">
                          {getInventoryModeTitle()}
                        </p>

                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          {getInventoryModeDescription()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* GLOBAL */}
              {!loadingInventoryMode &&
                inventoryMode ===
                  "global" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex gap-3">
                      <div className="text-xl">
                        ℹ️
                      </div>

                      <div>
                        <p className="font-semibold text-slate-800">
                          Recepción global
                        </p>

                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          La mercancía se agregará al stock global de cada producto. No necesitas seleccionar sucursal, almacén ni ubicación.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              {/* SUCURSAL */}
              {!loadingInventoryMode &&
                inventoryMode ===
                  "branch" && (
                  <div className="space-y-5 rounded-xl border border-blue-200 bg-blue-50 p-5">
                    <div>
                      <h3 className="font-semibold text-blue-900">
                        🏢 Sucursal de recepción
                      </h3>

                      <p className="mt-1 text-sm text-blue-700">
                        Selecciona la sucursal donde quedará registrada la mercancía.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Sucursal
                      </label>

                      <select
                        value={
                          selectedBranchId
                        }
                        onChange={(
                          event
                        ) =>
                          setSelectedBranchId(
                            event.target
                              .value
                          )
                        }
                        disabled={
                          receivingPurchaseId !==
                          null
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">
                          Selecciona una sucursal
                        </option>

                        {branches.map(
                          (branch) => (
                            <option
                              key={
                                branch.id
                              }
                              value={
                                branch.id
                              }
                            >
                              {branch.name} (
                              {
                                branch.code
                              }
                              )
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {selectedBranchId && (
                      <div className="rounded-lg border border-blue-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Recepción
                        </p>

                        <p className="mt-2 font-semibold text-slate-900">
                          {
                            selectedBranch?.name
                          }
                        </p>

                        <p className="text-xs text-slate-500">
                          Código:{" "}
                          {
                            selectedBranch?.code
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )}

              {/* ALMACÉN */}
              {!loadingInventoryMode &&
                inventoryMode ===
                  "warehouse" && (
                  <div className="space-y-5 rounded-xl border border-blue-200 bg-blue-50 p-5">
                    <div>
                      <h3 className="font-semibold text-blue-900">
                        🏭 Almacén de recepción
                      </h3>

                      <p className="mt-1 text-sm text-blue-700">
                        Selecciona el almacén donde quedará registrada la mercancía.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Almacén
                      </label>

                      <select
                        value={
                          selectedWarehouseId
                        }
                        onChange={(
                          event
                        ) =>
                          handleWarehouseChange(
                            event.target
                              .value
                          )
                        }
                        disabled={
                          receivingPurchaseId !==
                          null
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">
                          Selecciona un almacén
                        </option>

                        {warehouses.map(
                          (warehouse) => (
                            <option
                              key={
                                warehouse.id
                              }
                              value={
                                warehouse.id
                              }
                            >
                              {
                                warehouse.name
                              }{" "}
                              (
                              {
                                warehouse.code
                              }
                              )
                              {
                                warehouse
                                  .branch
                                  ?.name
                                  ? ` — ${warehouse.branch.name}`
                                  : ""
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {selectedWarehouseId && (
                      <div className="rounded-lg border border-blue-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Recepción
                        </p>

                        <p className="mt-2 font-semibold text-slate-900">
                          {
                            selectedWarehouse?.name
                          }
                        </p>

                        <p className="text-xs text-slate-500">
                          Código:{" "}
                          {
                            selectedWarehouse?.code
                          }
                        </p>

                        {selectedWarehouse
                          ?.branch
                          ?.name && (
                          <p className="mt-1 text-xs text-slate-500">
                            Sucursal:{" "}
                            {
                              selectedWarehouse
                                .branch
                                .name
                            }
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

              {/* UBICACIÓN */}
              {!loadingInventoryMode &&
                inventoryMode ===
                  "location" && (
                  <div className="space-y-5 rounded-xl border border-blue-200 bg-blue-50 p-5">
                    <div>
                      <h3 className="font-semibold text-blue-900">
                        📍 Ubicación de recepción
                      </h3>

                      <p className="mt-1 text-sm text-blue-700">
                        Selecciona el almacén y la ubicación física donde quedará la mercancía.
                      </p>
                    </div>

                    {/* ALMACÉN */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Almacén
                      </label>

                      <select
                        value={
                          selectedWarehouseId
                        }
                        onChange={(
                          event
                        ) =>
                          handleWarehouseChange(
                            event.target
                              .value
                          )
                        }
                        disabled={
                          receivingPurchaseId !==
                          null
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">
                          Selecciona un almacén
                        </option>

                        {warehouses.map(
                          (warehouse) => (
                            <option
                              key={
                                warehouse.id
                              }
                              value={
                                warehouse.id
                              }
                            >
                              {
                                warehouse.name
                              }{" "}
                              (
                              {
                                warehouse.code
                              }
                              )
                              {
                                warehouse
                                  .branch
                                  ?.name
                                  ? ` — ${warehouse.branch.name}`
                                  : ""
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* UBICACIÓN */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Ubicación
                      </label>

                      <select
                        value={
                          selectedLocationId
                        }
                        onChange={(
                          event
                        ) =>
                          setSelectedLocationId(
                            event.target
                              .value
                          )
                        }
                        disabled={
                          !selectedWarehouseId ||
                          loadingLocations ||
                          receivingPurchaseId !==
                            null
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">
                          {!selectedWarehouseId
                            ? "Primero selecciona un almacén"
                            : loadingLocations
                            ? "Cargando ubicaciones..."
                            : locations.length ===
                              0
                            ? "No hay ubicaciones activas"
                            : "Selecciona una ubicación"}
                        </option>

                        {locations.map(
                          (location) => (
                            <option
                              key={
                                location.id
                              }
                              value={
                                location.id
                              }
                            >
                              {
                                location.name
                              }{" "}
                              (
                              {
                                location.code
                              }
                              )
                              {
                                location
                                  .location_type
                                  ? ` — ${location.location_type}`
                                  : ""
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* RESUMEN */}
                    {selectedWarehouseId &&
                      selectedLocationId && (
                        <div className="rounded-lg border border-blue-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Recepción
                          </p>

                          <p className="mt-2 font-semibold text-slate-900">
                            {
                              selectedWarehouse?.name
                            }
                          </p>

                          <p className="text-sm text-slate-600">
                            {
                              selectedLocation?.name
                            }
                          </p>

                          <p className="text-xs text-slate-500">
                            Almacén:{" "}
                            {
                              selectedWarehouse?.code
                            }
                          </p>

                          <p className="text-xs text-slate-500">
                            Ubicación:{" "}
                            {
                              selectedLocation?.code
                            }
                          </p>

                          {selectedWarehouse
                            ?.branch
                            ?.name && (
                            <p className="mt-1 text-xs text-slate-500">
                              Sucursal:{" "}
                              {
                                selectedWarehouse
                                  .branch
                                  .name
                              }
                            </p>
                          )}
                        </div>
                      )}
                  </div>
                )}

              {/* AVISO */}
              {!loadingInventoryMode && (
                <div
                  className={`rounded-xl border p-4 ${
                    inventoryMode ===
                    "global"
                      ? "border-slate-200 bg-slate-50"
                      : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="text-xl">
                      {inventoryMode ===
                      "global"
                        ? "ℹ️"
                        : inventoryMode ===
                          "branch"
                        ? "🏢"
                        : inventoryMode ===
                          "warehouse"
                        ? "🏭"
                        : "📍"}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {getInventoryModeTitle()}
                      </p>

                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {inventoryMode ===
                        "global"
                          ? "Solo se actualizará el stock global del producto."
                          : inventoryMode ===
                            "branch"
                          ? "El stock global y el stock de la sucursal se actualizarán dentro de la misma operación."
                          : inventoryMode ===
                            "warehouse"
                          ? "El stock global y el stock del almacén se actualizarán dentro de la misma operación."
                          : "El stock global y el stock de la ubicación se actualizarán dentro de la misma operación."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER FIJO */}
            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeReceiveModal}
                disabled={
                  receivingPurchaseId !==
                    null ||
                  loadingInventoryMode
                }
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={
                  confirmReceivePurchase
                }
                disabled={
                  receivingPurchaseId !==
                    null ||
                  loadingInventoryMode ||
                  (inventoryMode ===
                    "branch" &&
                    !selectedBranchId) ||
                  (inventoryMode ===
                    "warehouse" &&
                    !selectedWarehouseId) ||
                  (inventoryMode ===
                    "location" &&
                    (!selectedWarehouseId ||
                      !selectedLocationId))
                }
                className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {receivingPurchaseId
                  ? "Recibiendo..."
                  : "✓ Confirmar recepción"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAL ANULAR COMPRA
          ===================================================== */}

      {cancelPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">
              Anular compra
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {cancelPurchase.document_number ||
                cancelPurchase.id}{" "}
              — esta acción no se puede deshacer.
            </p>

            <label className="mb-2 mt-4 block text-sm font-semibold text-slate-700">
              Motivo de la anulación
            </label>

            <textarea
              value={cancelReason}
              onChange={(event) =>
                setCancelReason(event.target.value)
              }
              rows={3}
              placeholder="Por ejemplo: el proveedor no tenía el producto disponible."
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={cancelling}
                className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Volver
              </button>

              <button
                type="button"
                onClick={() => void handleCancelPurchase()}
                disabled={
                  cancelling || !cancelReason.trim()
                }
                className="rounded-lg bg-rose-600 px-4 py-2.5 font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling
                  ? "Anulando..."
                  : "✕ Anular compra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}