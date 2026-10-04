"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Branch = {
  id: string;
  store_id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type WarehouseBranch = {
  id: string;
  name: string;
  code: string;
};

type Warehouse = {
  id: string;
  store_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  /*
   * El API ahora devuelve también la sucursal relacionada.
   */
  branch?: WarehouseBranch | null;
};

type WarehouseForm = {
  name: string;
  code: string;
  description: string;
  address: string;
  capacity: string;
  branch_id: string;
};

const emptyForm: WarehouseForm = {
  name: "",
  code: "",
  description: "",
  address: "",
  capacity: "",
  branch_id: "",
};

export default function AlmacenesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] =
    useState<Warehouse | null>(null);

  const [form, setForm] = useState<WarehouseForm>(emptyForm);

  /*
   * =====================================================
   * CARGAR ALMACENES
   * =====================================================
   */

  async function loadWarehouses() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/inventory/warehouses",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando almacenes."
        );
      }

      setWarehouses(
        Array.isArray(result.warehouses)
          ? result.warehouses
          : []
      );
    } catch (error) {
      console.error(
        "Error cargando almacenes:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando almacenes."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * =====================================================
   * CARGAR SUCURSALES
   * =====================================================
   */

  async function loadBranches() {
    try {
      setLoadingBranches(true);

      const response = await fetch(
        "/api/inventory/branches",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando sucursales."
        );
      }

      setBranches(
        Array.isArray(result.branches)
          ? result.branches
          : []
      );
    } catch (error) {
      console.error(
        "Error cargando sucursales:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando sucursales."
      );
    } finally {
      setLoadingBranches(false);
    }
  }

  useEffect(() => {
    void loadWarehouses();
    void loadBranches();
  }, []);

  /*
   * =====================================================
   * SUCURSALES ACTIVAS
   * =====================================================
   */

  const activeBranches = useMemo(() => {
    return branches.filter(
      (branch) => branch.is_active
    );
  }, [branches]);

  /*
   * =====================================================
   * BUSCAR
   * =====================================================
   */

  const filteredWarehouses = useMemo(() => {
    const text = search
      .toLowerCase()
      .trim();

    if (!text) {
      return warehouses;
    }

    return warehouses.filter(
      (warehouse) => {
        const branch =
          warehouse.branch ||
          branches.find(
            (item) =>
              item.id ===
              warehouse.branch_id
          );

        return (
          warehouse.name
            ?.toLowerCase()
            .includes(text) ||
          warehouse.code
            ?.toLowerCase()
            .includes(text) ||
          warehouse.address
            ?.toLowerCase()
            .includes(text) ||
          warehouse.description
            ?.toLowerCase()
            .includes(text) ||
          branch?.name
            ?.toLowerCase()
            .includes(text) ||
          branch?.code
            ?.toLowerCase()
            .includes(text)
        );
      }
    );
  }, [
    warehouses,
    branches,
    search,
  ]);

  /*
   * =====================================================
   * FORMULARIO
   * =====================================================
   */

  function openCreateForm() {
    setEditingWarehouse(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setFormOpen(true);
  }

  function openEditForm(
    warehouse: Warehouse
  ) {
    setEditingWarehouse(warehouse);

    setForm({
      name:
        warehouse.name || "",
      code:
        warehouse.code || "",
      description:
        warehouse.description || "",
      address:
        warehouse.address || "",
      capacity:
        warehouse.capacity !== null
          ? String(warehouse.capacity)
          : "",
      branch_id:
        warehouse.branch_id || "",
    });

    setMessage("");
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setFormOpen(false);
    setEditingWarehouse(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  function updateField(
    field: keyof WarehouseForm,
    value: string
  ) {
    setForm(
      (previous) => ({
        ...previous,
        [field]: value,
      })
    );
  }

  /*
   * =====================================================
   * GUARDAR
   * =====================================================
   */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const name =
      form.name.trim();

    const code =
      form.code.trim();

    if (!name) {
      setMessage(
        "El nombre del almacén es obligatorio."
      );
      return;
    }

    if (!code) {
      setMessage(
        "El código del almacén es obligatorio."
      );
      return;
    }

    let capacity:
      | number
      | null = null;

    if (
      form.capacity.trim() !== ""
    ) {
      const numericCapacity =
        Number(form.capacity);

      if (
        !Number.isInteger(
          numericCapacity
        ) ||
        numericCapacity < 0
      ) {
        setMessage(
          "La capacidad debe ser un número entero mayor o igual a 0."
        );
        return;
      }

      capacity =
        numericCapacity;
    }

    setSaving(true);
    setMessage("");
    setError("");

    // Si se guardó, el botón queda deshabilitado
    // hasta que se cierre el formulario.
    let saved = false;

    try {
      const isEditing =
        editingWarehouse !== null;

      const url = isEditing
        ? `/api/inventory/warehouses/${editingWarehouse.id}`
        : "/api/inventory/warehouses";

      const response =
        await fetch(url, {
          method: isEditing
            ? "PUT"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            code,
            description:
              form.description.trim() ||
              null,
            address:
              form.address.trim() ||
              null,
            capacity,
            branch_id:
              form.branch_id.trim() ||
              null,
          }),
        });

      const result =
        await response.json();

      if (!response.ok) {
        /*
         * Estos son errores esperados de validación
         * del backend. Los mostramos al usuario sin
         * generar un error innecesario en consola.
         */
        setMessage(
          result.error ||
            "No se pudo guardar el almacén."
        );

        return;
      }

      setMessage(
        isEditing
          ? "Almacén actualizado correctamente."
          : "Almacén creado correctamente."
      );

      saved = true;

      await loadWarehouses();

      window.setTimeout(
        () => {
          setSaving(false);
          setFormOpen(false);
          setEditingWarehouse(
            null
          );
          setForm(emptyForm);
          setMessage("");
        },
        800
      );
    } catch (error) {
      console.error(
        "Error guardando almacén:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el almacén."
      );
    } finally {
      if (!saved) {
        setSaving(false);
      }
    }
  }

  /*
   * =====================================================
   * ACTIVAR / DESACTIVAR
   * =====================================================
   */

  async function toggleWarehouse(
    warehouse: Warehouse
  ) {
    const action =
      warehouse.is_active
        ? "desactivar"
        : "activar";

    const confirmed =
      window.confirm(
        `¿Deseas ${action} el almacén "${warehouse.name}"?`
      );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          `/api/inventory/warehouses/${warehouse.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              is_active:
                !warehouse.is_active,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        setError(
          result.error ||
            `No se pudo ${action} el almacén.`
        );
        return;
      }

      setMessage(
        warehouse.is_active
          ? "Almacén desactivado correctamente."
          : "Almacén activado correctamente."
      );

      await loadWarehouses();

      window.setTimeout(
        () => {
          setMessage("");
        },
        1200
      );
    } catch (error) {
      console.error(
        `Error al ${action} almacén:`,
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : `No se pudo ${action} el almacén.`
      );
    }
  }

  /*
   * =====================================================
   * OBTENER SUCURSAL
   * =====================================================
   */

  function getBranch(
    warehouse: Warehouse
  ) {
    /*
     * Primero usamos la relación que
     * devuelve el API.
     */
    if (warehouse.branch) {
      return warehouse.branch;
    }

    /*
     * Como respaldo, buscamos la sucursal
     * dentro del listado cargado.
     */
    if (!warehouse.branch_id) {
      return null;
    }

    return (
      branches.find(
        (branch) =>
          branch.id ===
          warehouse.branch_id
      ) || null
    );
  }

  /*
   * =====================================================
   * FORMATEADORES
   * =====================================================
   */

  function formatDate(
    date: string
  ) {
    return new Intl.DateTimeFormat(
      "es-CO",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    ).format(
      new Date(date)
    );
  }

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* ENCABEZADO */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Almacenes
            </h1>

            <p className="mt-2 text-gray-600">
              Administra tus almacenes,
              bodegas y espacios de
              almacenamiento.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/inventario"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Inventario
            </Link>

            <Link
              href="/inventario/almacenes/sucursales"
              className="inline-flex items-center justify-center rounded-lg border border-purple-300 bg-purple-50 px-5 py-3 font-medium text-purple-700 hover:bg-purple-100"
            >
              🏢 Sucursales
            </Link>

            <button
              type="button"
              onClick={
                openCreateForm
              }
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              + Nuevo almacén
            </button>
          </div>
        </div>

        {/* RESUMEN */}

        <div className="mb-6 grid gap-4 md:grid-cols-3">

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total almacenes
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {warehouses.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Almacenes activos
            </p>

            <p className="mt-2 text-3xl font-bold text-green-600">
              {
                warehouses.filter(
                  (
                    warehouse
                  ) =>
                    warehouse.is_active
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Almacenes inactivos
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-500">
              {
                warehouses.filter(
                  (
                    warehouse
                  ) =>
                    !warehouse.is_active
                ).length
              }
            </p>
          </div>

        </div>

        {/* MENSAJE */}

        {message &&
          !formOpen && (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
              {message}
            </div>
          )}

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-medium">
              Error
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() => {
                void loadWarehouses();
                void loadBranches();
              }}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {/* BUSCADOR */}

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-gray-700">
            Buscar almacén
          </label>

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar por nombre, código, sucursal, dirección o descripción..."
            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>

        {/* TABLA */}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando almacenes...
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px]">

                <thead className="border-b bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">

                    <th className="px-5 py-4 font-medium">
                      Almacén
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Código
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Sucursal
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Dirección
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Capacidad
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Estado
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Creado
                    </th>

                    <th className="w-[300px] px-5 py-4 font-medium">
                      Acciones
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y">

                  {filteredWarehouses.map(
                    (
                      warehouse
                    ) => {
                      const branch =
                        getBranch(
                          warehouse
                        );

                      return (
                        <tr
                          key={
                            warehouse.id
                          }
                          className="hover:bg-gray-50"
                        >

                          <td className="px-5 py-4">
                            <div className="font-semibold text-gray-900">
                              {
                                warehouse.name
                              }
                            </div>

                            {warehouse.description && (
                              <div className="mt-1 max-w-xs text-sm text-gray-500">
                                {
                                  warehouse.description
                                }
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-sm text-gray-700">
                              {
                                warehouse.code
                              }
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            {branch ? (
                              <div className="flex items-center gap-2">

                                <span className="text-lg">
                                  🏢
                                </span>

                                <div>
                                  <div className="font-medium text-gray-900">
                                    {
                                      branch.name
                                    }
                                  </div>

                                  <div className="mt-0.5 font-mono text-xs text-gray-500">
                                    {
                                      branch.code
                                    }
                                  </div>
                                </div>

                              </div>
                            ) : (
                              <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                                Sin sucursal
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {
                              warehouse.address ||
                              "—"
                            }
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {warehouse.capacity !==
                            null
                              ? `${warehouse.capacity} unidades`
                              : "Sin límite"}
                          </td>

                          <td className="px-5 py-4">
                            {warehouse.is_active ? (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                                Activo
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                                Inactivo
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm text-gray-500">
                            {formatDate(
                              warehouse.created_at
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">

                              <Link
                                href={`/inventario/almacenes/${warehouse.id}`}
                                className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                              >
                                Ver
                              </Link>

                              <button
                                type="button"
                                onClick={() =>
                                  openEditForm(
                                    warehouse
                                  )
                                }
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void toggleWarehouse(
                                    warehouse
                                  )
                                }
                                className={
                                  warehouse.is_active
                                    ? "rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                    : "rounded-lg border border-green-200 px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
                                }
                              >
                                {
                                  warehouse.is_active
                                    ? "Desactivar"
                                    : "Activar"
                                }
                              </button>

                            </div>
                          </td>

                        </tr>
                      );
                    }
                  )}

                </tbody>

              </table>
            </div>

            {filteredWarehouses.length ===
              0 && (
              <div className="p-10 text-center">

                <div className="text-4xl">
                  🏢
                </div>

                <p className="mt-3 font-medium text-gray-700">
                  {warehouses.length ===
                  0
                    ? "Todavía no tienes almacenes."
                    : "No encontramos almacenes."}
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  {warehouses.length ===
                  0
                    ? "Crea tu primer almacén para comenzar a organizar las existencias."
                    : "Prueba con otro término de búsqueda."}
                </p>

                {warehouses.length ===
                  0 && (
                  <button
                    type="button"
                    onClick={
                      openCreateForm
                    }
                    className="mt-5 rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
                  >
                    + Crear primer almacén
                  </button>
                )}

              </div>
            )}

          </div>
        )}

      </div>

      {/* =====================================================
          MODAL CREAR / EDITAR
          ===================================================== */}

      {formOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">

          <div className="flex min-h-full items-center justify-center">

            <div className="my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

              {/* HEADER */}

              <div className="shrink-0 border-b px-6 py-5">

                <div className="flex items-start justify-between gap-4">

                  <div>

                    <p className="text-sm font-medium text-purple-600">
                      Gestión de almacenes
                    </p>

                    <h2 className="mt-1 text-2xl font-bold text-gray-900">
                      {editingWarehouse
                        ? "Editar almacén"
                        : "Nuevo almacén"}
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Define la información básica del
                      espacio de almacenamiento.
                    </p>

                  </div>

                  <button
                    type="button"
                    onClick={
                      closeForm
                    }
                    disabled={
                      saving
                    }
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ✕
                  </button>

                </div>

              </div>

              {/* FORMULARIO */}

              <form
                onSubmit={
                  handleSubmit
                }
                className="flex min-h-0 flex-col"
              >

                <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-6">

                  <div className="space-y-6">

                    {/* INFORMACIÓN BÁSICA */}

                    <div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        Información básica
                      </h3>

                      <div className="mt-4 grid gap-5 md:grid-cols-2">

                        <div>

                          <label className="text-sm font-medium text-gray-700">
                            Nombre *
                          </label>

                          <input
                            type="text"
                            value={
                              form.name
                            }
                            onChange={(
                              event
                            ) =>
                              updateField(
                                "name",
                                event
                                  .target
                                  .value
                              )
                            }
                            placeholder="Ej. Almacén Principal"
                            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                            disabled={
                              saving
                            }
                            autoFocus
                          />

                        </div>

                        <div>

                          <label className="text-sm font-medium text-gray-700">
                            Código *
                          </label>

                          <input
                            type="text"
                            value={
                              form.code
                            }
                            onChange={(
                              event
                            ) =>
                              updateField(
                                "code",
                                event
                                  .target
                                  .value
                                  .toUpperCase()
                              )
                            }
                            placeholder="Ej. PRINCIPAL"
                            className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-mono uppercase outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                            disabled={
                              saving
                            }
                          />

                          <p className="mt-1 text-xs text-gray-500">
                            Debe ser único dentro de tu tienda.
                          </p>

                        </div>

                      </div>

                    </div>

                    {/* SUCURSAL */}

                    <div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        Sucursal
                      </h3>

                      <div className="mt-4">

                        <label className="text-sm font-medium text-gray-700">
                          Sucursal asociada
                        </label>

                        <select
                          value={
                            form.branch_id
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "branch_id",
                              event
                                .target
                                .value
                            )
                          }
                          disabled={
                            saving ||
                            loadingBranches
                          }
                          className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 disabled:bg-gray-100"
                        >

                          <option value="">
                            Sin sucursal
                          </option>

                          {activeBranches.map(
                            (
                              branch
                            ) => (
                              <option
                                key={
                                  branch.id
                                }
                                value={
                                  branch.id
                                }
                              >
                                {
                                  branch.name
                                }{" "}
                                —{" "}
                                {
                                  branch.code
                                }
                              </option>
                            )
                          )}

                        </select>

                        {loadingBranches && (
                          <p className="mt-2 text-xs text-gray-500">
                            Cargando sucursales...
                          </p>
                        )}

                        {!loadingBranches &&
                          activeBranches.length ===
                            0 && (
                            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">

                              <p className="text-sm text-yellow-800">
                                No tienes sucursales
                                activas.
                              </p>

                              <Link
                                href="/inventario/almacenes/sucursales"
                                className="mt-2 inline-block text-sm font-medium text-yellow-900 underline"
                              >
                                Crear una sucursal
                              </Link>

                            </div>
                          )}

                        <p className="mt-2 text-xs text-gray-500">
                          Puedes dejar el almacén sin
                          sucursal si todavía no deseas
                          asociarlo.
                        </p>

                      </div>

                    </div>

                    {/* DESCRIPCIÓN */}

                    <div>

                      <label className="text-sm font-medium text-gray-700">
                        Descripción
                      </label>

                      <textarea
                        value={
                          form.description
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "description",
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Ej. Almacén principal para productos terminados."
                        rows={3}
                        className="mt-2 w-full resize-none rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                        disabled={
                          saving
                        }
                      />

                    </div>

                    {/* UBICACIÓN */}

                    <div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        Ubicación física
                      </h3>

                      <div className="mt-4">

                        <label className="text-sm font-medium text-gray-700">
                          Dirección
                        </label>

                        <input
                          type="text"
                          value={
                            form.address
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "address",
                              event
                                .target
                                .value
                            )
                          }
                          placeholder="Ej. Calle 10 # 20-30"
                          className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                          disabled={
                            saving
                          }
                        />

                      </div>

                    </div>

                    {/* CAPACIDAD */}

                    <div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        Capacidad
                      </h3>

                      <div className="mt-4">

                        <label className="text-sm font-medium text-gray-700">
                          Capacidad máxima
                        </label>

                        <input
                          type="number"
                          onWheel={(event) => event.currentTarget.blur()}
                          min="0"
                          step="1"
                          value={
                            form.capacity
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "capacity",
                              event
                                .target
                                .value
                            )
                          }
                          placeholder="Ej. 1000"
                          className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                          disabled={
                            saving
                          }
                        />

                        <p className="mt-2 text-xs text-gray-500">
                          Puedes dejarlo vacío si el almacén
                          no tiene una capacidad definida.
                        </p>

                      </div>

                    </div>

                    {/* AVISO */}

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">

                      <p className="text-sm font-medium text-blue-800">
                        ℹ️ Importante
                      </p>

                      <p className="mt-1 text-sm text-blue-700">
                        Crear o editar un almacén no modifica
                        el stock de ningún producto.
                      </p>

                    </div>

                    {/* MENSAJE */}

                    {message && (
                      <div
                        className={`rounded-lg border p-4 text-sm ${
                          message.includes(
                            "correctamente"
                          )
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-yellow-200 bg-yellow-50 text-yellow-800"
                        }`}
                      >
                        {message}
                      </div>
                    )}

                  </div>

                </div>

                {/* BOTONES */}

                <div className="shrink-0 border-t bg-white px-6 py-5">

                  <div className="flex justify-end gap-3">

                    <button
                      type="button"
                      onClick={
                        closeForm
                      }
                      disabled={
                        saving
                      }
                      className="rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={
                        saving
                      }
                      className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving
                        ? "Guardando..."
                        : editingWarehouse
                        ? "Guardar cambios"
                        : "Crear almacén"}
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