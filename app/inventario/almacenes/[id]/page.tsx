"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type WarehouseBranch = {
  id: string;
  name: string;
  code: string;
};

type Warehouse = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  is_active: boolean;
  branch_id: string | null;
  branch?: WarehouseBranch | null;
  created_at: string;
  updated_at: string;
};

type Location = {
  id: string;
  store_id: string;
  warehouse_id: string;
  name: string;
  code: string;
  description: string | null;
  location_type:
    | "zona"
    | "pasillo"
    | "estanteria"
    | "ubicacion"
    | "recepcion"
    | "despacho"
    | "cuarentena";
  capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LocationForm = {
  name: string;
  code: string;
  description: string;
  location_type: Location["location_type"];
  capacity: string;
  is_active: boolean;
};

const LOCATION_TYPES: {
  value: Location["location_type"];
  label: string;
}[] = [
  {
    value: "zona",
    label: "Zona",
  },
  {
    value: "pasillo",
    label: "Pasillo",
  },
  {
    value: "estanteria",
    label: "Estantería",
  },
  {
    value: "ubicacion",
    label: "Ubicación",
  },
  {
    value: "recepcion",
    label: "Recepción",
  },
  {
    value: "despacho",
    label: "Despacho",
  },
  {
    value: "cuarentena",
    label: "Cuarentena",
  },
];

const EMPTY_FORM: LocationForm = {
  name: "",
  code: "",
  description: "",
  location_type: "ubicacion",
  capacity: "",
  is_active: true,
};

function getLocationTypeLabel(
  type: Location["location_type"]
) {
  return (
    LOCATION_TYPES.find((item) => item.value === type)?.label ??
    type
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function WarehouseLocationsPage() {
  const params = useParams();

  const warehouseId = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  const [warehouse, setWarehouse] =
    useState<Warehouse | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] =
    useState<Location | null>(null);

  const [form, setForm] =
    useState<LocationForm>(EMPTY_FORM);

  const loadData = async () => {
    if (!warehouseId) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [warehouseResponse, locationsResponse] =
        await Promise.all([
          fetch(
            `/api/inventory/warehouses/${warehouseId}`,
            {
              cache: "no-store",
            }
          ),
          fetch(
            `/api/inventory/locations?warehouse_id=${warehouseId}`,
            {
              cache: "no-store",
            }
          ),
        ]);

      const warehouseData =
        await warehouseResponse.json();

      const locationsData =
        await locationsResponse.json();

      if (!warehouseResponse.ok) {
        throw new Error(
          warehouseData.error ||
            "No se pudo cargar el almacén."
        );
      }

      if (!locationsResponse.ok) {
        throw new Error(
          locationsData.error ||
            "No se pudieron cargar las ubicaciones."
        );
      }

      setWarehouse(warehouseData.warehouse);
      setLocations(locationsData.locations ?? []);
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

  const filteredLocations = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return locations;
    }

    return locations.filter((location) => {
      return (
        location.name.toLowerCase().includes(term) ||
        location.code.toLowerCase().includes(term) ||
        location.location_type
          .toLowerCase()
          .includes(term) ||
        getLocationTypeLabel(location.location_type)
          .toLowerCase()
          .includes(term)
      );
    });
  }, [locations, search]);

  const activeLocations = locations.filter(
    (location) => location.is_active
  );

  const inactiveLocations = locations.filter(
    (location) => !location.is_active
  );

  const openCreateForm = () => {
    setEditingLocation(null);
    setForm(EMPTY_FORM);
    setError("");
    setMessage("");
    setFormOpen(true);
  };

  const openEditForm = (location: Location) => {
    setEditingLocation(location);

    setForm({
      name: location.name,
      code: location.code,
      description: location.description ?? "",
      location_type: location.location_type,
      capacity:
        location.capacity !== null
          ? String(location.capacity)
          : "",
      is_active: location.is_active,
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
    setEditingLocation(null);
    setForm(EMPTY_FORM);
  };

  const updateField = <K extends keyof LocationForm>(
    field: K,
    value: LocationForm[K]
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
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
      const name = form.name.trim();
      const code = form.code.trim().toUpperCase();

      if (!name) {
        throw new Error(
          "El nombre de la ubicación es obligatorio."
        );
      }

      if (!code) {
        throw new Error(
          "El código de la ubicación es obligatorio."
        );
      }

      let capacity: number | null = null;

      if (form.capacity.trim() !== "") {
        const parsedCapacity = Number(
          form.capacity
        );

        if (
          !Number.isInteger(parsedCapacity) ||
          parsedCapacity < 0
        ) {
          throw new Error(
            "La capacidad debe ser un número entero mayor o igual a 0."
          );
        }

        capacity = parsedCapacity;
      }

      const payload = {
        warehouse_id: warehouseId,
        name,
        code,
        description:
          form.description.trim() || null,
        location_type: form.location_type,
        capacity,
        is_active: form.is_active,
      };

      const isEditing =
        editingLocation !== null;

      const response = await fetch(
        isEditing
          ? `/api/inventory/locations/${editingLocation.id}`
          : "/api/inventory/locations",
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo guardar la ubicación."
        );
      }

      setMessage(
        data.message ||
          (isEditing
            ? "Ubicación actualizada correctamente."
            : "Ubicación creada correctamente.")
      );

      setFormOpen(false);
      setEditingLocation(null);
      setForm(EMPTY_FORM);

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la ubicación."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleLocationStatus = async (
    location: Location
  ) => {
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/inventory/locations/${location.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_active: !location.is_active,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo cambiar el estado."
        );
      }

      setMessage(
        data.message ||
          "Estado actualizado correctamente."
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cambiar el estado."
      );
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
            Cargando almacén y ubicaciones...
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
              href="/inventario/almacenes"
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              ← Volver a almacenes
            </Link>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">
                {warehouse.name}
              </h1>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {warehouse.code}
              </span>

              {warehouse.is_active ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                  Activo
                </span>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                  Inactivo
                </span>
              )}
            </div>

            <p className="mt-2 max-w-3xl text-slate-600">
              Administra las zonas, pasillos,
              estanterías y ubicaciones físicas de
              este almacén.
            </p>
          </div>

          {/* ACCIONES DEL ALMACÉN */}
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/inventario/almacenes/${warehouseId}/stock`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              📦 Stock por ubicación
            </Link>

            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              + Nueva ubicación
            </button>
          </div>
        </div>

        {/* WAREHOUSE INFO */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* SUCURSAL */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sucursal
              </p>

              {warehouse.branch ? (
                <div className="mt-1">
                  <p className="font-semibold text-slate-900">
                    {warehouse.branch.name}
                  </p>

                  <p className="mt-1 inline-flex rounded-lg bg-blue-50 px-2.5 py-1 font-mono text-xs font-semibold text-blue-700">
                    {warehouse.branch.code}
                  </p>
                </div>
              ) : (
                <p className="mt-1 font-medium text-slate-500">
                  Sin sucursal asignada
                </p>
              )}
            </div>

            {/* DIRECCIÓN */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dirección
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {warehouse.address || "Sin dirección"}
              </p>
            </div>

            {/* CAPACIDAD */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Capacidad
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {warehouse.capacity !== null
                  ? warehouse.capacity.toLocaleString(
                      "es-CO"
                    )
                  : "Sin límite definido"}
              </p>
            </div>

            {/* DESCRIPCIÓN */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Descripción
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {warehouse.description ||
                  "Sin descripción"}
              </p>
            </div>
          </div>
        </section>

        {/* MESSAGES */}
        {message && !formOpen && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        )}

        {error && !formOpen && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* SUMMARY */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Total ubicaciones
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {locations.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-emerald-700">
              Ubicaciones activas
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-800">
              {activeLocations.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Ubicaciones inactivas
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-700">
              {inactiveLocations.length}
            </p>
          </div>
        </section>

        {/* LOCATIONS */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Ubicaciones
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Define la estructura física y
                  operativa del almacén.
                </p>
              </div>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Buscar por nombre, código o tipo..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 md:w-80"
              />
            </div>
          </div>

          {filteredLocations.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">📍</div>

              <h3 className="mt-3 text-lg font-semibold text-slate-900">
                {search
                  ? "No se encontraron ubicaciones"
                  : "Este almacén todavía no tiene ubicaciones"}
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                {search
                  ? "Prueba con otro nombre, código o tipo de ubicación."
                  : "Crea la primera ubicación para comenzar a organizar físicamente el almacén."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800"
                >
                  + Crear ubicación
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nombre
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Código
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tipo
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Capacidad
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Estado
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Creada
                    </th>

                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Acciones
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredLocations.map(
                    (location) => (
                      <tr
                        key={location.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {location.name}
                            </p>

                            {location.description && (
                              <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                                {location.description}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-semibold text-slate-700">
                            {location.code}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                            {getLocationTypeLabel(
                              location.location_type
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-700">
                          {location.capacity !== null
                            ? location.capacity.toLocaleString(
                                "es-CO"
                              )
                            : "Sin límite"}
                        </td>

                        <td className="px-5 py-4">
                          {location.is_active ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Activa
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              Inactiva
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-500">
                          {formatDate(
                            location.created_at
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                openEditForm(location)
                              }
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                toggleLocationStatus(
                                  location
                                )
                              }
                              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                                location.is_active
                                  ? "border-red-200 text-red-600 hover:bg-red-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {location.is_active
                                ? "Desactivar"
                                : "Activar"}
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
        </section>
      </div>

      {/* FORM MODAL */}
      {formOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {editingLocation
                        ? "Editar ubicación"
                        : "Nueva ubicación"}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Almacén:{" "}
                      <span className="font-semibold text-slate-700">
                        {warehouse.name}
                      </span>
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Sucursal:{" "}
                      <span className="font-semibold text-slate-700">
                        {warehouse.branch?.name ||
                          "Sin sucursal"}
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

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Nombre *
                      </label>

                      <input
                        type="text"
                        value={form.name}
                        onChange={(event) =>
                          updateField(
                            "name",
                            event.target.value
                          )
                        }
                        placeholder="Ej. Estantería A1"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Código *
                      </label>

                      <input
                        type="text"
                        value={form.code}
                        onChange={(event) =>
                          updateField(
                            "code",
                            event.target.value.toUpperCase()
                          )
                        }
                        placeholder="Ej. A1"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono uppercase outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Tipo de ubicación *
                      </label>

                      <select
                        value={form.location_type}
                        onChange={(event) =>
                          updateField(
                            "location_type",
                            event.target.value as Location["location_type"]
                          )
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        disabled={saving}
                      >
                        {LOCATION_TYPES.map(
                          (type) => (
                            <option
                              key={type.value}
                              value={type.value}
                            >
                              {type.label}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Capacidad
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.capacity}
                        onChange={(event) =>
                          updateField(
                            "capacity",
                            event.target.value
                          )
                        }
                        placeholder="Ej. 100"
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        disabled={saving}
                      />

                      <p className="mt-1 text-xs text-slate-500">
                        Déjalo vacío si no quieres
                        establecer un límite.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Descripción
                    </label>

                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        updateField(
                          "description",
                          event.target.value
                        )
                      }
                      rows={4}
                      placeholder="Describe esta zona, pasillo, estantería o ubicación..."
                      className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      disabled={saving}
                    />
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) =>
                          updateField(
                            "is_active",
                            event.target.checked
                          )
                        }
                        className="mt-1 h-5 w-5 rounded border-gray-300"
                        disabled={saving}
                      />

                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          Ubicación activa
                        </span>

                        <span className="mt-1 block text-xs text-slate-500">
                          Las ubicaciones inactivas se
                          conservan para mantener el
                          historial, pero no deberían
                          utilizarse para nuevas
                          operaciones.
                        </span>
                      </span>
                    </label>
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
                        : editingLocation
                        ? "Guardar cambios"
                        : "Crear ubicación"}
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