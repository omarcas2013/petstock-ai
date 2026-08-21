"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  supplier_id: string | null;
  pet_type: string | null;
  presentation: string | null;
  sku: string | null;
  purchase_price: number;
  sale_price: number;
  stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
};

type Supplier = {
  id: string;
  name: string;
};

export default function EditarProductoPage() {
  const params = useParams();
  const router = useRouter();

  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

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

  function updateField(field: string, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function loadProduct() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        `/api/products/${productId}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando producto"
        );
      }

      const product: Product = result.product;

      setForm({
        name: product.name || "",
        brand: product.brand || "",
        category: product.category || "",
        supplier_id: product.supplier_id || "",
        pet_type: product.pet_type || "Perros",
        presentation: product.presentation || "",
        sku: product.sku || "",
        purchase_price:
          product.purchase_price?.toString() || "",
        sale_price:
          product.sale_price?.toString() || "",
        stock: product.stock?.toString() || "0",
        minimum_stock:
          product.minimum_stock?.toString() || "0",
        maximum_stock:
          product.maximum_stock === null
            ? ""
            : product.maximum_stock.toString(),
      });
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Error cargando producto"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadSuppliers() {
    try {
      const response = await fetch("/api/suppliers");

      if (!response.ok) {
        return;
      }

      const result = await response.json();

      setSuppliers(result.suppliers || []);
    } catch (error) {
      console.error(
        "Error cargando proveedores:",
        error
      );
    }
  }

  useEffect(() => {
    if (productId) {
      loadProduct();
      loadSuppliers();
    }
  }, [productId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/products/${productId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          `Error al guardar: ${
            result.error || "Error desconocido"
          }`
        );
        return;
      }

      setMessage(
        "✅ Producto actualizado correctamente."
      );

      setTimeout(() => {
        router.push("/inventario");
      }, 800);
    } catch (error) {
      console.error(error);

      setMessage(
        "❌ No se pudo conectar con el servidor."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando producto...
            </p>
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
          <p className="text-sm text-gray-500">
            PetStock AI
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Editar producto
          </h1>

          <p className="mt-2 text-gray-600">
            Modifica la información del producto.
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
                Sin proveedor
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
                className="mt-2 w-full rounded-lg border p-3"
              />
            </div>

          </div>

          {/* STOCK */}

          <div className="grid gap-5 md:grid-cols-3">

            <div>
              <label className="text-sm font-medium">
                Stock
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
              disabled={saving}
              className="rounded-lg bg-gray-900 px-6 py-3 font-medium text-white disabled:opacity-50"
            >
              {saving
                ? "Guardando..."
                : "💾 Guardar cambios"}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push("/inventario")
              }
              className="rounded-lg border px-6 py-3 font-medium"
            >
              Cancelar
            </button>

          </div>

        </form>
      </div>
    </main>
  );
}