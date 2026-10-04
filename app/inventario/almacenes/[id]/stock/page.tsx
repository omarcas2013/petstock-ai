"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Warehouse = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  is_active: boolean;
};

type Location = {
  id: string;
  warehouse_id: string;
  name: string;
  code: string;
  location_type:
    | "zona"
    | "pasillo"
    | "estanteria"
    | "ubicacion"
    | "recepcion"
    | "despacho"
    | "cuarentena";
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number | null;
  is_active: boolean;
};

type StockRow = {
  id: string;
  warehouse_id: string;
  location_id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  warehouses?: {
    id: string;
    name: string;
    code: string;
  } | null;
  locations?: {
    id: string;
    name: string;
    code: string;
    location_type: string;
  } | null;
  products?: Product | null;
};

type StockForm = {
  location_id: string;
  product_id: string;
  quantity: string;
};

type TransferForm = {
  product_id: string;
  from_warehouse_id: string;
  from_location_id: string;
  to_warehouse_id: string;
  to_location_id: string;
  quantity: string;
  reason: string;
};

const EMPTY_FORM: StockForm = {
  location_id: "",
  product_id: "",
  quantity: "0",
};

const EMPTY_TRANSFER_FORM: TransferForm = {
  product_id: "",
  from_warehouse_id: "",
  from_location_id: "",
  to_warehouse_id: "",
  to_location_id: "",
  quantity: "1",
  reason: "",
};

const LOCATION_TYPE_LABELS: Record<string, string> = {
  zona: "Zona",
  pasillo: "Pasillo",
  estanteria: "Estantería",
  ubicacion: "Ubicación",
  recepcion: "Recepción",
  despacho: "Despacho",
  cuarentena: "Cuarentena",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLocationTypeLabel(type: string) {
  return LOCATION_TYPE_LABELS[type] ?? type;
}

export default function WarehouseStockPage() {
  const params = useParams<{ id: string }>();

  const warehouseId = params.id;

  const [warehouse, setWarehouse] =
    useState<Warehouse | null>(null);

  const [warehouses, setWarehouses] =
    useState<Warehouse[]>([]);

  const [locations, setLocations] =
    useState<Location[]>([]);

  const [allLocations, setAllLocations] =
    useState<Location[]>([]);

  const [stock, setStock] =
    useState<StockRow[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transferSaving, setTransferSaving] =
    useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] =
    useState("");

  const [formOpen, setFormOpen] =
    useState(false);

  const [transferOpen, setTransferOpen] =
    useState(false);

  // Tanda 4: liberar unidades de una ubicación (pasan a "sin ubicar").
  const [releaseRow, setReleaseRow] =
    useState<StockRow | null>(null);
  const [releaseQuantity, setReleaseQuantity] =
    useState("");
  const [releaseSaving, setReleaseSaving] =
    useState(false);
  const [releaseError, setReleaseError] =
    useState("");

  const [form, setForm] =
    useState<StockForm>(EMPTY_FORM);

  const [transferForm, setTransferForm] =
    useState<TransferForm>(
      EMPTY_TRANSFER_FORM
    );

  const loadData = async () => {
    if (!warehouseId) {
      setLoading(false);
      setError("No se indicó el almacén.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [
        warehouseResponse,
        warehousesResponse,
        locationsResponse,
        stockResponse,
        productsResponse,
      ] = await Promise.all([
        fetch(
          `/api/inventory/warehouses/${warehouseId}`,
          {
            cache: "no-store",
          }
        ),
        fetch("/api/inventory/warehouses", {
          cache: "no-store",
        }),
        fetch(
          `/api/inventory/locations?warehouse_id=${warehouseId}`,
          {
            cache: "no-store",
          }
        ),
        fetch(
          `/api/inventory/stock?warehouse_id=${warehouseId}`,
          {
            cache: "no-store",
          }
        ),
        fetch("/api/products", {
          cache: "no-store",
        }),
      ]);

      const warehouseData =
        await warehouseResponse.json();

      const warehousesData =
        await warehousesResponse.json();

      const locationsData =
        await locationsResponse.json();

      const stockData =
        await stockResponse.json();

      const productsData =
        await productsResponse.json();

      if (!warehouseResponse.ok) {
        throw new Error(
          warehouseData.error ||
            "No se pudo cargar el almacén."
        );
      }

      if (!warehousesResponse.ok) {
        throw new Error(
          warehousesData.error ||
            "No se pudieron cargar los almacenes."
        );
      }

      if (!locationsResponse.ok) {
        throw new Error(
          locationsData.error ||
            "No se pudieron cargar las ubicaciones."
        );
      }

      if (!stockResponse.ok) {
        throw new Error(
          stockData.error ||
            "No se pudo cargar el inventario."
        );
      }

      if (!productsResponse.ok) {
        throw new Error(
          productsData.error ||
            "No se pudieron cargar los productos."
        );
      }

      const warehouseList: Warehouse[] =
        warehousesData.warehouses ?? [];

      const currentLocations: Location[] =
        locationsData.locations ?? [];

      setWarehouse(
        warehouseData.warehouse
      );

      setWarehouses(warehouseList);

      setLocations(currentLocations);

      setStock(
        stockData.stock ?? []
      );

      setProducts(
        productsData.products ?? []
      );

      /*
       * Cargamos las ubicaciones activas de todos
       * los almacenes para permitir traslados
       * entre almacenes.
       */
      const activeWarehouses =
        warehouseList.filter(
          (item) => item.is_active
        );

      const locationResponses =
        await Promise.all(
          activeWarehouses.map(
            async (item) => {
              const response = await fetch(
                `/api/inventory/locations?warehouse_id=${item.id}`,
                {
                  cache: "no-store",
                }
              );

              const data =
                await response.json();

              if (!response.ok) {
                throw new Error(
                  data.error ||
                    `No se pudieron cargar las ubicaciones de ${item.name}.`
                );
              }

              return data.locations ?? [];
            }
          )
        );

      const combinedLocations =
        locationResponses.flat();

      setAllLocations(
        combinedLocations.filter(
          (location: Location) =>
            location.is_active
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la información."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [warehouseId]);

  const activeLocations = useMemo(
    () =>
      locations.filter(
        (location) => location.is_active
      ),
    [locations]
  );

  const activeProducts = useMemo(
    () =>
      products.filter(
        (product) => product.is_active
      ),
    [products]
  );

  const activeWarehouses = useMemo(
    () =>
      warehouses.filter(
        (item) => item.is_active
      ),
    [warehouses]
  );

  const totalQuantity = useMemo(
    () =>
      stock.reduce(
        (total, row) =>
          total + Number(row.quantity || 0),
        0
      ),
    [stock]
  );

  const occupiedLocations = useMemo(() => {
    return new Set(
      stock
        .filter((row) => row.quantity > 0)
        .map((row) => row.location_id)
    ).size;
  }, [stock]);

  const filteredStock = useMemo(() => {
    const term = search.trim().toLowerCase();

    return stock.filter((row) => {
      const product = row.products;
      const location = row.locations;

      const matchesSearch =
        !term ||
        product?.name
          ?.toLowerCase()
          .includes(term) ||
        product?.sku
          ?.toLowerCase()
          .includes(term) ||
        product?.barcode
          ?.toLowerCase()
          .includes(term) ||
        location?.name
          ?.toLowerCase()
          .includes(term) ||
        location?.code
          ?.toLowerCase()
          .includes(term);

      const matchesLocation =
        !locationFilter ||
        row.location_id === locationFilter;

      return (
        matchesSearch &&
        matchesLocation
      );
    });
  }, [stock, search, locationFilter]);

  const availableLocationsForForm =
    useMemo(() => {
      return activeLocations;
    }, [activeLocations]);

  const transferFromLocations =
    useMemo(() => {
      if (!transferForm.from_warehouse_id) {
        return [];
      }

      return allLocations.filter(
        (location) =>
          location.warehouse_id ===
            transferForm.from_warehouse_id &&
          location.is_active
      );
    }, [
      allLocations,
      transferForm.from_warehouse_id,
    ]);

  const transferToLocations =
    useMemo(() => {
      if (!transferForm.to_warehouse_id) {
        return [];
      }

      return allLocations.filter(
        (location) =>
          location.warehouse_id ===
            transferForm.to_warehouse_id &&
          location.is_active
      );
    }, [
      allLocations,
      transferForm.to_warehouse_id,
    ]);

  const selectedTransferStock =
    useMemo(() => {
      if (
        !transferForm.product_id ||
        !transferForm.from_location_id
      ) {
        return 0;
      }

      const row = stock.find(
        (item) =>
          item.product_id ===
            transferForm.product_id &&
          item.location_id ===
            transferForm.from_location_id
      );

      /*
       * Si el origen pertenece a otro almacén,
       * el stock no está cargado en esta pantalla.
       * Para ese caso la API/RPC será quien valide
       * la existencia real.
       */
      return row?.quantity ?? 0;
    }, [
      stock,
      transferForm.product_id,
      transferForm.from_location_id,
    ]);

  const openCreateForm = () => {
    setForm({
      location_id:
        activeLocations.length === 1
          ? activeLocations[0].id
          : "",
      product_id: "",
      quantity: "0",
    });

    setError("");
    setMessage("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) {
      return;
    }

    setFormOpen(false);
    setForm(EMPTY_FORM);
  };

  const openReleaseForm = (row: StockRow) => {
    setReleaseRow(row);
    setReleaseQuantity(String(row.quantity));
    setReleaseError("");
    setMessage("");
  };

  const handleReleaseSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!releaseRow) {
      return;
    }

    const quantity = Number(releaseQuantity);

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > releaseRow.quantity
    ) {
      setReleaseError(
        `La cantidad debe ser un entero entre 1 y ${releaseRow.quantity}.`
      );
      return;
    }

    try {
      setReleaseSaving(true);
      setReleaseError("");

      const response = await fetch(
        "/api/inventory/stock",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stock_id: releaseRow.id,
            quantity,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo liberar la existencia."
        );
      }

      setReleaseRow(null);
      setMessage(
        `Se liberaron ${quantity} unidades: ahora están sin ubicar.`
      );

      await loadData();
    } catch (error) {
      setReleaseError(
        error instanceof Error
          ? error.message
          : "No se pudo liberar la existencia."
      );
    } finally {
      setReleaseSaving(false);
    }
  };

  const openTransferForm = (
    row?: StockRow
  ) => {
    const productId =
      row?.product_id ?? "";

    const fromLocationId =
      row?.location_id ?? "";

    const fromWarehouseId =
      row?.warehouse_id ??
      warehouseId;

    setTransferForm({
      product_id: productId,
      from_warehouse_id:
        fromWarehouseId,
      from_location_id:
        fromLocationId,
      to_warehouse_id:
        warehouseId,
      to_location_id:
        "",
      quantity: "1",
      reason: "",
    });

    setError("");
    setMessage("");
    setTransferOpen(true);
  };

  const closeTransferForm = () => {
    if (transferSaving) {
      return;
    }

    setTransferOpen(false);
    setTransferForm(
      EMPTY_TRANSFER_FORM
    );
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!warehouseId) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (!form.location_id) {
        throw new Error(
          "Debes seleccionar una ubicación."
        );
      }

      if (!form.product_id) {
        throw new Error(
          "Debes seleccionar un producto."
        );
      }

      const quantity = Number(
        form.quantity
      );

      if (
        !Number.isInteger(quantity) ||
        quantity < 0
      ) {
        throw new Error(
          "La cantidad debe ser un número entero mayor o igual a 0."
        );
      }

      const response = await fetch(
        "/api/inventory/stock",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            warehouse_id: warehouseId,
            location_id: form.location_id,
            product_id: form.product_id,
            quantity,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo crear la existencia."
        );
      }

      setMessage(
        data.message ||
          "Existencia asignada correctamente."
      );

      setFormOpen(false);
      setForm(EMPTY_FORM);

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la existencia."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTransferSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setTransferSaving(true);
    setError("");
    setMessage("");

    try {
      if (!transferForm.product_id) {
        throw new Error(
          "Debes seleccionar un producto."
        );
      }

      if (!transferForm.from_warehouse_id) {
        throw new Error(
          "Debes seleccionar el almacén de origen."
        );
      }

      if (!transferForm.from_location_id) {
        throw new Error(
          "Debes seleccionar la ubicación de origen."
        );
      }

      if (!transferForm.to_warehouse_id) {
        throw new Error(
          "Debes seleccionar el almacén de destino."
        );
      }

      if (!transferForm.to_location_id) {
        throw new Error(
          "Debes seleccionar la ubicación de destino."
        );
      }

      if (
        transferForm.from_location_id ===
        transferForm.to_location_id
      ) {
        throw new Error(
          "La ubicación de origen y destino deben ser diferentes."
        );
      }

      const quantity = Number(
        transferForm.quantity
      );

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          "La cantidad debe ser un número entero mayor que cero."
        );
      }

      /*
       * Si el origen es el almacén actual y
       * tenemos el stock cargado, podemos dar
       * feedback inmediato antes de llamar a la API.
       */
      if (
        transferForm.from_warehouse_id ===
          warehouseId &&
        selectedTransferStock > 0 &&
        quantity > selectedTransferStock
      ) {
        throw new Error(
          `Stock insuficiente en la ubicación de origen. Disponible: ${selectedTransferStock}.`
        );
      }

      const response = await fetch(
        "/api/inventory/transfers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id:
              transferForm.product_id,
            from_warehouse_id:
              transferForm.from_warehouse_id,
            from_location_id:
              transferForm.from_location_id,
            to_warehouse_id:
              transferForm.to_warehouse_id,
            to_location_id:
              transferForm.to_location_id,
            quantity,
            reason:
              transferForm.reason.trim() ||
              "Traslado interno",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo realizar el traslado."
        );
      }

      setMessage(
        data.message ||
          "Traslado realizado correctamente."
      );

      setTransferOpen(false);
      setTransferForm(
        EMPTY_TRANSFER_FORM
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo realizar el traslado."
      );
    } finally {
      setTransferSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
            Cargando inventario del almacén...
          </div>
        </div>
      </main>
    );
  }

  if (!warehouse) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error ||
              "No se encontró el almacén."}
          </div>

          <Link
            href="/inventario/almacenes"
            className="mt-4 inline-flex rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Volver a almacenes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href={`/inventario/almacenes/${warehouseId}`}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              ← Volver a ubicaciones
            </Link>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">
                Stock por ubicación
              </h1>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {warehouse.name}
              </span>

              <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-sm font-semibold text-slate-700">
                {warehouse.code}
              </span>
            </div>

            <p className="mt-2 max-w-3xl text-slate-600">
              Consulta qué productos existen en
              cada ubicación física del almacén.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                openTransferForm()
              }
              disabled={
                stock.length === 0 ||
                allLocations.length < 2
              }
              className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🔄 Trasladar
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              disabled={
                activeLocations.length === 0 ||
                activeProducts.length === 0
              }
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Asignar producto
            </button>
          </div>
        </div>

        {/* INFO */}
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex gap-3">
            <div className="text-xl">ℹ️</div>

            <div>
              <h2 className="font-semibold text-blue-900">
                Inventario localizado
              </h2>

              <p className="mt-1 text-sm leading-6 text-blue-800">
                Las cantidades mostradas aquí
                corresponden a la existencia física
                localizada en este almacén. Las
                asignaciones iniciales no modifican
                el stock global. Los traslados sí
                modifican las cantidades entre
                ubicaciones y quedan registrados.
              </p>
            </div>
          </div>
        </section>

        {/* MESSAGES */}
        {message && !formOpen && !transferOpen && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        )}

        {error && !formOpen && !transferOpen && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* SUMMARY */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Registros de stock
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {stock.length}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-blue-700">
              Unidades localizadas
            </p>

            <p className="mt-2 text-3xl font-bold text-blue-900">
              {totalQuantity.toLocaleString(
                "es-CO"
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-emerald-700">
              Ubicaciones ocupadas
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-900">
              {occupiedLocations}
            </p>

            <p className="mt-1 text-xs text-emerald-700">
              de {activeLocations.length} activas
            </p>
          </div>
        </section>

        {/* FILTERS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Buscar
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Producto, SKU, código o ubicación..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Filtrar por ubicación
              </label>

              <select
                value={locationFilter}
                onChange={(event) =>
                  setLocationFilter(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">
                  Todas las ubicaciones
                </option>

                {activeLocations.map(
                  (location) => (
                    <option
                      key={location.id}
                      value={location.id}
                    >
                      {location.code} —{" "}
                      {location.name}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        </section>

        {/* STOCK TABLE */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-900">
              Existencias localizadas
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {filteredStock.length} registro
              {filteredStock.length === 1
                ? ""
                : "s"}
            </p>
          </div>

          {filteredStock.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">📦</div>

              <h3 className="mt-3 text-lg font-semibold text-slate-900">
                No hay existencias localizadas
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                {search ||
                locationFilter
                  ? "No encontramos registros con los filtros seleccionados."
                  : "Todavía no existen productos asignados a ubicaciones de este almacén."}
              </p>

              {!search &&
                !locationFilter &&
                activeLocations.length > 0 &&
                activeProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800"
                  >
                    + Asignar primer producto
                  </button>
                )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Producto
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      SKU
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ubicación
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tipo
                    </th>

                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Cantidad
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actualizado
                    </th>

                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredStock.map((row) => {
                    const product = row.products;
                    const location = row.locations;

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">
                            {product?.name ||
                              "Producto"}
                          </p>

                          {product?.barcode && (
                            <p className="mt-1 text-xs text-slate-500">
                              Código:{" "}
                              {product.barcode}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="font-mono text-sm text-slate-700">
                            {product?.sku ||
                              "Sin SKU"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {location?.name ||
                                "Ubicación"}
                            </p>

                            <p className="mt-1 font-mono text-xs text-slate-500">
                              {location?.code ||
                                "—"}
                            </p>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                            {getLocationTypeLabel(
                              location?.location_type ||
                                ""
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className="text-lg font-bold text-slate-900">
                            {Number(
                              row.quantity
                            ).toLocaleString(
                              "es-CO"
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-500">
                          {formatDate(
                            row.updated_at
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openTransferForm(
                                row
                              )
                            }
                            disabled={
                              row.quantity <= 0 ||
                              allLocations.length <
                                2
                            }
                            className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            🔄 Trasladar
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openReleaseForm(row)
                            }
                            disabled={row.quantity <= 0}
                            className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            ↩ Liberar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ASSIGNMENT MODAL */}
      {formOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Asignar producto
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Almacén:{" "}
                      <span className="font-semibold text-slate-700">
                        {warehouse.name}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving}
                    className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-col"
              >
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-6">
                  {error && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Ubicación *
                      </label>

                      <select
                        value={form.location_id}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            location_id:
                              event.target.value,
                          }))
                        }
                        disabled={
                          saving ||
                          availableLocationsForForm.length ===
                            0
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">
                          Selecciona una ubicación
                        </option>

                        {availableLocationsForForm.map(
                          (location) => (
                            <option
                              key={location.id}
                              value={location.id}
                            >
                              {location.code} —{" "}
                              {location.name} (
                              {getLocationTypeLabel(
                                location.location_type
                              )}
                              )
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Producto *
                      </label>

                      <select
                        value={form.product_id}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            product_id:
                              event.target.value,
                          }))
                        }
                        disabled={
                          saving ||
                          activeProducts.length ===
                            0
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">
                          Selecciona un producto
                        </option>

                        {activeProducts.map(
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

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Cantidad inicial *
                      </label>

                      <input
                        type="number"
                        onWheel={(event) => event.currentTarget.blur()}
                        min="0"
                        step="1"
                        value={form.quantity}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            quantity:
                              event.target.value,
                          }))
                        }
                        disabled={saving}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />

                      <p className="mt-2 text-xs text-slate-500">
                        Esta cantidad crea la existencia
                        localizada. No modifica el stock
                        global del producto.
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        Importante
                      </p>

                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        Esta es una asignación inicial de
                        inventario por ubicación. Las
                        entradas, salidas, transferencias
                        y recepciones se integrarán después
                        mediante operaciones transaccionales.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-5">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeForm}
                      disabled={saving}
                      className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving
                        ? "Guardando..."
                        : "Asignar producto"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* RELEASE MODAL (tanda 4) */}
      {releaseRow && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="flex min-h-full items-center justify-center">
            <form
              onSubmit={handleReleaseSubmit}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-slate-900">
                Liberar unidades
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                {releaseRow.products?.name ?? "Producto"} en{" "}
                {releaseRow.locations?.name ?? "esta ubicación"}:{" "}
                {releaseRow.quantity} unidades. Las unidades
                liberadas quedan &quot;sin ubicar&quot;; el stock
                total no cambia.
              </p>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Cantidad a liberar
              </label>

              <input
                type="number"
                min="1"
                max={releaseRow.quantity}
                step="1"
                value={releaseQuantity}
                onChange={(event) =>
                  setReleaseQuantity(event.target.value)
                }
                onWheel={(event) =>
                  event.currentTarget.blur()
                }
                disabled={releaseSaving}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              />

              {releaseError && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {releaseError}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReleaseRow(null)}
                  disabled={releaseSaving}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={releaseSaving}
                  className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {releaseSaving ? "Liberando..." : "Liberar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSFER MODAL */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      🔄 Trasladar inventario
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Mueve unidades de una ubicación a
                      otra sin modificar el stock global.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeTransferForm}
                    disabled={transferSaving}
                    className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleTransferSubmit}
                className="flex min-h-0 flex-col"
              >
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-6">
                  {error && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="space-y-5">
                    {/* PRODUCT */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Producto *
                      </label>

                      <select
                        value={
                          transferForm.product_id
                        }
                        onChange={(event) =>
                          setTransferForm(
                            (current) => ({
                              ...current,
                              product_id:
                                event.target.value,
                            })
                          )
                        }
                        disabled={transferSaving}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">
                          Selecciona un producto
                        </option>

                        {activeProducts.map(
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

                    {/* ORIGIN */}
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                      <h3 className="font-semibold text-red-900">
                        Origen
                      </h3>

                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Almacén de origen *
                          </label>

                          <select
                            value={
                              transferForm.from_warehouse_id
                            }
                            onChange={(event) =>
                              setTransferForm(
                                (current) => ({
                                  ...current,
                                  from_warehouse_id:
                                    event.target.value,
                                  from_location_id:
                                    "",
                                })
                              )
                            }
                            disabled={
                              transferSaving
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          >
                            <option value="">
                              Selecciona un almacén
                            </option>

                            {activeWarehouses.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.name} —{" "}
                                  {item.code}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Ubicación de origen *
                          </label>

                          <select
                            value={
                              transferForm.from_location_id
                            }
                            onChange={(event) =>
                              setTransferForm(
                                (current) => ({
                                  ...current,
                                  from_location_id:
                                    event.target.value,
                                })
                              )
                            }
                            disabled={
                              transferSaving ||
                              !transferForm.from_warehouse_id
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          >
                            <option value="">
                              Selecciona una ubicación
                            </option>

                            {transferFromLocations.map(
                              (location) => (
                                <option
                                  key={location.id}
                                  value={location.id}
                                >
                                  {location.code} —{" "}
                                  {location.name}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        {transferForm.from_location_id &&
                          transferForm.from_warehouse_id ===
                            warehouseId &&
                          transferForm.product_id && (
                            <div className="rounded-xl border border-red-200 bg-white px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                                Disponible en origen
                              </p>

                              <p className="mt-1 text-2xl font-bold text-red-900">
                                {selectedTransferStock.toLocaleString(
                                  "es-CO"
                                )}{" "}
                                unidades
                              </p>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* DESTINATION */}
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <h3 className="font-semibold text-emerald-900">
                        Destino
                      </h3>

                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Almacén de destino *
                          </label>

                          <select
                            value={
                              transferForm.to_warehouse_id
                            }
                            onChange={(event) =>
                              setTransferForm(
                                (current) => ({
                                  ...current,
                                  to_warehouse_id:
                                    event.target.value,
                                  to_location_id:
                                    "",
                                })
                              )
                            }
                            disabled={
                              transferSaving
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          >
                            <option value="">
                              Selecciona un almacén
                            </option>

                            {activeWarehouses.map(
                              (item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.name} —{" "}
                                  {item.code}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Ubicación de destino *
                          </label>

                          <select
                            value={
                              transferForm.to_location_id
                            }
                            onChange={(event) =>
                              setTransferForm(
                                (current) => ({
                                  ...current,
                                  to_location_id:
                                    event.target.value,
                                })
                              )
                            }
                            disabled={
                              transferSaving ||
                              !transferForm.to_warehouse_id
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          >
                            <option value="">
                              Selecciona una ubicación
                            </option>

                            {transferToLocations.map(
                              (location) => (
                                <option
                                  key={location.id}
                                  value={location.id}
                                >
                                  {location.code} —{" "}
                                  {location.name}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* QUANTITY */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Cantidad *
                      </label>

                      <input
                        type="number"
                        onWheel={(event) => event.currentTarget.blur()}
                        min="1"
                        step="1"
                        value={
                          transferForm.quantity
                        }
                        onChange={(event) =>
                          setTransferForm(
                            (current) => ({
                              ...current,
                              quantity:
                                event.target.value,
                            })
                          )
                        }
                        disabled={transferSaving}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    {/* REASON */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Motivo
                      </label>

                      <textarea
                        value={
                          transferForm.reason
                        }
                        onChange={(event) =>
                          setTransferForm(
                            (current) => ({
                              ...current,
                              reason:
                                event.target.value,
                            })
                          )
                        }
                        disabled={transferSaving}
                        rows={3}
                        placeholder="Ej. Reubicación de mercancía"
                        className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    {/* WARNING */}
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-blue-900">
                        ¿Qué hará este traslado?
                      </p>

                      <ul className="mt-2 space-y-1 text-xs leading-5 text-blue-800">
                        <li>
                          • Restará las unidades del
                          origen.
                        </li>

                        <li>
                          • Sumará las unidades al
                          destino.
                        </li>

                        <li>
                          • Creará el registro del
                          traslado.
                        </li>

                        <li>
                          • No modificará el stock global
                          del producto.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-5">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={
                        closeTransferForm
                      }
                      disabled={
                        transferSaving
                      }
                      className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={
                        transferSaving
                      }
                      className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {transferSaving
                        ? "Trasladando..."
                        : "🔄 Confirmar traslado"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}