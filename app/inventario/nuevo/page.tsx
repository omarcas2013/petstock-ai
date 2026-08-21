"use client";

import { FormEvent, useEffect, useState } from "react";

export default function NuevoProductoPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState<
  { id: string; name: string }[]
>([]);

  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "",
    supplier_id: "",
    pet_type: "Perros",
    presentation: "",
    sku: "",
    purchase_price: "",
    sale_price: "",
    stock: "",
    minimum_stock: "",
    maximum_stock: "",
  });
useEffect(() => {
  async function loadSuppliers() {
    try {
      const response = await fetch("/api/suppliers");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando proveedores"
        );
      }

      setSuppliers(result.suppliers || []);
    } catch (error) {
      console.error(
        "Error cargando proveedores:",
        error
      );
    }
  }

  loadSuppliers();
}, []);
  function updateField(field: string, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          `Error al guardar: ${
            result.error || "Error desconocido"
          }`
        );
        return;
      }

      setMessage("✅ Producto guardado correctamente.");

      setForm({
        name: "",
        brand: "",
        category: "",
        supplier_id: "",
        pet_type: "Perros",
        presentation: "",
        sku: "",
        purchase_price: "",
        sale_price: "",
        stock: "",
        minimum_stock: "",
        maximum_stock: "",
      });
    } catch (error) {
      console.error("Error:", error);

      setMessage(
        "❌ No se pudo conectar con el servidor."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-3xl">

        {/* ENCABEZADO */}

        <div className="mb-8">
          <p className="text-sm text-gray-500">
            PetStock AI
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Nuevo producto
          </h1>

          <p className="mt-2 text-gray-600">
            Registra un producto en tu inventario.
          </p>
        </div>

        {/* FORMULARIO */}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl bg-white p-6 shadow-sm"
        >

          {/* NOMBRE */}

          <div>
            <label className="text-sm font-medium">
              Nombre del producto
            </label>

            <input
              required
              value={form.name}
              onChange={(e) =>
                updateField("name", e.target.value)
              }
              placeholder="Ej. Royal Canin Adult"
              className="mt-2 w-full rounded-lg border p-3"
            />
          </div>

          {/* MARCA Y CATEGORÍA */}

          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="text-sm font-medium">
                Marca
              </label>

              <input
                value={form.brand}
                onChange={(e) =>
                  updateField("brand", e.target.value)
                }
                placeholder="Ej. Royal Canin"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Categoría
              </label>

              <input
                value={form.category}
                onChange={(e) =>
                  updateField(
                    "category",
                    e.target.value
                  )
                }
                placeholder="Ej. Alimento seco"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

          </div>
          {/* PROVEEDOR */}

<div>
  <label className="text-sm font-medium">
    Proveedor
  </label>

  <select
    value={form.supplier_id}
    onChange={(e) =>
      updateField(
        "supplier_id",
        e.target.value
      )
    }
    className="mt-2 w-full rounded-lg border p-3"
  >
    <option value="">
      Seleccionar proveedor
    </option>

    {suppliers.map((supplier) => (
      <option
        key={supplier.id}
        value={supplier.id}
      >
        {supplier.name}
      </option>
    ))}
  </select>
</div>
          {/* MASCOTA Y PRESENTACIÓN */}

          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="text-sm font-medium">
                Tipo de mascota
              </label>

              <select
                value={form.pet_type}
                onChange={(e) =>
                  updateField(
                    "pet_type",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border p-3"
              >
                <option value="Perros">
                  Perros
                </option>

                <option value="Gatos">
                  Gatos
                </option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">
                Presentación
              </label>

              <input
                value={form.presentation}
                onChange={(e) =>
                  updateField(
                    "presentation",
                    e.target.value
                  )
                }
                placeholder="Ej. 10 kg"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

          </div>

          {/* SKU */}

          <div>
            <label className="text-sm font-medium">
              SKU / Código
            </label>

            <input
              value={form.sku}
              onChange={(e) =>
                updateField("sku", e.target.value)
              }
              placeholder="Ej. RC-ADULT-10"
              className="mt-2 w-full rounded-lg border p-3"
            />
          </div>

          {/* PRECIOS */}

          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="text-sm font-medium">
                Precio de compra
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchase_price}
                onChange={(e) =>
                  updateField(
                    "purchase_price",
                    e.target.value
                  )
                }
                placeholder="0"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Precio de venta
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sale_price}
                onChange={(e) =>
                  updateField(
                    "sale_price",
                    e.target.value
                  )
                }
                placeholder="0"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

          </div>

          {/* STOCK */}

          <div className="grid gap-5 md:grid-cols-3">

            <div>
              <label className="text-sm font-medium">
                Stock inicial
              </label>

              <input
                required
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) =>
                  updateField(
                    "stock",
                    e.target.value
                  )
                }
                placeholder="0"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Stock mínimo
              </label>

              <input
                required
                type="number"
                min="0"
                value={form.minimum_stock}
                onChange={(e) =>
                  updateField(
                    "minimum_stock",
                    e.target.value
                  )
                }
                placeholder="5"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Stock máximo
              </label>

              <input
                type="number"
                min="0"
                value={form.maximum_stock}
                onChange={(e) =>
                  updateField(
                    "maximum_stock",
                    e.target.value
                  )
                }
                placeholder="50"
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

          </div>

          {/* MENSAJE */}

          {message && (
            <div className="rounded-lg bg-gray-100 p-4">
              {message}
            </div>
          )}

          {/* BOTONES */}

          <div className="flex gap-3">

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gray-900 px-6 py-3 font-medium text-white disabled:opacity-50"
            >
              {loading
                ? "Guardando..."
                : "💾 Guardar producto"}
            </button>

            <a
              href="/inventario"
              className="rounded-lg border px-6 py-3 font-medium"
            >
              Cancelar
            </a>

          </div>

        </form>
      </div>
    </main>
  );
}