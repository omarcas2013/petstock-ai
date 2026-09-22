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

type BranchForm = {
  name: string;
  code: string;
  description: string;
  address: string;
  phone: string;
  email: string;
};

const emptyForm: BranchForm = {
  name: "",
  code: "",
  description: "",
  address: "",
  phone: "",
  email: "",
};

export default function SucursalesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] =
    useState<Branch | null>(null);

  const [form, setForm] =
    useState<BranchForm>(emptyForm);

  /*
   * =====================================================
   * CARGAR SUCURSALES
   * =====================================================
   */

  async function loadBranches() {
    try {
      setLoading(true);
      setError("");

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
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando sucursales."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBranches();
  }, []);

  /*
   * =====================================================
   * BUSCAR
   * =====================================================
   */

  const filteredBranches = useMemo(() => {
    const text =
      search.toLowerCase().trim();

    if (!text) {
      return branches;
    }

    return branches.filter(
      (branch) =>
        branch.name
          ?.toLowerCase()
          .includes(text) ||
        branch.code
          ?.toLowerCase()
          .includes(text) ||
        branch.address
          ?.toLowerCase()
          .includes(text) ||
        branch.phone
          ?.toLowerCase()
          .includes(text) ||
        branch.email
          ?.toLowerCase()
          .includes(text) ||
        branch.description
          ?.toLowerCase()
          .includes(text)
    );
  }, [branches, search]);

  /*
   * =====================================================
   * FORMULARIO
   * =====================================================
   */

  function openCreateForm() {
    setEditingBranch(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setFormOpen(true);
  }

  function openEditForm(branch: Branch) {
    setEditingBranch(branch);

    setForm({
      name: branch.name || "",
      code: branch.code || "",
      description:
        branch.description || "",
      address:
        branch.address || "",
      phone:
        branch.phone || "",
      email:
        branch.email || "",
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
    setEditingBranch(null);
    setForm(emptyForm);
    setMessage("");
  }

  function updateField(
    field: keyof BranchForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
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
        "El nombre de la sucursal es obligatorio."
      );
      return;
    }

    if (!code) {
      setMessage(
        "El código de la sucursal es obligatorio."
      );
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const isEditing =
        editingBranch !== null;

      const url = isEditing
        ? `/api/inventory/branches/${editingBranch.id}`
        : "/api/inventory/branches";

      const response = await fetch(
        url,
        {
          method: isEditing
            ? "PUT"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            ...(isEditing
              ? {}
              : { code }),
            description:
              form.description.trim() ||
              null,
            address:
              form.address.trim() ||
              null,
            phone:
              form.phone.trim() ||
              null,
            email:
              form.email.trim() ||
              null,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            (isEditing
              ? "No se pudo actualizar la sucursal."
              : "No se pudo crear la sucursal.")
        );
        return;
      }

      setMessage(
        isEditing
          ? "Sucursal actualizada correctamente."
          : "Sucursal creada correctamente."
      );

      await loadBranches();

      window.setTimeout(() => {
        setFormOpen(false);
        setEditingBranch(null);
        setForm(emptyForm);
        setMessage("");
      }, 800);
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la sucursal."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * =====================================================
   * ACTIVAR / DESACTIVAR
   * =====================================================
   */

  async function toggleBranch(
    branch: Branch
  ) {
    if (togglingId) {
      return;
    }

    const nextStatus =
      !branch.is_active;

    const actionText = nextStatus
      ? "activar"
      : "desactivar";

    const confirmed = window.confirm(
      `¿Seguro que deseas ${actionText} la sucursal "${branch.name}"?`
    );

    if (!confirmed) {
      return;
    }

    setTogglingId(branch.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/inventory/branches/${branch.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            is_active: nextStatus,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            `No se pudo ${actionText} la sucursal.`
        );
        return;
      }

      setMessage(
        nextStatus
          ? "Sucursal activada correctamente."
          : "Sucursal desactivada correctamente."
      );

      await loadBranches();

      window.setTimeout(() => {
        setMessage("");
      }, 1800);
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : `No se pudo ${actionText} la sucursal.`
      );
    } finally {
      setTogglingId(null);
    }
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
    ).format(new Date(date));
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
              Sucursales
            </h1>

            <p className="mt-2 text-gray-600">
              Administra las sucursales de tu
              tienda y organiza sus almacenes.
            </p>

          </div>

          <div className="flex flex-col gap-3 sm:flex-row">

            <Link
              href="/inventario/almacenes"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Almacenes
            </Link>

            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              + Nueva sucursal
            </button>

          </div>

        </div>

        {/* RESUMEN */}

        <div className="mb-6 grid gap-4 md:grid-cols-3">

          <div className="rounded-2xl bg-white p-5 shadow-sm">

            <p className="text-sm text-gray-500">
              Total sucursales
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {branches.length}
            </p>

          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">

            <p className="text-sm text-gray-500">
              Sucursales activas
            </p>

            <p className="mt-2 text-3xl font-bold text-green-600">
              {
                branches.filter(
                  (branch) =>
                    branch.is_active
                ).length
              }
            </p>

          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">

            <p className="text-sm text-gray-500">
              Sucursales inactivas
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-500">
              {
                branches.filter(
                  (branch) =>
                    !branch.is_active
                ).length
              }
            </p>

          </div>

        </div>

        {/* MENSAJE */}

        {message && !formOpen && (
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
              onClick={() =>
                void loadBranches()
              }
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Intentar nuevamente
            </button>

          </div>
        )}

        {/* BUSCADOR */}

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">

          <label className="text-sm font-medium text-gray-700">
            Buscar sucursal
          </label>

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar por nombre, código, dirección, teléfono o correo..."
            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />

        </div>

        {/* TABLA */}

        {loading ? (

          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">

            <p className="text-gray-500">
              Cargando sucursales...
            </p>

          </div>

        ) : (

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1300px]">

                <thead className="border-b bg-gray-50">

                  <tr className="text-left text-sm text-gray-500">

                    <th className="px-5 py-4 font-medium">
                      Sucursal
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Código
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Dirección
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Contacto
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Estado
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Creada
                    </th>

                    <th className="w-[360px] px-5 py-4 font-medium">
                      Acciones
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y">

                  {filteredBranches.map(
                    (branch) => (

                      <tr
                        key={branch.id}
                        className="hover:bg-gray-50"
                      >

                        <td className="px-5 py-4">

                          <div className="flex items-start gap-3">

                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-xl">
                              🏢
                            </div>

                            <div>

                              <div className="font-semibold text-gray-900">
                                {branch.name}
                              </div>

                              {branch.description && (
                                <div className="mt-1 max-w-xs text-sm text-gray-500">
                                  {branch.description}
                                </div>
                              )}

                            </div>

                          </div>

                        </td>

                        <td className="px-5 py-4">

                          <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-sm text-gray-700">
                            {branch.code}
                          </span>

                        </td>

                        <td className="px-5 py-4 text-gray-700">

                          {branch.address ||
                            "—"}

                        </td>

                        <td className="px-5 py-4">

                          <div className="text-sm text-gray-700">

                            {branch.phone && (
                              <div>
                                📞{" "}
                                {branch.phone}
                              </div>
                            )}

                            {branch.email && (
                              <div className="mt-1">
                                ✉️{" "}
                                {branch.email}
                              </div>
                            )}

                            {!branch.phone &&
                              !branch.email && (
                                <span className="text-gray-400">
                                  —
                                </span>
                              )}

                          </div>

                        </td>

                        <td className="px-5 py-4">

                          {branch.is_active ? (

                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                              Activa
                            </span>

                          ) : (

                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                              Inactiva
                            </span>

                          )}

                        </td>

                        <td className="px-5 py-4 text-sm text-gray-500">

                          {formatDate(
                            branch.created_at
                          )}

                        </td>

                        <td className="px-5 py-4">

                          <div className="flex flex-wrap gap-2">

                            {/* EDITAR */}

                            <button
                              type="button"
                              onClick={() =>
                                openEditForm(
                                  branch
                                )
                              }
                              disabled={
                                togglingId !==
                                  null ||
                                saving
                              }
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ✏️ Editar
                            </button>

                            {/* VER DETALLE */}

                            <Link
                              href={`/inventario/almacenes/sucursales/${branch.id}`}
                              className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                            >
                              👁️ Ver detalle
                            </Link>

                            {/* ACTIVAR / DESACTIVAR */}

                            <button
                              type="button"
                              onClick={() =>
                                void toggleBranch(
                                  branch
                                )
                              }
                              disabled={
                                togglingId !==
                                  null ||
                                saving
                              }
                              className={
                                branch.is_active
                                  ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  : "rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                              }
                            >
                              {togglingId ===
                              branch.id
                                ? "Guardando..."
                                : branch.is_active
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

            {filteredBranches.length ===
              0 && (

              <div className="p-10 text-center">

                <div className="text-4xl">
                  🏢
                </div>

                <p className="mt-3 font-medium text-gray-700">

                  {branches.length === 0
                    ? "Todavía no tienes sucursales."
                    : "No encontramos sucursales."}

                </p>

                <p className="mt-1 text-sm text-gray-500">

                  {branches.length === 0
                    ? "Crea tu primera sucursal para comenzar a organizar tus almacenes."
                    : "Prueba con otro término de búsqueda."}

                </p>

                {branches.length ===
                  0 && (

                  <button
                    type="button"
                    onClick={
                      openCreateForm
                    }
                    className="mt-5 rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
                  >
                    + Crear primera sucursal
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
                      Gestión de sucursales
                    </p>

                    <h2 className="mt-1 text-2xl font-bold text-gray-900">

                      {editingBranch
                        ? "Editar sucursal"
                        : "Nueva sucursal"}

                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      {editingBranch
                        ? "Actualiza la información de la sucursal."
                        : "Define la información básica de la sucursal."}
                    </p>

                  </div>

                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ✕
                  </button>

                </div>

              </div>

              {/* FORMULARIO */}

              <form
                onSubmit={handleSubmit}
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
                            value={form.name}
                            onChange={(event) =>
                              updateField(
                                "name",
                                event.target.value
                              )
                            }
                            placeholder="Ej. Sucursal Norte"
                            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                            disabled={saving}
                            autoFocus
                          />

                        </div>

                        <div>

                          <label className="text-sm font-medium text-gray-700">
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
                            placeholder="Ej. SUC-NORTE"
                            className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-mono uppercase outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                            disabled={
                              saving ||
                              editingBranch !==
                                null
                            }
                          />

                          <p className="mt-1 text-xs text-gray-500">
                            Debe ser único dentro
                            de tu tienda.
                          </p>

                        </div>

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
                        onChange={(event) =>
                          updateField(
                            "description",
                            event.target.value
                          )
                        }
                        placeholder="Ej. Sucursal principal del norte."
                        rows={3}
                        className="mt-2 w-full resize-none rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                        disabled={saving}
                      />

                    </div>

                    {/* DIRECCIÓN */}

                    <div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        Ubicación
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
                          onChange={(event) =>
                            updateField(
                              "address",
                              event.target.value
                            )
                          }
                          placeholder="Ej. Calle 100 # 15-20"
                          className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                          disabled={saving}
                        />

                      </div>

                    </div>

                    {/* CONTACTO */}

                    <div>

                      <h3 className="text-lg font-semibold text-gray-900">
                        Información de contacto
                      </h3>

                      <div className="mt-4 grid gap-5 md:grid-cols-2">

                        <div>

                          <label className="text-sm font-medium text-gray-700">
                            Teléfono
                          </label>

                          <input
                            type="text"
                            value={
                              form.phone
                            }
                            onChange={(event) =>
                              updateField(
                                "phone",
                                event.target.value
                              )
                            }
                            placeholder="Ej. 3001234567"
                            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                            disabled={saving}
                          />

                        </div>

                        <div>

                          <label className="text-sm font-medium text-gray-700">
                            Correo electrónico
                          </label>

                          <input
                            type="email"
                            value={
                              form.email
                            }
                            onChange={(event) =>
                              updateField(
                                "email",
                                event.target.value
                              )
                            }
                            placeholder="Ej. norte@petstock.com"
                            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                            disabled={saving}
                          />

                        </div>

                      </div>

                    </div>

                    {/* ESTADO */}

                    {editingBranch && (

                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">

                        <div className="flex items-center justify-between gap-4">

                          <div>

                            <p className="text-sm font-medium text-gray-800">
                              Estado de la sucursal
                            </p>

                            <p className="mt-1 text-sm text-gray-500">
                              Puedes cambiar el estado desde la tabla principal.
                            </p>

                          </div>

                          {editingBranch.is_active ? (

                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                              Activa
                            </span>

                          ) : (

                            <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
                              Inactiva
                            </span>

                          )}

                        </div>

                      </div>

                    )}

                    {/* AVISO */}

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">

                      <p className="text-sm font-medium text-blue-800">
                        ℹ️ Importante
                      </p>

                      <p className="mt-1 text-sm text-blue-700">
                        {editingBranch
                          ? "Modificar la información de la sucursal no cambia el stock ni los almacenes asociados."
                          : "Crear una sucursal no modifica el stock ni los almacenes existentes."}
                      </p>

                    </div>

                    {/* MENSAJE */}

                    {message && (

                      <div className="rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
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
                      onClick={closeForm}
                      disabled={saving}
                      className="rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >

                      {saving
                        ? "Guardando..."
                        : editingBranch
                        ? "Guardar cambios"
                        : "Crear sucursal"}

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