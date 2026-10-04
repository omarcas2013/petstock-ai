"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Supplier = {
  id: string;
  name: string;
};

type ProductForm = {
  name: string;
  description: string;
  brand: string;
  category: string;
  subcategory: string;
  supplier_id: string;
  pet_type: string;
  presentation: string;
  unit_of_measure: string;
  sku: string;
  barcode: string;
  purchase_price: string;
  sale_price: string;
  tax_type: string;
  tax_rate: string;
  minimum_stock: string;
  maximum_stock: string;
  reorder_point: string;
  image_url: string;
};

const initialForm: ProductForm = {
  name: "",
  description: "",
  brand: "",
  category: "",
  subcategory: "",
  supplier_id: "",
  pet_type: "Perros",
  presentation: "",
  unit_of_measure: "unidad",
  sku: "",
  barcode: "",
  purchase_price: "",
  sale_price: "",
  tax_type: "porcentaje",
  tax_rate: "0",
  minimum_stock: "0",
  maximum_stock: "",
  reorder_point: "0",
  image_url: "",
};

export default function NuevoProductoPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<ProductForm>(initialForm);

  useEffect(() => {
    let cancelled = false;

    async function loadSuppliers() {
      try {
        const response = await fetch("/api/suppliers");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Error cargando proveedores"
          );
        }

        if (!cancelled) {
          setSuppliers(result.suppliers || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error cargando proveedores:", error);
        }
      }
    }

    void loadSuppliers();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(
    field: keyof ProductForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
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

      setMessage(
        result.warning
          ? `⚠️ ${result.warning}`
          : "✅ Producto guardado correctamente."
      );

      setForm(initialForm);
    } catch (error) {
      console.error("Error:", error);

      setMessage(
        "❌ No se pudo conectar con el servidor."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        {/* ENCABEZADO */}

        <div className="mb-8">
          <p className="text-sm text-gray-500">
            PetStock AI · Inventario
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Nuevo producto
          </h1>

          <p className="mt-2 text-gray-600">
            Crea la ficha completa del producto.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* INFORMACIÓN BÁSICA */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Información básica
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Identificación y características principales.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label
                  htmlFor="name"
                  className="text-sm font-medium text-gray-700"
                >
                  Nombre del producto *
                </label>

                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) =>
                    updateField("name", e.target.value)
                  }
                  placeholder="Ej. Royal Canin Adult"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="text-sm font-medium text-gray-700"
                >
                  Descripción
                </label>

                <textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    updateField(
                      "description",
                      e.target.value
                    )
                  }
                  placeholder="Describe el producto, características, beneficios..."
                  className={inputClass}
                />
              </div>

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
                      updateField("brand", e.target.value)
                    }
                    placeholder="Ej. Royal Canin"
                    className={inputClass}
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
                    placeholder="Ej. Alimento"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="subcategory"
                    className="text-sm font-medium text-gray-700"
                  >
                    Subcategoría
                  </label>

                  <input
                    id="subcategory"
                    value={form.subcategory}
                    onChange={(e) =>
                      updateField(
                        "subcategory",
                        e.target.value
                      )
                    }
                    placeholder="Ej. Alimento seco"
                    className={inputClass}
                  />
                </div>

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
                    className={inputClass}
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
              </div>
            </div>
          </section>

          {/* IDENTIFICACIÓN */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Identificación
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Códigos utilizados para buscar y controlar el producto.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="sku"
                  className="text-sm font-medium text-gray-700"
                >
                  SKU
                </label>

                <input
                  id="sku"
                  value={form.sku}
                  onChange={(e) =>
                    updateField("sku", e.target.value)
                  }
                  placeholder="Ej. RC-ADULT-10"
                  className={inputClass}
                />

                <p className="mt-1 text-xs text-gray-500">
                  Debe ser único dentro de tu tienda.
                </p>
              </div>

              <div>
                <label
                  htmlFor="barcode"
                  className="text-sm font-medium text-gray-700"
                >
                  Código de barras
                </label>

                <input
                  id="barcode"
                  value={form.barcode}
                  onChange={(e) =>
                    updateField(
                      "barcode",
                      e.target.value
                    )
                  }
                  placeholder="Ej. 7701234567890"
                  className={inputClass}
                />

                <p className="mt-1 text-xs text-gray-500">
                  Debe ser único dentro de tu tienda.
                </p>
              </div>
            </div>
          </section>

          {/* CLASIFICACIÓN */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Clasificación y presentación
              </h2>
            </div>

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
                  className={inputClass}
                >
                  <option value="Perros">Perros</option>
                  <option value="Gatos">Gatos</option>
                  <option value="Perros y gatos">
                    Perros y gatos
                  </option>
                  <option value="Aves">Aves</option>
                  <option value="Roedores">
                    Roedores
                  </option>
                  <option value="Otros">Otros</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="unit_of_measure"
                  className="text-sm font-medium text-gray-700"
                >
                  Unidad de medida
                </label>

                <select
                  id="unit_of_measure"
                  value={form.unit_of_measure}
                  onChange={(e) =>
                    updateField(
                      "unit_of_measure",
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="unidad">Unidad</option>
                  <option value="caja">Caja</option>
                  <option value="paquete">Paquete</option>
                  <option value="bolsa">Bolsa</option>
                  <option value="frasco">Frasco</option>
                  <option value="kg">Kilogramo</option>
                  <option value="g">Gramo</option>
                  <option value="l">Litro</option>
                  <option value="ml">
                    Mililitro
                  </option>
                </select>
              </div>

              <div className="md:col-span-2">
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
                  placeholder="Ej. Bolsa de 10 kg"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* PRECIOS E IMPUESTOS */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Precios e impuestos
              </h2>
            </div>

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
                  onWheel={(event) => event.currentTarget.blur()}
                  min="0"
                  step="any"
                  value={form.purchase_price}
                  onChange={(e) =>
                    updateField(
                      "purchase_price",
                      e.target.value
                    )
                  }
                  placeholder="0"
                  className={inputClass}
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
                  onWheel={(event) => event.currentTarget.blur()}
                  min="0"
                  step="any"
                  value={form.sale_price}
                  onChange={(e) =>
                    updateField(
                      "sale_price",
                      e.target.value
                    )
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="tax_type"
                  className="text-sm font-medium text-gray-700"
                >
                  Tipo de impuesto
                </label>

                <select
                  id="tax_type"
                  value={form.tax_type}
                  onChange={(e) => {
                    updateField(
                      "tax_type",
                      e.target.value
                    );

                    if (
                      e.target.value === "exento"
                    ) {
                      updateField(
                        "tax_rate",
                        "0"
                      );
                    }
                  }}
                  className={inputClass}
                >
                  <option value="porcentaje">
                    Porcentaje
                  </option>
                  <option value="exento">
                    Exento
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="tax_rate"
                  className="text-sm font-medium text-gray-700"
                >
                  Impuesto (%)
                </label>

                <input
                  id="tax_rate"
                  type="number"
                  onWheel={(event) => event.currentTarget.blur()}
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.tax_rate}
                  disabled={form.tax_type === "exento"}
                  onChange={(e) =>
                    updateField(
                      "tax_rate",
                      e.target.value
                    )
                  }
                  className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`}
                />
              </div>
            </div>
          </section>

          {/* CONTROL DE INVENTARIO */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Control de inventario
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                El stock inicial se carga posteriormente desde el
                módulo de inventario para mantener trazabilidad.
              </p>
            </div>

            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <strong>Importante:</strong> crear el producto no
              modifica el stock. Después de guardarlo puedes usar
              <strong> Inventario → Cargar inventario</strong> para
              registrar una existencia inicial.
            </div>

            <div className="grid gap-5 md:grid-cols-3">
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
                  onWheel={(event) => event.currentTarget.blur()}
                  min="0"
                  value={form.minimum_stock}
                  onChange={(e) =>
                    updateField(
                      "minimum_stock",
                      e.target.value
                    )
                  }
                  placeholder="0"
                  className={inputClass}
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
                  onWheel={(event) => event.currentTarget.blur()}
                  min="0"
                  value={form.maximum_stock}
                  onChange={(e) =>
                    updateField(
                      "maximum_stock",
                      e.target.value
                    )
                  }
                  placeholder="50"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="reorder_point"
                  className="text-sm font-medium text-gray-700"
                >
                  Punto de reorden
                </label>

                <input
                  id="reorder_point"
                  type="number"
                  onWheel={(event) => event.currentTarget.blur()}
                  min="0"
                  value={form.reorder_point}
                  onChange={(e) =>
                    updateField(
                      "reorder_point",
                      e.target.value
                    )
                  }
                  placeholder="10"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* IMAGEN */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Imagen
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Puedes asociar una imagen al producto.
              </p>
            </div>

            <div>
              <label
                htmlFor="image_url"
                className="text-sm font-medium text-gray-700"
              >
                URL de imagen
              </label>

              <input
                id="image_url"
                type="url"
                value={form.image_url}
                onChange={(e) =>
                  updateField(
                    "image_url",
                    e.target.value
                  )
                }
                placeholder="https://..."
                className={inputClass}
              />

              <p className="mt-1 text-xs text-gray-500">
                La carga directa a Supabase Storage la podemos
                incorporar como siguiente paso.
              </p>
            </div>
          </section>

          {/* MENSAJE */}

          {message && (
            <div className="rounded-xl bg-white p-4 text-sm text-gray-700 shadow-sm">
              {message}
            </div>
          )}

          {/* BOTONES */}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gray-900 px-6 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Guardando..."
                : "💾 Guardar producto"}
            </button>

            <Link
              href="/inventario"
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-center font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}