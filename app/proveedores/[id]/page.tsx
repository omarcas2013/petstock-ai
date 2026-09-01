"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export default function EditarProveedorPage() {
  const router = useRouter();
  const params = useParams();

  const supplierId = params.id as string;

  const [supplier, setSupplier] =
    useState<Supplier | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
  });

  const loadSupplier = useCallback(async () => {
    if (!supplierId) {
      setError(
        "No se encontró el ID del proveedor."
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/suppliers/${supplierId}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo cargar el proveedor."
        );
      }

      const data = result.supplier as Supplier;

      setSupplier(data);

      setForm({
        name: data.name || "",
        phone: data.phone || "",
        email: data.email || "",
      });
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el proveedor."
      );
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    const load = async () => {
      await loadSupplier();
    };

    load();
  }, [loadSupplier]);

  function updateField(
    field: keyof typeof form,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!form.name.trim()) {
      setMessage(
        "El nombre del proveedor es obligatorio."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/suppliers/${supplierId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo actualizar el proveedor."
        );
      }

      setSupplier(result.supplier);

      setMessage(
        "Proveedor actualizado correctamente."
      );

      setTimeout(() => {
        router.push("/proveedores");
        router.refresh();
      }, 800);
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el proveedor."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!supplier) {
      return;
    }

    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar a "${supplier.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/suppliers/${supplierId}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo eliminar el proveedor."
        );
      }

      router.push("/proveedores");
      router.refresh();
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el proveedor."
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-3xl">

          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando proveedor...
            </p>
          </div>

        </div>
      </main>
    );
  }

  if (error && !supplier) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-3xl">

          <div className="mb-6">

            <button
              type="button"
              onClick={() =>
                router.push("/proveedores")
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Volver a proveedores
            </button>

          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">

            <p className="font-medium">
              No se pudo cargar el proveedor
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() => loadSupplier()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Intentar nuevamente
            </button>

          </div>

        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-3xl">

        {/* ENCABEZADO */}

        <div className="mb-8">

          <button
            type="button"
            onClick={() =>
              router.push("/proveedores")
            }
            className="mb-5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Volver a proveedores
          </button>

          <p className="text-sm font-medium text-gray-500">
            PetStock AI
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Editar proveedor
          </h1>

          <p className="mt-2 text-gray-600">
            Actualiza la información del proveedor.
          </p>

        </div>

        {/* FORMULARIO */}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl bg-white p-6 shadow-sm"
        >

          <div>

            <label className="text-sm font-medium text-gray-700">
              Nombre del proveedor
            </label>

            <input
              required
              type="text"
              value={form.name}
              onChange={(e) =>
                updateField(
                  "name",
                  e.target.value
                )
              }
              placeholder="Ej. Distribuidora Pet Colombia"
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />

          </div>

          <div>

            <label className="text-sm font-medium text-gray-700">
              Teléfono
            </label>

            <input
              type="text"
              value={form.phone}
              onChange={(e) =>
                updateField(
                  "phone",
                  e.target.value
                )
              }
              placeholder="Ej. 3043334462"
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />

          </div>

          <div>

            <label className="text-sm font-medium text-gray-700">
              Email
            </label>

            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                updateField(
                  "email",
                  e.target.value
                )
              }
              placeholder="Ej. ventas@proveedor.com"
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />

          </div>

          {message && (
            <div className="rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
              {message}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* BOTONES */}

          <div className="flex flex-col justify-between gap-3 border-t pt-6 sm:flex-row">

            <button
              type="button"
              onClick={handleDelete}
              disabled={
                saving || deleting
              }
              className="rounded-lg border border-red-300 bg-white px-6 py-3 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting
                ? "Eliminando..."
                : "Eliminar proveedor"}
            </button>

            <div className="flex gap-3">

              <button
                type="button"
                disabled={
                  saving || deleting
                }
                onClick={() =>
                  router.push("/proveedores")
                }
                className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={
                  saving || deleting
                }
                className="rounded-lg bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving
                  ? "Guardando..."
                  : "Guardar cambios"}
              </button>

            </div>

          </div>

        </form>

      </div>
    </main>
  );
}