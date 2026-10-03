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
  description: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  supplier_id: string | null;
  pet_type: string | null;
  presentation: string | null;
  unit_of_measure: string | null;
  sku: string | null;
  barcode: string | null;
  purchase_price: number;
  sale_price: number;
  tax_rate: number;
  tax_type: string | null;
  stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
  reorder_point: number;
  manages_lots: boolean;
  is_active: boolean;
  image_url: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type ProductLot = {
  id: string;
  product_id: string;
  lot_number: string;
  manufacturing_date: string | null;
  expiration_date: string | null;
  quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  manages_lots: boolean;
  is_active: boolean;
  image_url: string;
};

const emptyForm: ProductForm = {
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
  manages_lots: false,
  is_active: true,
  image_url: "",
};

export default function EditarProductoPage() {
  const params = useParams();
  const router = useRouter();

  const productId =
    typeof params.id === "string"
      ? params.id
      : "";

  /*
  |--------------------------------------------------------------------------
  | PRODUCTO
  |--------------------------------------------------------------------------
  */

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>(
    []
  );

  const [currentStock, setCurrentStock] = useState(0);

  const [form, setForm] =
    useState<ProductForm>(emptyForm);

  /*
  |--------------------------------------------------------------------------
  | LOTES
  |--------------------------------------------------------------------------
  */

  const [lots, setLots] = useState<ProductLot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [showLotForm, setShowLotForm] = useState(false);
  const [savingLot, setSavingLot] = useState(false);
  const [lotMessage, setLotMessage] = useState("");

  const [lotForm, setLotForm] = useState({
    lot_number: "",
    manufacturing_date: "",
    expiration_date: "",
    quantity: "0",
    is_active: true,
  });

  /*
  |--------------------------------------------------------------------------
  | CLASES
  |--------------------------------------------------------------------------
  */

  const inputClass =
    "mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  /*
  |--------------------------------------------------------------------------
  | ACTUALIZAR PRODUCTO
  |--------------------------------------------------------------------------
  */

  function updateField(
    field: keyof ProductForm,
    value: string | boolean
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  /*
  |--------------------------------------------------------------------------
  | CARGAR LOTES
  |--------------------------------------------------------------------------
  */

  async function loadLots() {
    if (!productId) {
      return;
    }

    setLotsLoading(true);

    try {
      const response = await fetch(
        `/api/products/${productId}/lots`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudieron cargar los lotes."
        );
      }

      setLots(result.lots || []);
    } catch (error) {
      console.error(
        "Error cargando lotes:",
        error
      );

      setLotMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los lotes."
      );
    } finally {
      setLotsLoading(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ESTADO DEL LOTE
  |--------------------------------------------------------------------------
  */

  function getLotStatus(lot: ProductLot) {
    if (!lot.is_active) {
      return {
        label: "Inactivo",
        className:
          "bg-gray-100 text-gray-600",
      };
    }

    if (!lot.expiration_date) {
      return {
        label: "Sin vencimiento",
        className:
          "bg-blue-100 text-blue-700",
      };
    }

    const today = new Date();

    today.setHours(
      0,
      0,
      0,
      0
    );

    const expiration = new Date(
      `${lot.expiration_date}T00:00:00`
    );

    if (
      expiration < today
    ) {
      return {
        label: "Vencido",
        className:
          "bg-red-100 text-red-700",
      };
    }

    const days = Math.ceil(
      (expiration.getTime() -
        today.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (days <= 30) {
      return {
        label:
          days === 0
            ? "Vence hoy"
            : `Vence en ${days} días`,
        className:
          "bg-amber-100 text-amber-700",
      };
    }

    return {
      label: "Vigente",
      className:
        "bg-emerald-100 text-emerald-700",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | RESET LOTE
  |--------------------------------------------------------------------------
  */

  function resetLotForm() {
    setLotForm({
      lot_number: "",
      manufacturing_date: "",
      expiration_date: "",
      quantity: "0",
      is_active: true,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | CREAR LOTE
  |--------------------------------------------------------------------------
  */

  async function handleCreateLot(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!productId) {
      setLotMessage(
        "No se encontró el ID del producto."
      );

      return;
    }

    setSavingLot(true);
    setLotMessage("");

    try {
      const response = await fetch(
        `/api/products/${productId}/lots`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            lotForm
          ),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        setLotMessage(
          result.error ||
            "No se pudo crear el lote."
        );

        return;
      }

      resetLotForm();

      setShowLotForm(false);

      await loadLots();

      setLotMessage(
        "✅ Lote creado correctamente. El stock global no fue modificado."
      );
    } catch (error) {
      console.error(
        "Error creando lote:",
        error
      );

      setLotMessage(
        "❌ No se pudo conectar con el servidor."
      );
    } finally {
      setSavingLot(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CARGAR PRODUCTO
  |--------------------------------------------------------------------------
  */

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
          fetch(
            `/api/products/${productId}`
          ),
          fetch("/api/suppliers"),
        ]);

        const productResult =
          await productResponse.json();

        if (!productResponse.ok) {
          throw new Error(
            productResult.error ||
              "Error cargando producto."
          );
        }

        const product: Product =
          productResult.product;

        if (!cancelled) {
          setCurrentStock(
            product.stock ?? 0
          );

          setForm({
            name:
              product.name || "",

            description:
              product.description || "",

            brand:
              product.brand || "",

            category:
              product.category || "",

            subcategory:
              product.subcategory || "",

            supplier_id:
              product.supplier_id || "",

            pet_type:
              product.pet_type ||
              "Perros",

            presentation:
              product.presentation || "",

            unit_of_measure:
              product.unit_of_measure ||
              "unidad",

            sku:
              product.sku || "",

            barcode:
              product.barcode || "",

            purchase_price:
              product.purchase_price?.toString() ||
              "",

            sale_price:
              product.sale_price?.toString() ||
              "",

            tax_type:
              product.tax_type ||
              "porcentaje",

            tax_rate:
              product.tax_rate?.toString() ||
              "0",

            minimum_stock:
              product.minimum_stock?.toString() ||
              "0",

            maximum_stock:
              product.maximum_stock === null ||
              product.maximum_stock ===
                undefined
                ? ""
                : product.maximum_stock.toString(),

            reorder_point:
              product.reorder_point?.toString() ||
              "0",

            manages_lots:
              product.manages_lots ??
              false,

            is_active:
              product.is_active ??
              true,

            image_url:
              product.image_url ||
              "",
          });
        }

        if (
          suppliersResponse.ok
        ) {
          const suppliersResult =
            await suppliersResponse.json();

          if (!cancelled) {
            setSuppliers(
              suppliersResult.suppliers ||
                []
            );
          }
        }
      } catch (error) {
        console.error(
          "Error cargando producto:",
          error
        );

        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Error cargando producto."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();
    void loadLots();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  /*
  |--------------------------------------------------------------------------
  | GUARDAR PRODUCTO
  |--------------------------------------------------------------------------
  */

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
      const response =
        await fetch(
          `/api/products/${productId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              form
            ),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          `❌ ${
            result.error ||
            "Error al guardar el producto."
          }`
        );

        return;
      }

      setMessage(
        result.warning
          ? `⚠️ ${result.warning}`
          : "✅ Producto actualizado correctamente."
      );

      setTimeout(() => {
        router.push(
          "/inventario"
        );
      }, 800);
    } catch (error) {
      console.error(
        "Error guardando producto:",
        error
      );

      setMessage(
        "❌ No se pudo conectar con el servidor."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando producto...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-4xl">

        {/* ENCABEZADO */}

        <div className="mb-8">
          <p className="text-sm text-gray-500">
            PetStock AI · Inventario
          </p>

          <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">

            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Editar producto
              </h1>

              <p className="mt-2 text-gray-600">
                Actualiza la ficha del producto.
              </p>
            </div>

            <span
              className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${
                form.is_active
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {form.is_active
                ? "Activo"
                : "Inactivo"}
            </span>

          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* =========================================================
              INFORMACIÓN BÁSICA
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Información básica
            </h2>

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
                    updateField(
                      "name",
                      e.target.value
                    )
                  }
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
                  value={
                    form.description
                  }
                  onChange={(e) =>
                    updateField(
                      "description",
                      e.target.value
                    )
                  }
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
                      updateField(
                        "brand",
                        e.target.value
                      )
                    }
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
                    value={
                      form.category
                    }
                    onChange={(e) =>
                      updateField(
                        "category",
                        e.target.value
                      )
                    }
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
                    value={
                      form.subcategory
                    }
                    onChange={(e) =>
                      updateField(
                        "subcategory",
                        e.target.value
                      )
                    }
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
                    value={
                      form.supplier_id
                    }
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

                    {suppliers.map(
                      (supplier) => (
                        <option
                          key={
                            supplier.id
                          }
                          value={
                            supplier.id
                          }
                        >
                          {
                            supplier.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

              </div>
            </div>
          </section>

          {/* =========================================================
              IDENTIFICACIÓN
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Identificación
            </h2>

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
                    updateField(
                      "sku",
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
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
                  value={
                    form.barcode
                  }
                  onChange={(e) =>
                    updateField(
                      "barcode",
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

            </div>
          </section>

          {/* =========================================================
              CLASIFICACIÓN
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Clasificación y presentación
            </h2>

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
                  value={
                    form.pet_type
                  }
                  onChange={(e) =>
                    updateField(
                      "pet_type",
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Perros">
                    Perros
                  </option>

                  <option value="Gatos">
                    Gatos
                  </option>

                  <option value="Perros y gatos">
                    Perros y gatos
                  </option>

                  <option value="Aves">
                    Aves
                  </option>

                  <option value="Roedores">
                    Roedores
                  </option>

                  <option value="Otros">
                    Otros
                  </option>
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
                  value={
                    form.unit_of_measure
                  }
                  onChange={(e) =>
                    updateField(
                      "unit_of_measure",
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="unidad">
                    Unidad
                  </option>

                  <option value="caja">
                    Caja
                  </option>

                  <option value="paquete">
                    Paquete
                  </option>

                  <option value="bolsa">
                    Bolsa
                  </option>

                  <option value="frasco">
                    Frasco
                  </option>

                  <option value="kg">
                    Kilogramo
                  </option>

                  <option value="g">
                    Gramo
                  </option>

                  <option value="l">
                    Litro
                  </option>

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
                  value={
                    form.presentation
                  }
                  onChange={(e) =>
                    updateField(
                      "presentation",
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

            </div>
          </section>

          {/* =========================================================
              PRECIOS E IMPUESTOS
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Precios e impuestos
            </h2>

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
                  value={
                    form.purchase_price
                  }
                  onChange={(e) =>
                    updateField(
                      "purchase_price",
                      e.target.value
                    )
                  }
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
                  min="0"
                  step="0.01"
                  value={
                    form.sale_price
                  }
                  onChange={(e) =>
                    updateField(
                      "sale_price",
                      e.target.value
                    )
                  }
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
                  value={
                    form.tax_type
                  }
                  onChange={(e) => {
                    updateField(
                      "tax_type",
                      e.target.value
                    );

                    if (
                      e.target.value ===
                      "exento"
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
                  min="0"
                  max="100"
                  step="0.01"
                  disabled={
                    form.tax_type ===
                    "exento"
                  }
                  value={
                    form.tax_rate
                  }
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

          {/* =========================================================
              CONTROL DE INVENTARIO
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Control de inventario
            </h2>

            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">

              <p className="text-sm text-blue-800">
                <strong>
                  Stock actual:
                </strong>{" "}
                {currentStock}
              </p>

              <p className="mt-1 text-xs text-blue-700">
                El stock no se modifica
                desde la ficha del producto.
                Utiliza los movimientos de
                inventario, compras,
                recepciones o devoluciones
                para mantener trazabilidad.
              </p>

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
                  type="number"
                  min="0"
                  value={
                    form.minimum_stock
                  }
                  onChange={(e) =>
                    updateField(
                      "minimum_stock",
                      e.target.value
                    )
                  }
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
                  min="0"
                  value={
                    form.maximum_stock
                  }
                  onChange={(e) =>
                    updateField(
                      "maximum_stock",
                      e.target.value
                    )
                  }
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
                  min="0"
                  value={
                    form.reorder_point
                  }
                  onChange={(e) =>
                    updateField(
                      "reorder_point",
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

            </div>

            {/* =====================================================
                MANEJA LOTES
            ===================================================== */}

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">

              <label className="flex cursor-pointer items-start gap-3">

                <input
                  type="checkbox"
                  checked={
                    form.manages_lots
                  }
                  onChange={(e) =>
                    updateField(
                      "manages_lots",
                      e.target.checked
                    )
                  }
                  className="mt-1 h-5 w-5 rounded border-gray-300"
                />

                <span>
                  <span className="block text-sm font-semibold text-gray-800">
                    ¿Maneja lotes y vencimientos?
                  </span>

                  <span className="mt-1 block text-xs text-gray-500">
                    Activa esta opción si el
                    producto necesita trazabilidad
                    por número de lote y fecha de
                    vencimiento.
                  </span>
                </span>

              </label>

            </div>

          </section>

          {/* =========================================================
              LOTES Y VENCIMIENTOS
          ========================================================= */}

          {form.manages_lots && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Lotes y vencimientos
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Gestiona los lotes y las
                    fechas de vencimiento del
                    producto.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetLotForm();
                    setLotMessage("");
                    setShowLotForm(
                      true
                    );
                  }}
                  className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  + Nuevo lote
                </button>

              </div>

              {/* AVISO */}

              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">

                <p className="text-sm text-blue-800">
                  <strong>
                    Importante:
                  </strong>{" "}
                  la cantidad registrada en
                  un lote no modifica el stock
                  global del producto.
                </p>

                <p className="mt-1 text-xs text-blue-700">
                  El stock global se actualiza
                  mediante las operaciones de
                  inventario correspondientes.
                </p>

              </div>

              {/* MENSAJE */}

              {lotMessage && (
                <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  {lotMessage}
                </div>
              )}

              {/* FORMULARIO NUEVO LOTE */}

              {showLotForm && (
                <form
                  onSubmit={
                    handleCreateLot
                  }
                  className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-5"
                >

                  <div className="mb-5">
                    <h3 className="font-bold text-gray-900">
                      Nuevo lote
                    </h3>

                    <p className="mt-1 text-xs text-gray-500">
                      Registra la información
                      de trazabilidad del lote.
                    </p>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">

                    {/* NÚMERO DE LOTE */}

                    <div>
                      <label
                        htmlFor="lot_number"
                        className="text-sm font-medium text-gray-700"
                      >
                        Número de lote *
                      </label>

                      <input
                        id="lot_number"
                        required
                        value={
                          lotForm.lot_number
                        }
                        onChange={(e) =>
                          setLotForm(
                            (
                              previous
                            ) => ({
                              ...previous,
                              lot_number:
                                e.target
                                  .value,
                            })
                          )
                        }
                        placeholder="Ej. LOT-2026-001"
                        className={inputClass}
                      />
                    </div>

                    {/* CANTIDAD */}

                    <div>
                      <label
                        htmlFor="lot_quantity"
                        className="text-sm font-medium text-gray-700"
                      >
                        Cantidad
                      </label>

                      <input
                        id="lot_quantity"
                        type="number"
                        min="0"
                        step="1"
                        value={
                          lotForm.quantity
                        }
                        onChange={(e) =>
                          setLotForm(
                            (
                              previous
                            ) => ({
                              ...previous,
                              quantity:
                                e.target
                                  .value,
                            })
                          )
                        }
                        className={inputClass}
                      />
                    </div>

                    {/* FABRICACIÓN */}

                    <div>
                      <label
                        htmlFor="manufacturing_date"
                        className="text-sm font-medium text-gray-700"
                      >
                        Fecha de fabricación
                      </label>

                      <input
                        id="manufacturing_date"
                        type="date"
                        value={
                          lotForm.manufacturing_date
                        }
                        onChange={(e) =>
                          setLotForm(
                            (
                              previous
                            ) => ({
                              ...previous,
                              manufacturing_date:
                                e.target
                                  .value,
                            })
                          )
                        }
                        className={inputClass}
                      />
                    </div>

                    {/* VENCIMIENTO */}

                    <div>
                      <label
                        htmlFor="expiration_date"
                        className="text-sm font-medium text-gray-700"
                      >
                        Fecha de vencimiento
                      </label>

                      <input
                        id="expiration_date"
                        type="date"
                        value={
                          lotForm.expiration_date
                        }
                        onChange={(e) =>
                          setLotForm(
                            (
                              previous
                            ) => ({
                              ...previous,
                              expiration_date:
                                e.target
                                  .value,
                            })
                          )
                        }
                        className={inputClass}
                      />
                    </div>

                  </div>

                  {/* ACTIVO */}

                  <label className="mt-5 flex cursor-pointer items-center gap-3">

                    <input
                      type="checkbox"
                      checked={
                        lotForm.is_active
                      }
                      onChange={(e) =>
                        setLotForm(
                          (
                            previous
                          ) => ({
                            ...previous,
                            is_active:
                              e.target
                                .checked,
                          })
                        )
                      }
                      className="h-5 w-5 rounded border-gray-300"
                    />

                    <span className="text-sm font-medium text-gray-700">
                      Lote activo
                    </span>

                  </label>

                  {/* BOTONES */}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">

                    <button
                      type="submit"
                      disabled={
                        savingLot
                      }
                      className="rounded-xl bg-gray-900 px-5 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingLot
                        ? "Guardando..."
                        : "💾 Guardar lote"}
                    </button>

                    <button
                      type="button"
                      disabled={
                        savingLot
                      }
                      onClick={() => {
                        setShowLotForm(
                          false
                        );
                        resetLotForm();
                        setLotMessage("");
                      }}
                      className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      Cancelar
                    </button>

                  </div>

                </form>
              )}

              {/* LISTADO */}

              {lotsLoading ? (
                <div className="rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
                  Cargando lotes...
                </div>
              ) : lots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">

                  <div className="mb-3 text-3xl">
                    📦
                  </div>

                  <p className="font-medium text-gray-700">
                    No hay lotes registrados.
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    Puedes crear el primer
                    lote utilizando el botón
                    “+ Nuevo lote”.
                  </p>

                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">

                  <table className="w-full min-w-[850px]">

                    <thead className="bg-gray-50">

                      <tr>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Lote
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Fabricación
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Vencimiento
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Cantidad
                        </th>

                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y divide-gray-200">

                      {lots.map(
                        (lot) => {
                          const status =
                            getLotStatus(
                              lot
                            );

                          return (
                            <tr
                              key={
                                lot.id
                              }
                              className="hover:bg-gray-50"
                            >

                              <td className="px-4 py-4 font-medium text-gray-900">
                                {
                                  lot.lot_number
                                }
                              </td>

                              <td className="px-4 py-4 text-sm text-gray-600">
                                {lot.manufacturing_date
                                  ? new Date(
                                      `${lot.manufacturing_date}T00:00:00`
                                    ).toLocaleDateString(
                                      "es-CO"
                                    )
                                  : "—"}
                              </td>

                              <td className="px-4 py-4 text-sm text-gray-600">
                                {lot.expiration_date
                                  ? new Date(
                                      `${lot.expiration_date}T00:00:00`
                                    ).toLocaleDateString(
                                      "es-CO"
                                    )
                                  : "—"}
                              </td>

                              <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                                {
                                  lot.quantity
                                }
                              </td>

                              <td className="px-4 py-4">

                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
                                >
                                  {
                                    status.label
                                  }
                                </span>

                              </td>

                            </tr>
                          );
                        }
                      )}

                    </tbody>
                  </table>

                </div>
              )}

            </section>
          )}

          {/* =========================================================
              ESTADO DEL PRODUCTO
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Estado del producto
            </h2>

            <label className="flex cursor-pointer items-center gap-3">

              <input
                type="checkbox"
                checked={
                  form.is_active
                }
                onChange={(e) =>
                  updateField(
                    "is_active",
                    e.target.checked
                  )
                }
                className="h-5 w-5 rounded border-gray-300"
              />

              <span>

                <span className="block text-sm font-medium text-gray-800">
                  Producto activo
                </span>

                <span className="block text-xs text-gray-500">
                  Los productos inactivos se
                  conservan para mantener su
                  historial.
                </span>

              </span>

            </label>

          </section>

          {/* =========================================================
              IMAGEN
          ========================================================= */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-lg font-bold text-gray-900">
              Imagen
            </h2>

            <label
              htmlFor="image_url"
              className="text-sm font-medium text-gray-700"
            >
              URL de imagen
            </label>

            <input
              id="image_url"
              type="url"
              value={
                form.image_url
              }
              onChange={(e) =>
                updateField(
                  "image_url",
                  e.target.value
                )
              }
              placeholder="https://..."
              className={inputClass}
            />

          </section>

          {/* =========================================================
              MENSAJE
          ========================================================= */}

          {message && (
            <div className="rounded-xl bg-white p-4 text-sm text-gray-700 shadow-sm">
              {message}
            </div>
          )}

          {/* =========================================================
              BOTONES
          ========================================================= */}

          <div className="flex flex-col gap-3 sm:flex-row">

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gray-900 px-6 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Guardando..."
                : "💾 Guardar cambios"}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/inventario"
                )
              }
              disabled={saving}
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>

          </div>

        </form>
      </div>
    </main>
  );
}