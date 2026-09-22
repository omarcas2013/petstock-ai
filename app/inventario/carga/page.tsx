"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  stock: number;
};

type ImportRow = {
  row: number;
  sku: string;
  barcode: string;
  name: string;
  quantity: string;
  reason: string;
};

type PreviewRow = {
  row: number;
  product: Product | null;
  sku: string;
  barcode: string;
  quantity: number | null;
  reason: string;
  error: string | null;
};

export default function InventarioCargaPage() {
  const [mode, setMode] =
    useState<"manual" | "archivo">("manual");

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loadingProducts, setLoadingProducts] =
    useState(false);

  const [productsError, setProductsError] =
    useState("");

  const [search, setSearch] = useState("");

  const [selectedProducts, setSelectedProducts] =
    useState<Product[]>([]);

  const [quantities, setQuantities] =
    useState<Record<string, string>>({});

  const [reasons, setReasons] =
    useState<Record<string, string>>({});

  const [fileName, setFileName] = useState("");

  const [importRows, setImportRows] =
    useState<ImportRow[]>([]);

  const [previewRows, setPreviewRows] =
    useState<PreviewRow[]>([]);

  const [previewOpen, setPreviewOpen] =
    useState(false);

  const [globalReason, setGlobalReason] =
    useState("Inventario inicial");

  const [message, setMessage] = useState("");

  const [applying, setApplying] =
    useState(false);

  function formatNumber(value: number) {
    return new Intl.NumberFormat("es-CO").format(
      value
    );
  }

  async function loadProducts() {
    try {
      setLoadingProducts(true);
      setProductsError("");

      const response = await fetch(
        "/api/products"
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudieron cargar los productos."
        );
      }

      setProducts(result.products || []);
    } catch (error) {
      console.error(error);

      setProductsError(
        error instanceof Error
          ? error.message
          : "Error cargando productos."
      );
    } finally {
      setLoadingProducts(false);
    }
  }

  async function initializeManualMode() {
    if (products.length > 0) {
      return;
    }

    await loadProducts();
  }

  function selectProduct(product: Product) {
    setMessage("");

    const exists = selectedProducts.some(
      (item) => item.id === product.id
    );

    if (exists) {
      return;
    }

    setSelectedProducts((previous) => [
      ...previous,
      product,
    ]);

    setQuantities((previous) => ({
      ...previous,
      [product.id]: String(product.stock),
    }));

    setReasons((previous) => ({
      ...previous,
      [product.id]: globalReason,
    }));
  }

  function removeProduct(productId: string) {
    setSelectedProducts((previous) =>
      previous.filter(
        (product) => product.id !== productId
      )
    );

    setQuantities((previous) => {
      const copy = { ...previous };

      delete copy[productId];

      return copy;
    });

    setReasons((previous) => {
      const copy = { ...previous };

      delete copy[productId];

      return copy;
    });
  }

  function updateQuantity(
    productId: string,
    value: string
  ) {
    setQuantities((previous) => ({
      ...previous,
      [productId]: value,
    }));
  }

  function updateReason(
    productId: string,
    value: string
  ) {
    setReasons((previous) => ({
      ...previous,
      [productId]: value,
    }));
  }

  function applyGlobalReason() {
    setReasons((previous) => {
      const updated = { ...previous };

      selectedProducts.forEach((product) => {
        updated[product.id] = globalReason;
      });

      return updated;
    });
  }

  const filteredProducts = useMemo(() => {
    const text = search
      .trim()
      .toLowerCase();

    if (!text) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name
          ?.toLowerCase()
          .includes(text) ||
        product.sku
          ?.toLowerCase()
          .includes(text) ||
        product.barcode
          ?.toLowerCase()
          .includes(text) ||
        product.brand
          ?.toLowerCase()
          .includes(text) ||
        product.category
          ?.toLowerCase()
          .includes(text)
      );
    });
  }, [products, search]);

  function validateManualRows(): PreviewRow[] {
    return selectedProducts.map(
      (product, index) => {
        const rawQuantity =
          quantities[product.id] ?? "";

        const quantity = Number(
          rawQuantity
        );

        let error: string | null = null;

        if (!product.sku) {
          error =
            "Este producto no tiene SKU y no puede ser enviado al cargue.";
        } else if (
          rawQuantity === "" ||
          !Number.isInteger(quantity)
        ) {
          error =
            "La cantidad debe ser un número entero.";
        } else if (quantity < 0) {
          error =
            "La cantidad no puede ser negativa.";
        }

        return {
          row: index + 1,
          product,
          sku: product.sku || "",
          barcode: product.barcode || "",
          quantity:
            error === null
              ? quantity
              : null,
          reason:
            reasons[product.id] ||
            globalReason,
          error,
        };
      }
    );
  }

  function generateManualPreview() {
    setMessage("");

    if (selectedProducts.length === 0) {
      setMessage(
        "Selecciona al menos un producto."
      );
      return;
    }

    const rows =
      validateManualRows();

    setPreviewRows(rows);
    setPreviewOpen(true);
  }

  function parseCsvLine(line: string) {
    const result: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (
      let index = 0;
      index < line.length;
      index++
    ) {
      const character = line[index];

      if (character === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (
        character === "," &&
        !insideQuotes
      ) {
        result.push(
          current.trim()
        );

        current = "";

        continue;
      }

      current += character;
    }

    result.push(current.trim());

    return result;
  }

  function parseCsv(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error(
        "El archivo no contiene registros."
      );
    }

    const headers =
      parseCsvLine(lines[0]).map(
        (header) =>
          header
            .toLowerCase()
            .trim()
      );

    const skuIndex =
      headers.indexOf("sku");

    const barcodeIndex =
      headers.indexOf("barcode");

    const nameIndex =
      headers.indexOf("nombre");

    const quantityIndex =
      headers.indexOf("cantidad");

    const reasonIndex =
      headers.indexOf("motivo");

    if (
      skuIndex === -1 &&
      barcodeIndex === -1 &&
      nameIndex === -1
    ) {
      throw new Error(
        "El archivo debe contener al menos una columna: sku, barcode o nombre."
      );
    }

    if (quantityIndex === -1) {
      throw new Error(
        "El archivo debe contener la columna cantidad."
      );
    }

    return lines
      .slice(1)
      .map((line, index) => {
        const columns =
          parseCsvLine(line);

        return {
          row: index + 2,

          sku:
            skuIndex >= 0
              ? columns[skuIndex] || ""
              : "",

          barcode:
            barcodeIndex >= 0
              ? columns[barcodeIndex] || ""
              : "",

          name:
            nameIndex >= 0
              ? columns[nameIndex] || ""
              : "",

          quantity:
            columns[quantityIndex] || "",

          reason:
            reasonIndex >= 0
              ? columns[reasonIndex] ||
                globalReason
              : globalReason,
        };
      });
  }

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setMessage("");
    setPreviewRows([]);

    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);

    try {
      const text =
        await file.text();

      const rows =
        parseCsv(text);

      setImportRows(rows);

      if (products.length === 0) {
        await loadProducts();
      }
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo leer el archivo."
      );
    }
  }

  function findProductForImport(
    row: ImportRow
  ) {
    const sku =
      row.sku.trim().toLowerCase();

    const barcode =
      row.barcode.trim();

    const name =
      row.name.trim().toLowerCase();

    if (sku) {
      const product =
        products.find(
          (item) =>
            item.sku
              ?.toLowerCase() ===
            sku
        );

      if (product) {
        return product;
      }
    }

    if (barcode) {
      const product =
        products.find(
          (item) =>
            item.barcode ===
            barcode
        );

      if (product) {
        return product;
      }
    }

    if (name) {
      const product =
        products.find(
          (item) =>
            item.name
              .toLowerCase() ===
            name
        );

      if (product) {
        return product;
      }
    }

    return null;
  }

  function generateFilePreview() {
    setMessage("");

    if (importRows.length === 0) {
      setMessage(
        "Selecciona un archivo CSV."
      );
      return;
    }

    const rows: PreviewRow[] =
      importRows.map((row) => {
        const product =
          findProductForImport(row);

        let error: string | null = null;

        if (!product) {
          error =
            "No se encontró el producto.";
        } else if (!product.sku) {
          error =
            "El producto encontrado no tiene SKU.";
        }

        const quantity =
          Number(row.quantity);

        if (
          row.quantity === "" ||
          !Number.isInteger(quantity)
        ) {
          error =
            "La cantidad debe ser un número entero.";
        } else if (quantity < 0) {
          error =
            "La cantidad no puede ser negativa.";
        }

        return {
          row: row.row,

          product,

          sku:
            row.sku ||
            product?.sku ||
            "",

          barcode:
            row.barcode ||
            product?.barcode ||
            "",

          quantity:
            error === null
              ? quantity
              : null,

          reason:
            row.reason ||
            globalReason,

          error,
        };
      });

    setPreviewRows(rows);
    setPreviewOpen(true);
  }

  const validPreviewRows =
    previewRows.filter(
      (row) =>
        row.product &&
        row.quantity !== null &&
        !row.error
    );

  const invalidPreviewRows =
    previewRows.filter(
      (row) => row.error
    );

  const totalCurrentStock =
    validPreviewRows.reduce(
      (sum, row) =>
        sum +
        (row.product?.stock || 0),
      0
    );

  const totalNewStock =
    validPreviewRows.reduce(
      (sum, row) =>
        sum +
        (row.quantity || 0),
      0
    );

  const totalDifference =
    totalNewStock -
    totalCurrentStock;

  function closePreview() {
    if (applying) {
      return;
    }

    setPreviewOpen(false);
  }

  async function handleApply() {
    if (applying) {
      return;
    }

    setMessage("");

    if (validPreviewRows.length === 0) {
      setMessage(
        "No hay productos válidos para aplicar."
      );
      return;
    }

    if (invalidPreviewRows.length > 0) {
      setMessage(
        "Corrige los errores antes de aplicar el ajuste."
      );
      return;
    }

    try {
      setApplying(true);

      const items = validPreviewRows.map(
        (row) => ({
          sku:
            row.product?.sku ||
            row.sku,

          quantity:
            row.quantity,

          reason:
            row.reason ||
            globalReason ||
            "Inventario inicial",
        })
      );

      const response = await fetch(
        "/api/inventory/initial-load",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            items,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        const details =
          Array.isArray(
            result.details
          )
            ? ` ${result.details.join(
                " "
              )}`
            : "";

        throw new Error(
          `${
            result.error ||
            "No se pudo aplicar el inventario."
          }${details}`
        );
      }

      setPreviewOpen(false);

      setSelectedProducts([]);

      setQuantities({});

      setReasons({});

      setPreviewRows([]);

      setImportRows([]);

      setFileName("");

      setSearch("");

      setMessage(
        result.message ||
          `Inventario actualizado correctamente. ${items.length} producto(s) procesado(s).`
      );

      await loadProducts();
    } catch (error) {
      console.error(
        "Error aplicando inventario:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo aplicar el inventario."
      );
    } finally {
      setApplying(false);
    }
  }

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
              Carga y ajuste de inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Carga el inventario inicial o ajusta
              múltiples productos de forma rápida.
            </p>
          </div>

          <Link
            href="/inventario"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Volver al inventario
          </Link>

        </div>

        {/* MENSAJE */}

        {message && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-gray-700 shadow-sm">
            {message}
          </div>
        )}

        {/* MODO */}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">

          <h2 className="text-xl font-bold text-gray-900">
            ¿Cómo quieres cargar el inventario?
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Puedes digitar los productos manualmente
            o importar un archivo CSV.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">

            <button
              type="button"
              onClick={() => {
                setMode("manual");
                setMessage("");
                void initializeManualMode();
              }}
              className={`rounded-xl border p-5 text-left transition ${
                mode === "manual"
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="text-lg font-semibold text-gray-900">
                ✏️ Carga manual
              </div>

              <p className="mt-2 text-sm text-gray-500">
                Selecciona productos y establece
                las cantidades directamente.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("archivo");
                setMessage("");
              }}
              className={`rounded-xl border p-5 text-left transition ${
                mode === "archivo"
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="text-lg font-semibold text-gray-900">
                📄 Importar archivo CSV
              </div>

              <p className="mt-2 text-sm text-gray-500">
                Carga cientos de productos desde
                un archivo plano.
              </p>
            </button>

          </div>

        </section>

        {/* MOTIVO GENERAL */}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">

            <div>
              <label className="text-sm font-medium text-gray-700">
                Motivo general
              </label>

              <input
                type="text"
                value={globalReason}
                onChange={(event) =>
                  setGlobalReason(
                    event.target.value
                  )
                }
                placeholder="Ej. Inventario inicial"
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            {mode === "manual" && (
              <button
                type="button"
                onClick={applyGlobalReason}
                className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Aplicar a todos
              </button>
            )}

          </div>

        </section>

        {/* CARGA MANUAL */}

        {mode === "manual" && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                Seleccionar productos
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Busca un producto y agrégalo al
                documento de ajuste.
              </p>
            </div>

            {productsError && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                {productsError}
              </div>
            )}

            <div className="mb-5">
              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Buscar por nombre, SKU o código de barras..."
                className="w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            {loadingProducts ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500">
                Cargando productos...
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">

                {filteredProducts
                  .slice(0, 30)
                  .map((product) => {
                    const selected =
                      selectedProducts.some(
                        (item) =>
                          item.id ===
                          product.id
                      );

                    return (
                      <button
                        key={product.id}
                        type="button"
                        disabled={selected}
                        onClick={() =>
                          selectProduct(
                            product
                          )
                        }
                        className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div>
                            <p className="font-semibold text-gray-900">
                              {product.name}
                            </p>

                            {product.brand && (
                              <p className="mt-1 text-sm text-gray-500">
                                {product.brand}
                              </p>
                            )}
                          </div>

                          {selected && (
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                              Agregado
                            </span>
                          )}

                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">

                          {product.sku && (
                            <span className="rounded bg-gray-100 px-2 py-1 font-mono">
                              SKU: {product.sku}
                            </span>
                          )}

                          {product.barcode && (
                            <span className="rounded bg-gray-100 px-2 py-1 font-mono">
                              {product.barcode}
                            </span>
                          )}

                        </div>

                        <div className="mt-3 text-sm text-gray-600">
                          Stock actual:{" "}
                          <span className="font-semibold text-gray-900">
                            {formatNumber(
                              product.stock
                            )}
                          </span>
                        </div>

                      </button>
                    );
                  })}

                {filteredProducts.length === 0 && (
                  <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500 md:col-span-2 xl:col-span-3">
                    No encontramos productos.
                  </div>
                )}

              </div>
            )}

            {/* PRODUCTOS SELECCIONADOS */}

            <div className="mt-8 border-t pt-6">

              <div className="mb-4 flex items-center justify-between">

                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Productos seleccionados
                  </h3>

                  <p className="text-sm text-gray-500">
                    {selectedProducts.length} producto(s)
                  </p>
                </div>

              </div>

              {selectedProducts.length ===
              0 ? (
                <div className="rounded-xl bg-gray-50 p-8 text-center">

                  <p className="font-medium text-gray-700">
                    Todavía no has seleccionado productos.
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    Utiliza el buscador de arriba.
                  </p>

                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">

                  <table className="w-full min-w-[850px]">

                    <thead className="bg-gray-50">

                      <tr className="text-left text-sm text-gray-500">

                        <th className="px-4 py-3 font-medium">
                          Producto
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Stock actual
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Nuevo stock
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Motivo
                        </th>

                        <th className="px-4 py-3 text-right font-medium">
                          Acción
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y">

                      {selectedProducts.map(
                        (product) => (
                          <tr key={product.id}>

                            <td className="px-4 py-4">

                              <div className="font-medium text-gray-900">
                                {product.name}
                              </div>

                              <div className="mt-1 text-xs text-gray-500">
                                {product.sku ||
                                  product.barcode ||
                                  "Sin identificador"}
                              </div>

                            </td>

                            <td className="px-4 py-4 font-semibold">
                              {formatNumber(
                                product.stock
                              )}
                            </td>

                            <td className="px-4 py-4">

                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={
                                  quantities[
                                    product.id
                                  ] ?? ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateQuantity(
                                    product.id,
                                    event.target
                                      .value
                                  )
                                }
                                className="w-32 rounded-lg border border-gray-300 p-2 outline-none focus:border-gray-500"
                              />

                            </td>

                            <td className="px-4 py-4">

                              <input
                                type="text"
                                value={
                                  reasons[
                                    product.id
                                  ] ??
                                  globalReason
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateReason(
                                    product.id,
                                    event.target
                                      .value
                                  )
                                }
                                className="w-64 rounded-lg border border-gray-300 p-2 outline-none focus:border-gray-500"
                              />

                            </td>

                            <td className="px-4 py-4 text-right">

                              <button
                                type="button"
                                onClick={() =>
                                  removeProduct(
                                    product.id
                                  )
                                }
                                className="text-sm font-medium text-red-600 hover:text-red-700"
                              >
                                Quitar
                              </button>

                            </td>

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>
              )}

              {selectedProducts.length >
                0 && (
                <div className="mt-6 flex justify-end">

                  <button
                    type="button"
                    onClick={
                      generateManualPreview
                    }
                    className="rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800"
                  >
                    Revisar carga
                  </button>

                </div>
              )}

            </div>

          </section>
        )}

        {/* ARCHIVO */}

        {mode === "archivo" && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold text-gray-900">
              Importar archivo CSV
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              El archivo debe contener una columna
              de identificación y una columna
              llamada <strong>cantidad</strong>.
            </p>

            <div className="mt-6 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-center">

              <div className="text-4xl">
                📄
              </div>

              <p className="mt-3 font-medium text-gray-800">
                Selecciona tu archivo CSV
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Puedes identificar productos mediante
                SKU, barcode o nombre.
              </p>

              <label className="mt-5 inline-flex cursor-pointer rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800">

                Seleccionar archivo

                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={
                    handleFile
                  }
                  className="hidden"
                />

              </label>

              {fileName && (
                <p className="mt-4 text-sm font-medium text-gray-700">
                  Archivo seleccionado:{" "}
                  {fileName}
                </p>
              )}

            </div>

            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">

              <h3 className="font-semibold text-gray-900">
                Formato esperado
              </h3>

              <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-4 text-left text-sm text-gray-100">
{`sku,barcode,nombre,cantidad,motivo
DOG-001,7701234567890,Concentrado Adulto,20,Inventario inicial
CAT-002,7701234567891,Alimento Gato,15,Inventario inicial`}
              </pre>

              <p className="mt-3 text-sm text-gray-500">
                No es obligatorio utilizar todas las
                columnas. Para identificar un producto
                basta con SKU, barcode o nombre.
              </p>

            </div>

            {importRows.length > 0 && (
              <div className="mt-6">

                <div className="mb-4 flex items-center justify-between">

                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Registros encontrados
                    </h3>

                    <p className="text-sm text-gray-500">
                      {importRows.length} registro(s)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      generateFilePreview
                    }
                    className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
                  >
                    Revisar archivo
                  </button>

                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">

                  <table className="w-full min-w-[700px]">

                    <thead className="bg-gray-50">

                      <tr className="text-left text-sm text-gray-500">

                        <th className="px-4 py-3 font-medium">
                          Línea
                        </th>

                        <th className="px-4 py-3 font-medium">
                          SKU
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Barcode
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Nombre
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Cantidad
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y">

                      {importRows
                        .slice(0, 50)
                        .map((row) => (
                          <tr key={row.row}>

                            <td className="px-4 py-3 text-sm text-gray-500">
                              {row.row}
                            </td>

                            <td className="px-4 py-3 font-mono text-sm">
                              {row.sku || "—"}
                            </td>

                            <td className="px-4 py-3 font-mono text-sm">
                              {row.barcode || "—"}
                            </td>

                            <td className="px-4 py-3">
                              {row.name || "—"}
                            </td>

                            <td className="px-4 py-3 font-semibold">
                              {row.quantity}
                            </td>

                          </tr>
                        ))}

                    </tbody>

                  </table>

                </div>

                {importRows.length >
                  50 && (
                  <p className="mt-3 text-sm text-gray-500">
                    Mostrando los primeros 50
                    registros. El archivo contiene{" "}
                    {importRows.length} registros.
                  </p>
                )}

              </div>
            )}

          </section>
        )}

        {/* PREVIEW / MODAL */}

        {previewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

            <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-xl">

              {/* CABECERA DEL MODAL */}

              <div className="sticky top-0 border-b bg-white px-6 py-5">

                <div className="flex items-start justify-between gap-4">

                  <div>
                    <p className="text-sm text-gray-500">
                      Vista previa
                    </p>

                    <h2 className="mt-1 text-2xl font-bold text-gray-900">
                      Revisar ajuste de inventario
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Verifica los cambios antes de
                      aplicarlos.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      closePreview
                    }
                    disabled={applying}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cerrar
                  </button>

                </div>

              </div>

              {/* RESUMEN */}

              <div className="grid gap-4 p-6 md:grid-cols-4">

                <div className="rounded-xl bg-gray-50 p-4">

                  <p className="text-sm text-gray-500">
                    Registros
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {previewRows.length}
                  </p>

                </div>

                <div className="rounded-xl bg-green-50 p-4">

                  <p className="text-sm text-green-700">
                    Válidos
                  </p>

                  <p className="mt-1 text-2xl font-bold text-green-800">
                    {validPreviewRows.length}
                  </p>

                </div>

                <div className="rounded-xl bg-red-50 p-4">

                  <p className="text-sm text-red-700">
                    Con errores
                  </p>

                  <p className="mt-1 text-2xl font-bold text-red-800">
                    {invalidPreviewRows.length}
                  </p>

                </div>

                <div className="rounded-xl bg-blue-50 p-4">

                  <p className="text-sm text-blue-700">
                    Diferencia
                  </p>

                  <p className="mt-1 text-2xl font-bold text-blue-800">
                    {totalDifference >=
                    0
                      ? "+"
                      : ""}
                    {formatNumber(
                      totalDifference
                    )}
                  </p>

                </div>

              </div>

              {/* TABLA DEL MODAL */}

              <div className="px-6 pb-6">

                <div className="overflow-x-auto rounded-xl border border-gray-200">

                  <table className="w-full min-w-[1000px]">

                    <thead className="bg-gray-50">

                      <tr className="text-left text-sm text-gray-500">

                        <th className="px-4 py-3 font-medium">
                          Línea
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Producto
                        </th>

                        <th className="px-4 py-3 font-medium">
                          SKU
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Actual
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Nuevo
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Diferencia
                        </th>

                        <th className="px-4 py-3 font-medium">
                          Estado
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y">

                      {previewRows.map(
                        (row) => {
                          const current =
                            row.product
                              ?.stock ??
                            0;

                          const difference =
                            row.quantity !==
                            null
                              ? row.quantity -
                                current
                              : null;

                          return (
                            <tr
                              key={`${row.row}-${row.sku}-${row.barcode}`}
                            >

                              <td className="px-4 py-4 text-sm text-gray-500">
                                {row.row}
                              </td>

                              <td className="px-4 py-4">

                                <p className="font-medium text-gray-900">
                                  {row.product
                                    ?.name ||
                                    "Producto no encontrado"}
                                </p>

                                {row.error && (
                                  <p className="mt-1 text-sm text-red-600">
                                    {row.error}
                                  </p>
                                )}

                              </td>

                              <td className="px-4 py-4 font-mono text-sm">
                                {row.sku ||
                                  row.barcode ||
                                  "—"}
                              </td>

                              <td className="px-4 py-4 font-semibold">
                                {row.product
                                  ? formatNumber(
                                      current
                                    )
                                  : "—"}
                              </td>

                              <td className="px-4 py-4 font-semibold">
                                {row.quantity !==
                                null
                                  ? formatNumber(
                                      row.quantity
                                    )
                                  : "—"}
                              </td>

                              <td className="px-4 py-4">

                                {difference !==
                                null ? (
                                  <span
                                    className={
                                      difference >
                                      0
                                        ? "font-semibold text-green-700"
                                        : difference <
                                          0
                                        ? "font-semibold text-red-700"
                                        : "font-semibold text-gray-500"
                                    }
                                  >
                                    {difference >
                                    0
                                      ? "+"
                                      : ""}
                                    {formatNumber(
                                      difference
                                    )}
                                  </span>
                                ) : (
                                  "—"
                                )}

                              </td>

                              <td className="px-4 py-4">

                                {row.error ? (
                                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                                    Error
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                                    Listo
                                  </span>
                                )}

                              </td>

                            </tr>
                          );
                        }
                      )}

                    </tbody>

                  </table>

                </div>

              </div>

              {/* FOOTER DEL MODAL */}

              <div className="sticky bottom-0 border-t bg-white px-6 py-5">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                  <div className="text-sm text-gray-600">

                    <p>
                      Stock actual total:{" "}
                      <strong>
                        {formatNumber(
                          totalCurrentStock
                        )}
                      </strong>
                    </p>

                    <p className="mt-1">
                      Stock nuevo total:{" "}
                      <strong>
                        {formatNumber(
                          totalNewStock
                        )}
                      </strong>
                    </p>

                  </div>

                  <div className="flex gap-3">

                    <button
                      type="button"
                      onClick={
                        closePreview
                      }
                      disabled={applying}
                      className="rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Volver
                    </button>

                    <button
                      type="button"
                      disabled={
                        applying ||
                        validPreviewRows.length ===
                          0 ||
                        invalidPreviewRows.length >
                          0
                      }
                      onClick={
                        handleApply
                      }
                      className="rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applying
                        ? "Aplicando..."
                        : "Aplicar ajuste"}
                    </button>

                  </div>

                </div>

              </div>

            </div>

          </div>
        )}

      </div>
    </main>
  );
}