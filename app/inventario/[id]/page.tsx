"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
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

type ProductForm = {
  name: string;
  brand: string;
  category: string;
  supplier_id: string;
  pet_type: string;
  presentation: string;
  sku: string;
  purchase_price: string;
  sale_price: string;
  stock: string;
  minimum_stock: string;
  maximum_stock: string;
};

const emptyForm: ProductForm = {
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
};

export default function EditarProductoPage() {
  const params = useParams();
  const router = useRouter();

  const productId =
    typeof params.id === "string"
      ? params.id
      : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState<
    Supplier[]
  >([]);

  const [form, setForm] =
    useState<ProductForm>(emptyForm);

  function updateField(
    field: keyof ProductForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  useEffect(() => {
    if (!productId) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setMessage("");

      try {
        const [
          productResponse,
          suppliersResponse,
        ] = await Promise.all([
          fetch(`/api/products/${productId}`),
          fetch("/api/suppliers"),
        ]);

        const productResult =
          await productResponse.json();

        if (!productResponse.ok) {
          throw new Error(
            productResult.error ||
              "Error cargando producto"
          );
        }

        const product: Product =
          productResult.product;

        if (!cancelled) {
          setForm({
            name: product.name || "",
            brand: product.brand || "",
            category: product.category || "",
            supplier_id:
              product.supplier_id || "",
            pet_type:
              product.pet_type || "Perros",
            presentation:
              product.presentation || "",
            sku: product.sku || "",
            purchase_price:
              product.purchase_price?.toString() ||
              "",
            sale_price:
              product.sale_price?.toString() || "",
            stock:
              product.stock?.toString() || "0",
            minimum_stock:
              product.minimum_stock?.toString() ||
              "0",
            maximum_stock:
              product.maximum_stock === null
                ? ""
                : product.maximum_stock.toString(),
          });
        }

        if (suppliersResponse.ok) {
          const suppliersResult =
            await suppliersResponse.json();

          if (!cancelled) {
            setSuppliers(
              suppliersResult.suppliers || []
            );
          }
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Error cargando producto"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!productId) {
      setMessage(
        "No se encontró el ID del producto."
      );
      return;
    }

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
            result.error ||
            "Error desconocido"
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

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
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
            <label
              htmlFor="name"
              className="text-sm font-medium text-gray-700"
            >
              Nombre del producto
            </label>

            <input
              id="name"
              required
              value={form.name}
              onChange={(e) =>
                updateField(
                  "name",
                  e.target.value
                )
              }
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {/* MARCA Y CATEGORÍA */}

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="brand"
                className="text-sm font-medium text-gray-700"
              >
                Marca
              </label>

              <input
                id="brand"
                value={form.brand}
                onChange={(e) =>
                  updateField(
                    "brand",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label
                htmlFor="category"
                className="text-sm font-medium text-gray-700"
              >
                Categoría
              </label>

              <input
                id="category"
                value={form.category}
                onChange={(e) =>
                  updateField(
                    "category",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* PROVEEDOR */}

          <div>
            <label
              htmlFor="supplier_id"
              className="text-sm font-medium text-gray-700"
            >
              Proveedor
            </label>

            <select
              id="supplier_id"
              value={form.supplier_id}
              onChange={(e) =>
                updateField(
                  "supplier_id",
                  e.target.value
                )
              }
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
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
              <label
                htmlFor="pet_type"
                className="text-sm font-medium text-gray-700"
              >
                Tipo de mascota
              </label>

              <select
                id="pet_type"
                value={form.pet_type}
                onChange={(e) =>
                  updateField(
                    "pet_type",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
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
              <label
                htmlFor="presentation"
                className="text-sm font-medium text-gray-700"
              >
                Presentación
              </label>

              <input
                id="presentation"
                value={form.presentation}
                onChange={(e) =>
                  updateField(
                    "presentation",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* SKU */}

          <div>
            <label
              htmlFor="sku"
              className="text-sm font-medium text-gray-700"
            >
              SKU / Código
            </label>

            <input
              id="sku"
              value={form.sku}
              onChange={(e) =>
                updateField(
                  "sku",
                  e.target.value
                )
              }
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {/* PRECIOS */}

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="purchase_price"
                className="text-sm font-medium text-gray-700"
              >
                Precio de compra
              </label>

              <input
                id="purchase_price"
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
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label
                htmlFor="sale_price"
                className="text-sm font-medium text-gray-700"
              >
                Precio de venta
              </label>

              <input
                id="sale_price"
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
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* STOCK */}

          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label
                htmlFor="stock"
                className="text-sm font-medium text-gray-700"
              >
                Stock
              </label>

              <input
                id="stock"
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
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label
                htmlFor="minimum_stock"
                className="text-sm font-medium text-gray-700"
              >
                Stock mínimo
              </label>

              <input
                id="minimum_stock"
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
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label
                htmlFor="maximum_stock"
                className="text-sm font-medium text-gray-700"
              >
                Stock máximo
              </label>

              <input
                id="maximum_stock"
                type="number"
                min="0"
                value={form.maximum_stock}
                onChange={(e) =>
                  updateField(
                    "maximum_stock",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* MENSAJE */}

          {message && (
            <div className="rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
              {message}
            </div>
          )}

          {/* BOTONES */}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gray-900 px-6 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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
              disabled={saving}
              className="rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}