"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
};

type Warehouse = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type Location = {
  id: string;
  warehouse_id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type StockRow = {
  id: string;
  product_id: string;
  producto: string;
  sku: string | null;
  warehouse_id: string;
  almacen: string;
  location_id: string;
  ubicacion: string;
  quantity: number;
};

type NamedRef = {
  id: string;
  name: string;
  code: string;
} | null;

type Transfer = {
  id: string;
  quantity: number;
  reason: string | null;
  created_at: string;
  products: {
    name: string;
    sku: string | null;
  } | null;
  from_warehouses: NamedRef;
  from_locations: NamedRef;
  to_warehouses: NamedRef;
  to_locations: NamedRef;
};

const TRANSFERS_PAGE_SIZE = 20;

/*
 * No todos los traslados tienen almacén y ubicación resueltos (por
 * ejemplo, si el almacén o la ubicación fueron borrados). Antes se
 * mostraba siempre "almacén / ubicación", y con cualquiera de los dos
 * vacío quedaba "Almacén / " o " / Ubicación" colgando.
 */
function formatTransferScope(
  warehouse: NamedRef,
  location: NamedRef
) {
  if (warehouse?.name && location?.name) {
    return `${warehouse.name} / ${location.name}`;
  }

  return warehouse?.name || location?.name || "—";
}

export default function TrasladosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const [productId, setProductId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] =
    useState("");
  const [fromLocationId, setFromLocationId] =
    useState("");
  const [toWarehouseId, setToWarehouseId] =
    useState("");
  const [toLocationId, setToLocationId] =
    useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  /*
   * =====================================================
   * HISTORIAL DE TRASLADOS
   * =====================================================
   */

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [transfersTotal, setTransfersTotal] = useState(0);
  const [transfersOffset, setTransfersOffset] = useState(0);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [transfersError, setTransfersError] = useState("");

  async function loadTransfers(nextOffset: number) {
    try {
      setLoadingTransfers(true);
      setTransfersError("");

      const response = await fetch(
        `/api/inventory/transfers?limit=${TRANSFERS_PAGE_SIZE}&offset=${nextOffset}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo cargar el historial de traslados."
        );
      }

      setTransfers(result.transfers || []);
      setTransfersTotal(
        typeof result.total === "number" ? result.total : 0
      );
      setTransfersOffset(nextOffset);
    } catch (error) {
      console.error(error);

      setTransfersError(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el historial de traslados."
      );
    } finally {
      setLoadingTransfers(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTransfers(0);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /*
   * =====================================================
   * CARGAR DATOS
   * =====================================================
   */

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [
        productsResponse,
        warehousesResponse,
        stockResponse,
      ] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/inventory/warehouses"),
        fetch("/api/inventory/stock"),
      ]);

      const [
        productsResult,
        warehousesResult,
        stockResult,
      ] = await Promise.all([
        productsResponse.json(),
        warehousesResponse.json(),
        stockResponse.json(),
      ]);

      if (!productsResponse.ok) {
        throw new Error(
          productsResult.error ||
            "No se pudieron cargar los productos."
        );
      }

      if (!warehousesResponse.ok) {
        throw new Error(
          warehousesResult.error ||
            "No se pudieron cargar los almacenes."
        );
      }

      if (!stockResponse.ok) {
        throw new Error(
          stockResult.error ||
            "No se pudo cargar el stock."
        );
      }

      setProducts(
        (productsResult.products || []).filter(
          (product: Product) =>
            product.stock >= 0
        )
      );

      const activeWarehouses: Warehouse[] = (
        warehousesResult.warehouses || []
      ).filter(
        (warehouse: Warehouse) =>
          warehouse.is_active
      );

      setWarehouses(activeWarehouses);

      // La API de ubicaciones exige warehouse_id,
      // así que las pedimos por cada almacén activo.
      const locationsByWarehouse = await Promise.all(
        activeWarehouses.map(async (warehouse) => {
          const response = await fetch(
            `/api/inventory/locations?warehouse_id=${encodeURIComponent(warehouse.id)}`
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
                "No se pudieron cargar las ubicaciones."
            );
          }

          return (result.locations || []) as Location[];
        })
      );

      setLocations(
        locationsByWarehouse
          .flat()
          .filter((location) => location.is_active)
      );

      setStock(stockResult.stock || []);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la información."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  /*
   * =====================================================
   * PRODUCTOS CON STOCK LOCALIZADO
   * =====================================================
   */

  const productsWithLocationStock = useMemo(() => {
    const map = new Map<string, Product>();

    for (const product of products) {
      map.set(product.id, product);
    }

    return products.filter((product) =>
      stock.some(
        (row) =>
          row.product_id === product.id &&
          row.quantity > 0
      )
    );
  }, [products, stock]);

  /*
   * =====================================================
   * BUSCAR PRODUCTOS
   * =====================================================
   */

  const filteredProducts = useMemo(() => {
    const text = search.toLowerCase().trim();

    if (!text) {
      return productsWithLocationStock;
    }

    return productsWithLocationStock.filter(
      (product) =>
        product.name
          ?.toLowerCase()
          .includes(text) ||
        product.sku
          ?.toLowerCase()
          .includes(text)
    );
  }, [
    productsWithLocationStock,
    search,
  ]);

  /*
   * =====================================================
   * UBICACIONES DE ORIGEN
   * =====================================================
   */

  const fromLocations = useMemo(() => {
    if (!fromWarehouseId) {
      return [];
    }

    return locations.filter(
      (location) =>
        location.warehouse_id ===
        fromWarehouseId
    );
  }, [
    locations,
    fromWarehouseId,
  ]);

  /*
   * =====================================================
   * UBICACIONES DE DESTINO
   * =====================================================
   */

  const toLocations = useMemo(() => {
    if (!toWarehouseId) {
      return [];
    }

    return locations.filter(
      (location) =>
        location.warehouse_id ===
        toWarehouseId
    );
  }, [
    locations,
    toWarehouseId,
  ]);

  /*
   * =====================================================
   * STOCK DISPONIBLE
   * =====================================================
   */

  const availableStock = useMemo(() => {
    if (
      !productId ||
      !fromWarehouseId ||
      !fromLocationId
    ) {
      return 0;
    }

    const row = stock.find(
      (item) =>
        item.product_id === productId &&
        item.warehouse_id ===
          fromWarehouseId &&
        item.location_id ===
          fromLocationId
    );

    return row?.quantity || 0;
  }, [
    stock,
    productId,
    fromWarehouseId,
    fromLocationId,
  ]);

  /*
   * =====================================================
   * PRODUCTO SELECCIONADO
   * =====================================================
   */

  const selectedProduct = useMemo(() => {
    return products.find(
      (product) =>
        product.id === productId
    );
  }, [products, productId]);

  /*
   * =====================================================
   * CAMBIAR PRODUCTO
   * =====================================================
   */

  function handleProductChange(
    value: string
  ) {
    setProductId(value);

    setFromWarehouseId("");
    setFromLocationId("");
    setToWarehouseId("");
    setToLocationId("");
    setQuantity("");
    setMessage("");
  }

  /*
   * =====================================================
   * CAMBIAR ALMACÉN ORIGEN
   * =====================================================
   */

  function handleFromWarehouseChange(
    value: string
  ) {
    setFromWarehouseId(value);
    setFromLocationId("");
    setQuantity("");
    setMessage("");
  }

  /*
   * =====================================================
   * CAMBIAR UBICACIÓN ORIGEN
   * =====================================================
   */

  function handleFromLocationChange(
    value: string
  ) {
    setFromLocationId(value);
    setQuantity("");
    setMessage("");
  }

  /*
   * =====================================================
   * CAMBIAR ALMACÉN DESTINO
   * =====================================================
   */

  function handleToWarehouseChange(
    value: string
  ) {
    setToWarehouseId(value);
    setToLocationId("");
    setMessage("");
  }

  /*
   * =====================================================
   * LIMPIAR FORMULARIO
   * =====================================================
   */

  function resetForm() {
    setProductId("");
    setFromWarehouseId("");
    setFromLocationId("");
    setToWarehouseId("");
    setToLocationId("");
    setQuantity("");
    setReason("");
    setMessage("");
  }

  /*
   * =====================================================
   * EJECUTAR TRASLADO
   * =====================================================
   */

  async function handleTransfer() {
    setMessage("");

    if (!productId) {
      setMessage(
        "Debes seleccionar un producto."
      );
      return;
    }

    if (!fromWarehouseId) {
      setMessage(
        "Debes seleccionar el almacén de origen."
      );
      return;
    }

    if (!fromLocationId) {
      setMessage(
        "Debes seleccionar la ubicación de origen."
      );
      return;
    }

    if (!toWarehouseId) {
      setMessage(
        "Debes seleccionar el almacén de destino."
      );
      return;
    }

    if (!toLocationId) {
      setMessage(
        "Debes seleccionar la ubicación de destino."
      );
      return;
    }

    if (
      fromWarehouseId === toWarehouseId &&
      fromLocationId === toLocationId
    ) {
      setMessage(
        "La ubicación de origen y destino deben ser diferentes."
      );
      return;
    }

    const numericQuantity =
      Number(quantity);

    if (
      !Number.isInteger(
        numericQuantity
      ) ||
      numericQuantity <= 0
    ) {
      setMessage(
        "La cantidad debe ser un número entero mayor que 0."
      );
      return;
    }

    if (
      numericQuantity >
      availableStock
    ) {
      setMessage(
        `Stock insuficiente. Disponible en la ubicación de origen: ${availableStock}.`
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/inventory/transfers",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            product_id: productId,
            from_warehouse_id:
              fromWarehouseId,
            from_location_id:
              fromLocationId,
            to_warehouse_id:
              toWarehouseId,
            to_location_id:
              toLocationId,
            quantity:
              numericQuantity,
            reason:
              reason.trim() ||
              null,
          }),
        }
      );

      const rawResponse =
        await response.text();

      let result: any = {};

      try {
        result = rawResponse
          ? JSON.parse(rawResponse)
          : {};
      } catch {
        throw new Error(
          rawResponse ||
            "El servidor devolvió una respuesta inválida."
        );
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.message ||
            "No se pudo realizar el traslado."
        );
      }

      setMessage(
        `Traslado realizado correctamente. Se trasladaron ${numericQuantity} unidades de ${selectedProduct?.name || "producto"}.`
      );

      await loadData();
      await loadTransfers(0);

      setQuantity("");
      setReason("");
      setFromLocationId("");
      setToLocationId("");
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo realizar el traslado."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * =====================================================
   * RESUMEN
   * =====================================================
   */

  const totalLocalizedUnits =
    stock.reduce(
      (total, row) =>
        total + Number(row.quantity || 0),
      0
    );

  const totalLocationsWithStock =
    stock.filter(
      (row) => row.quantity > 0
    ).length;

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-purple-600">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Traslados de inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Mueve productos entre almacenes y
              ubicaciones.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventario"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Inventario
            </Link>

            <Link
              href="/inventario/almacenes"
              className="inline-flex items-center justify-center rounded-lg border border-purple-300 bg-purple-50 px-5 py-3 font-medium text-purple-700 hover:bg-purple-100"
            >
              📦 Almacenes
            </Link>
          </div>
        </div>

        {/* TARJETAS */}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Productos disponibles
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {productsWithLocationStock.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Unidades localizadas
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {totalLocalizedUnits}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Ubicaciones con stock
            </p>

            <p className="mt-2 text-3xl font-bold text-purple-600">
              {totalLocationsWithStock}
            </p>
          </div>
        </div>

        {/* CONTENIDO */}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* PRODUCTOS */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                1. Seleccionar producto
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Selecciona el producto que deseas
                trasladar.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Buscar producto
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Nombre o SKU..."
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
            </div>

            <div className="mt-4 max-h-[500px] space-y-2 overflow-y-auto">
              {loading && (
                <div className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
                  Cargando productos...
                </div>
              )}

              {!loading &&
                filteredProducts.length ===
                  0 && (
                  <div className="rounded-lg bg-gray-50 p-6 text-center">
                    <p className="font-medium text-gray-700">
                      No hay productos con
                      stock localizado.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Primero asigna stock a una
                      ubicación.
                    </p>
                  </div>
                )}

              {!loading &&
                filteredProducts.map(
                  (product) => {
                    const selected =
                      product.id ===
                      productId;

                    const productStock =
                      stock
                        .filter(
                          (row) =>
                            row.product_id ===
                            product.id
                        )
                        .reduce(
                          (
                            total,
                            row
                          ) =>
                            total +
                            Number(
                              row.quantity ||
                                0
                            ),
                          0
                        );

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() =>
                          handleProductChange(
                            product.id
                          )
                        }
                        className={`w-full rounded-xl border p-4 text-left transition ${
                          selected
                            ? "border-purple-500 bg-purple-50 ring-2 ring-purple-100"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {product.name}
                            </p>

                            <p className="mt-1 text-sm text-gray-500">
                              SKU:{" "}
                              {product.sku ||
                                "—"}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-lg font-bold text-gray-900">
                              {productStock}
                            </p>

                            <p className="text-xs text-gray-500">
                              unidades
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}
            </div>
          </section>

          {/* FORMULARIO */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                2. Configurar traslado
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Define el origen, destino y cantidad.
              </p>
            </div>

            <div className="space-y-5">
              {/* PRODUCTO */}

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Producto
                </label>

                <select
                  value={productId}
                  onChange={(event) =>
                    handleProductChange(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3"
                >
                  <option value="">
                    Selecciona un producto
                  </option>

                  {productsWithLocationStock.map(
                    (product) => (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.name}
                        {product.sku
                          ? ` — ${product.sku}`
                          : ""}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* ORIGEN */}

              <div className="rounded-xl border border-red-100 bg-red-50 p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-red-700">
                    Origen
                  </p>

                  <p className="mt-1 text-xs text-red-600">
                    De dónde se retirará el
                    producto.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Almacén
                    </label>

                    <select
                      value={
                        fromWarehouseId
                      }
                      onChange={(event) =>
                        handleFromWarehouseChange(
                          event.target.value
                        )
                      }
                      disabled={!productId}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 disabled:bg-gray-100"
                    >
                      <option value="">
                        Selecciona almacén
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
                            {warehouse.name} —{" "}
                            {warehouse.code}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Ubicación
                    </label>

                    <select
                      value={
                        fromLocationId
                      }
                      onChange={(event) =>
                        handleFromLocationChange(
                          event.target.value
                        )
                      }
                      disabled={
                        !fromWarehouseId
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 disabled:bg-gray-100"
                    >
                      <option value="">
                        Selecciona ubicación
                      </option>

                      {fromLocations.map(
                        (location) => (
                          <option
                            key={
                              location.id
                            }
                            value={
                              location.id
                            }
                          >
                            {location.name} —{" "}
                            {location.code}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-white p-4">
                  <p className="text-sm text-gray-500">
                    Stock disponible en origen
                  </p>

                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {availableStock}{" "}
                    <span className="text-sm font-normal text-gray-500">
                      unidades
                    </span>
                  </p>
                </div>
              </div>

              {/* FLECHA */}

              <div className="flex justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-600">
                  ↓
                </div>
              </div>

              {/* DESTINO */}

              <div className="rounded-xl border border-green-100 bg-green-50 p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-green-700">
                    Destino
                  </p>

                  <p className="mt-1 text-xs text-green-600">
                    A dónde se enviará el producto.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Almacén
                    </label>

                    <select
                      value={
                        toWarehouseId
                      }
                      onChange={(event) =>
                        handleToWarehouseChange(
                          event.target.value
                        )
                      }
                      disabled={!productId}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 disabled:bg-gray-100"
                    >
                      <option value="">
                        Selecciona almacén
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
                            {warehouse.name} —{" "}
                            {warehouse.code}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Ubicación
                    </label>

                    <select
                      value={
                        toLocationId
                      }
                      onChange={(event) =>
                        setToLocationId(
                          event.target.value
                        )
                      }
                      disabled={
                        !toWarehouseId
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 disabled:bg-gray-100"
                    >
                      <option value="">
                        Selecciona ubicación
                      </option>

                      {toLocations.map(
                        (location) => (
                          <option
                            key={
                              location.id
                            }
                            value={
                              location.id
                            }
                          >
                            {location.name} —{" "}
                            {location.code}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* CANTIDAD */}

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Cantidad a trasladar
                </label>

                <input
                  type="number"
                  min="1"
                  max={
                    availableStock > 0
                      ? availableStock
                      : undefined
                  }
                  step="1"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      event.target.value
                    )
                  }
                  disabled={
                    !fromLocationId ||
                    availableStock <= 0
                  }
                  placeholder="Ej. 5"
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-lg font-semibold disabled:bg-gray-100"
                />

                {availableStock > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Máximo disponible:{" "}
                    {availableStock} unidades.
                  </p>
                )}
              </div>

              {/* MOTIVO */}

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Motivo
                </label>

                <input
                  type="text"
                  value={reason}
                  onChange={(event) =>
                    setReason(
                      event.target.value
                    )
                  }
                  placeholder="Ej. Reubicación de inventario"
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                />
              </div>

              {/* RESUMEN */}

              {productId &&
                fromLocationId &&
                toLocationId &&
                quantity && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
                    <p className="text-sm font-semibold text-purple-800">
                      Resumen del traslado
                    </p>

                    <div className="mt-3 space-y-2 text-sm text-purple-900">
                      <p>
                        <span className="font-medium">
                          Producto:
                        </span>{" "}
                        {selectedProduct?.name}
                      </p>

                      <p>
                        <span className="font-medium">
                          Cantidad:
                        </span>{" "}
                        {quantity} unidades
                      </p>

                      <p>
                        <span className="font-medium">
                          Stock origen:
                        </span>{" "}
                        {availableStock} →{" "}
                        {Math.max(
                          0,
                          availableStock -
                            Number(
                              quantity
                            )
                        )}
                      </p>
                    </div>
                  </div>
                )}

              {/* MENSAJE */}

              {message && (
                <div
                  className={`rounded-lg p-4 text-sm ${
                    message.includes(
                      "correctamente"
                    )
                      ? "border border-green-200 bg-green-50 text-green-700"
                      : "border border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {message}
                </div>
              )}

              {/* ACCIONES */}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Limpiar
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleTransfer()
                  }
                  disabled={
                    saving ||
                    !productId ||
                    !fromWarehouseId ||
                    !fromLocationId ||
                    !toWarehouseId ||
                    !toLocationId ||
                    !quantity
                  }
                  className="rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Trasladando..."
                    : "↔ Realizar traslado"}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ERROR GENERAL */}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-semibold">
              Error cargando traslados
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadData()
              }
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {/* HISTORIAL DE TRASLADOS */}

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900">
              Historial de traslados
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Consulta los traslados realizados entre
              almacenes y ubicaciones.
            </p>
          </div>

          {transfersError && (
            <div className="border-b border-red-200 bg-red-50 p-5 text-red-700">
              <p className="font-semibold">Error</p>

              <p className="mt-1 text-sm">
                {transfersError}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadTransfers(transfersOffset)
                }
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Reintentar
              </button>
            </div>
          )}

          {loadingTransfers ? (
            <div className="p-12 text-center text-sm text-gray-500">
              Cargando historial...
            </div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl">↔</div>

              <p className="mt-3 font-medium text-gray-700">
                No hay traslados registrados.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="border-b bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
                      <th className="px-5 py-4 font-medium">
                        Fecha
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Producto
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Origen
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Destino
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Cantidad
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Motivo
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {transfers.map((transfer) => (
                      <tr
                        key={transfer.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {new Date(
                            transfer.created_at
                          ).toLocaleString("es-CO", {
                            timeZone: "America/Bogota",
                          })}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">
                            {transfer.products?.name ||
                              "Producto desconocido"}
                          </p>

                          <p className="text-xs text-gray-500">
                            {transfer.products?.sku || "—"}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-700">
                          {formatTransferScope(
                            transfer.from_warehouses,
                            transfer.from_locations
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-700">
                          {formatTransferScope(
                            transfer.to_warehouses,
                            transfer.to_locations
                          )}
                        </td>

                        <td className="px-5 py-4 text-right font-semibold text-gray-900">
                          {transfer.quantity}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-700">
                          {transfer.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t px-5 py-4">
                <p className="text-sm text-gray-500">
                  Página{" "}
                  {Math.floor(
                    transfersOffset / TRANSFERS_PAGE_SIZE
                  ) + 1}{" "}
                  de{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      transfersTotal / TRANSFERS_PAGE_SIZE
                    )
                  )}{" "}
                  · {transfersTotal} traslados en total
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={transfersOffset === 0}
                    onClick={() =>
                      loadTransfers(
                        Math.max(
                          0,
                          transfersOffset -
                            TRANSFERS_PAGE_SIZE
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    disabled={
                      transfersOffset +
                        TRANSFERS_PAGE_SIZE >=
                      transfersTotal
                    }
                    onClick={() =>
                      loadTransfers(
                        transfersOffset +
                          TRANSFERS_PAGE_SIZE
                      )
                    }
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* INFORMACIÓN */}

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="font-semibold text-blue-900">
            ℹ️ ¿Cómo funciona?
          </p>

          <ul className="mt-2 space-y-1 text-sm text-blue-800">
            <li>
              • El traslado descuenta unidades de la
              ubicación de origen.
            </li>

            <li>
              • Las unidades se agregan a la ubicación
              de destino.
            </li>

            <li>
              • El stock global del producto no cambia.
            </li>

            <li>
              • El sistema registra el traslado de forma
              transaccional.
            </li>

            <li>
              • No puedes trasladar más unidades de las
              disponibles en el origen.
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}