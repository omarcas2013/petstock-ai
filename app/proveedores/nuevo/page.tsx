"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NuevoProveedorPage() {
const router = useRouter();

const [saving, setSaving] = useState(false);
const [message, setMessage] = useState("");

const [form, setForm] = useState({
name: "",
phone: "",
email: "",
});

function updateField(
field: keyof typeof form,
value: string
) {
setForm((previous) => ({
...previous,
[field]: value,
}));
}

async function handleSubmit(event: FormEvent) {
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

  const response = await fetch("/api/suppliers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
        "No se pudo crear el proveedor."
    );
  }

  setMessage(
    "Proveedor creado correctamente."
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
      : "No se pudo crear el proveedor."
  );

  // Solo se reactiva el botón si falló: en el caso
  // exitoso seguimos deshabilitados hasta navegar.
  setSaving(false);
}


}

return ( <main className="min-h-screen bg-gray-100 p-6 md:p-10"> <div className="mx-auto max-w-3xl">


    <div className="mb-8">
      <p className="text-sm font-medium text-gray-500">
        PetStock AI
      </p>

      <h1 className="mt-1 text-3xl font-bold text-gray-900">
        Nuevo proveedor
      </h1>

      <p className="mt-2 text-gray-600">
        Registra un nuevo proveedor para tus productos.
      </p>
    </div>

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
            updateField("name", e.target.value)
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
            updateField("phone", e.target.value)
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
            updateField("email", e.target.value)
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

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving
            ? "Guardando..."
            : "Guardar proveedor"}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            router.push("/proveedores")
          }
          className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  </div>
</main>
);
}
