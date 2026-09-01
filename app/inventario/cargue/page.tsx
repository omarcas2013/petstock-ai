"use client";

import Link from "next/link";
import {
  ChangeEvent,
  useMemo,
  useState,
} from "react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  stock: number;
};

type LoadItem = {
  id: string;
  sku: string;
  quantity: number;
  reason: string;
};

type PreviewItem = {
  id: string;
  sku: string;
  quantity: number;
  reason: string;
  product: Product | null;
  currentStock: number | null;
  finalStock: number | null;
  error: string | null;
};

type LoadResult = {
  sku: string;
  product_name?: string;
  stock_before?: number;
  stock_after?: number;
  error?: string;
};

export default function CargueInventarioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const [search, setSearch] = useState("");

  const [items, setItems] = useState<LoadItem[]>([]);

  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(
    "Inventario inicial"
  );

  const [fileName, setFileName] = useState("");

  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [results, setResults] = useState<LoadResult[]>([]);

  /*
   * ============================================================
   * CARGAR PRODUCTOS
   * ============================================================
   */

  async function loadProducts(): Promise<Product[]> {
    try {
      setError("");

      const response = await fetch("/api/products", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudieron cargar los productos."
        );
      }

      const loadedProducts = Array.isArray(
        result.products
      )
        ? result.products
        : [];

      setProducts(loadedProducts);
      setProductsLoaded(true);

      return loadedProducts;
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando productos."
      );

      return [];
    }
  }

  /*
   * ============================================================
   * AGREGAR PRODUCTO MANUALMENTE
   * ============================================================
   */

  function addManualItem() {
    setMessage("");
    setError("");

    const normalizedSku = sku.trim().toLowerCase();
    const numericQuantity = Number(quantity);

    if (!normalizedSku) {
      setError(
        "Debes ingresar el SKU del producto."
      );
      return;
    }

    if (
      !Number.isInteger(numericQuantity) ||
      numericQuantity < 0
    ) {
      setError(
        "La cantidad debe ser un número entero mayor o igual a 0."
      );
      return;
    }

    const existing = items.find(
      (item) =>
        item.sku.trim().toLowerCase() ===
        normalizedSku
    );

    if (existing) {
      setError(
        "Ese SKU ya está incluido en el cargue."
      );
      return;
    }

    setItems((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        sku: sku.trim(),
        quantity: numericQuantity,
        reason:
          reason.trim() ||
          "Inventario inicial",
      },
    ]);

    setSku("");
    setQuantity("");
  }

  /*
   * ============================================================
   * ELIMINAR ITEM
   * ============================================================
   */

  function removeItem(id: string) {
    setItems((previous) =>
      previous.filter(
        (item) => item.id !== id
      )
    );
  }

  /*
   * ============================================================
   * LIMPIAR
   * ============================================================
   */

  function clearItems() {
    setItems([]);
    setResults([]);
    setMessage("");
    setError("");
    setFileName("");
  }

  /*
   * ============================================================
   * PARSER CSV
   * ============================================================
   */

  function parseCsvLine(
    line: string,
    separator: string
  ): string[] {
    const values: string[] = [];

    let current = "";
    let insideQuotes = false;

    for (
      let index = 0;
      index < line.length;
      index++
    ) {
      const char = line[index];

      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (
        char === separator &&
        !insideQuotes
      ) {
        values.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current.trim());

    return values;
  }

  /*
   * ============================================================
   * CARGAR ARCHIVO
   * ============================================================
   */

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setMessage("");
    setResults([]);
    setLoadingFile(true);

    try {
      const text = await file.text();

      const lines = text
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        throw new Error(
          "El archivo está vacío."
        );
      }

      /*
       * Detectar separador.
       */

      const firstLine =
        lines[0].toLowerCase();

      const separator =
        firstLine.includes(";")
          ? ";"
          : ",";

      /*
       * Encabezados.
       */

      const headers = parseCsvLine(
        lines[0],
        separator
      ).map((header) =>
        header
          .toLowerCase()
          .trim()
          .replace(
            /^["']|["']$/g,
            ""
          )
      );

      /*
       * SKU.
       */

      const skuIndex =
        headers.findIndex(
          (header) =>
            [
              "sku",
              "codigo",
              "código",
              "codigo_producto",
              "codigo producto",
            ].includes(header)
        );

      /*
       * Cantidad.
       */

      const quantityIndex =
        headers.findIndex(
          (header) =>
            [
              "cantidad",
              "quantity",
              "stock",
              "nuevo_stock",
              "nuevo stock",
            ].includes(header)
        );

      /*
       * Motivo.
       */

      const reasonIndex =
        headers.findIndex(
          (header) =>
            [
              "motivo",
              "reason",
              "observacion",
              "observación",
            ].includes(header)
        );

      if (
        skuIndex === -1 ||
        quantityIndex === -1
      ) {
        throw new Error(
          "El archivo debe contener las columnas SKU y CANTIDAD."
        );
      }

      const parsedItems: LoadItem[] = [];
      const duplicateSkus =
        new Set<string>();

      /*
       * Leer filas.
       */

      for (
        let index = 1;
        index < lines.length;
        index++
      ) {
        const values = parseCsvLine(
          lines[index],
          separator
        );

        const rawSku =
          values[skuIndex]?.trim();

        const rawQuantity =
          values[quantityIndex]?.trim();

        const rawReason =
          reasonIndex >= 0
            ? values[
                reasonIndex
              ]?.trim()
            : "";

        if (!rawSku) {
          continue;
        }

        const numericQuantity =
          Number(rawQuantity);

        if (
          !Number.isInteger(
            numericQuantity
          ) ||
          numericQuantity < 0
        ) {
          throw new Error(
            `Cantidad inválida en la fila ${
              index + 1
            }.`
          );
        }

        const normalizedSku =
          rawSku.toLowerCase();

        if (
          duplicateSkus.has(
            normalizedSku
          )
        ) {
          throw new Error(
            `El SKU ${rawSku} aparece más de una vez en el archivo.`
          );
        }

        duplicateSkus.add(
          normalizedSku
        );

        parsedItems.push({
          id: crypto.randomUUID(),
          sku: rawSku,
          quantity:
            numericQuantity,
          reason:
            rawReason ||
            "Inventario inicial",
        });
      }

      if (
        parsedItems.length === 0
      ) {
        throw new Error(
          "No encontramos registros válidos en el archivo."
        );
      }

      setItems(parsedItems);
      setFileName(file.name);

      if (!productsLoaded) {
        await loadProducts();
      }

      setMessage(
        `Se cargaron ${parsedItems.length} registros desde ${file.name}.`
      );
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "No se pudo leer el archivo."
      );
    } finally {
      setLoadingFile(false);
      event.target.value = "";
    }
  }

  /*
   * ============================================================
   * PREVISUALIZACIÓN
   * ============================================================
   */

  const previewItems =
    useMemo<PreviewItem[]>(() => {
      return items.map((item) => {
        const normalizedSku =
          item.sku
            .trim()
            .toLowerCase();

        const product =
          products.find(
            (product) =>
              product.sku
                ?.trim()
                .toLowerCase() ===
              normalizedSku
          ) || null;

        if (!product) {
          return {
            ...item,
            product: null,
            currentStock: null,
            finalStock: null,
            error:
              "SKU no encontrado.",
          };
        }

        return {
          ...item,
          product,
          currentStock:
            Number(product.stock) || 0,
          finalStock:
            item.quantity,
          error: null,
        };
      });
    }, [items, products]);

  const validItems =
    previewItems.filter(
      (item) => !item.error
    );

  const invalidItems =
    previewItems.filter(
      (item) => item.error
    );

  /*
   * ============================================================
   * CONFIRMAR CARGUE
   * ============================================================
   */

  async function handleConfirm() {
    setMessage("");
    setError("");
    setResults([]);

    if (items.length === 0) {
      setError(
        "No hay productos para cargar."
      );
      return;
    }

    setSaving(true);

    try {
      /*
       * Asegurar productos.
       */

      let currentProducts =
        products;

      if (!productsLoaded) {
        currentProducts =
          await loadProducts();
      }

      if (
        currentProducts.length === 0
      ) {
        throw new Error(
          "No se pudieron cargar los productos para validar el inventario."
        );
      }

      /*
       * Validación actualizada.
       */

      const currentPreview: PreviewItem[] =
        items.map((item) => {
          const normalizedSku =
            item.sku
              .trim()
              .toLowerCase();

          const product =
            currentProducts.find(
              (product) =>
                product.sku
                  ?.trim()
                  .toLowerCase() ===
                normalizedSku
            ) || null;

          if (!product) {
            return {
              ...item,
              product: null,
              currentStock: null,
              finalStock: null,
              error:
                "SKU no encontrado.",
            };
          }

          return {
            ...item,
            product,
            currentStock:
              Number(product.stock) || 0,
            finalStock:
              item.quantity,
            error: null,
          };
        });

      const invalid =
        currentPreview.filter(
          (item) => item.error
        );

      if (invalid.length > 0) {
        setError(
          `Hay ${invalid.length} registro(s) con errores. Corrígelos antes de confirmar.`
        );

        return;
      }

      /*
       * Enviar al backend.
       */

      const response =
        await fetch(
          "/api/inventory/initial-load",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              items: items.map(
                (item) => ({
                  sku: item.sku,
                  quantity:
                    item.quantity,
                  reason:
                    item.reason,
                })
              ),
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo realizar el cargue."
        );
      }

      /*
       * Guardar resultados.
       */

      setResults(
        Array.isArray(
          result.results
        )
          ? result.results
          : []
      );

      /*
       * Mensaje.
       */

      setMessage(
        result.message ||
          "Inventario cargado correctamente."
      );

      /*
       * Limpiar.
       */

      setItems([]);
      setFileName("");

      /*
       * Recargar productos.
       */

      await loadProducts();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "No se pudo realizar el cargue."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ============================================================
   * FILTRAR PRODUCTOS
   * ============================================================
   */

  const filteredProducts =
    products.filter(
      (product) => {
        const text =
          search
            .trim()
            .toLowerCase();

        if (!text) {
          return true;
        }

        return (
          product.name
            .toLowerCase()
            .includes(text) ||
          product.sku
            ?.toLowerCase()
            .includes(text) ||
          product.barcode
            ?.toLowerCase()
            .includes(text)
        );
      }
    );

  /*
   * ============================================================
   * SELECCIONAR PRODUCTO
   * ============================================================
   */

  function selectProduct(
    product: Product
  ) {
    setSku(product.sku || "");
    setSearch("");
    setError("");

    if (!product.sku) {
      setError(
        "Este producto no tiene SKU. Para el cargue masivo necesitamos asignarle un SKU."
      );
    }
  }

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              PetStock AI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Cargue de inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Registra el inventario inicial o realiza
              ajustes masivos de existencias.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/inventario"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              Volver a inventario
            </Link>

            <Link
              href="/inventario/movimientos"
              className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              Ver movimientos
            </Link>
          </div>
        </div>

        {/* MENSAJES */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-semibold">
              No se pudo completar la operación
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5 text-green-700">
            <p className="font-semibold">
              Operación completada
            </p>

            <p className="mt-1 text-sm">
              {message}
            </p>
          </div>
        )}

        {/* INFORMACIÓN */}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">
            ¿Cómo funciona?
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">
                1. Selecciona los productos
              </p>

              <p className="mt-1 text-sm text-gray-600">
                Digítalos manualmente o importa un archivo.
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">
                2. Revisa la información
              </p>

              <p className="mt-1 text-sm text-gray-600">
                El sistema compara el SKU contra tu inventario.
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">
                3. Confirma el cargue
              </p>

              <p className="mt-1 text-sm text-gray-600">
                Se actualiza el stock y queda registrado el movimiento.
              </p>
            </div>
          </div>
        </section>

        {/* CARGUE MANUAL */}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              Cargue manual
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Agrega productos uno por uno utilizando su SKU.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_180px_1fr_auto]">

            {/* SKU */}

            <div className="relative">
              <label className="text-sm font-medium text-gray-700">
                SKU
              </label>

              <input
                type="text"
                value={sku}
                onChange={(event) =>
                  setSku(
                    event.target.value
                  )
                }
                placeholder="Ej. DOG-001"
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            {/* CANTIDAD */}

            <div>
              <label className="text-sm font-medium text-gray-700">
                Cantidad
              </label>

              <input
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    event.target.value
                  )
                }
                placeholder="Ej. 25"
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
              />
            </div>

            {/* MOTIVO */}

            <div>
              <label className="text-sm font-medium text-gray-700">
                Motivo
              </label>

              <input
                type="text"
                value={reason}
                onChange={(event) =>
                  setReason(
                    event.target.value
                  )
                }
                placeholder="Inventario inicial"
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
              />
            </div>

            {/* BOTÓN */}

            <div className="flex items-end">
              <button
                type="button"
                onClick={
                  addManualItem
                }
                disabled={saving}
                className="w-full rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          </div>

          {/* BUSCADOR */}

          <div className="mt-5">
            <label className="text-sm font-medium text-gray-700">
              Buscar producto para obtener el SKU
            </label>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Nombre, SKU o código de barras..."
              className="mt-2 w-full rounded-lg border border-gray-300 p-3"
            />
          </div>

          {search.trim() && (
            <div className="mt-3 max-h-60 overflow-y-auto rounded-xl border">
              {filteredProducts.length ===
              0 ? (
                <div className="p-4 text-sm text-gray-500">
                  No encontramos productos.
                </div>
              ) : (
                filteredProducts.map(
                  (product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() =>
                        selectProduct(
                          product
                        )
                      }
                      className="flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {product.name}
                        </p>

                        <p className="mt-1 font-mono text-xs text-gray-500">
                          SKU:{" "}
                          {product.sku ||
                            "Sin SKU"}
                        </p>
                      </div>

                      <span className="text-sm text-gray-500">
                        Stock:{" "}
                        {product.stock}
                      </span>
                    </button>
                  )
                )
              )}
            </div>
          )}
        </section>

        {/* ARCHIVO */}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              Cargar archivo
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Importa múltiples productos desde un archivo CSV o TXT.
            </p>
          </div>

          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <p className="text-lg font-semibold text-gray-900">
              Selecciona tu archivo
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Formatos recomendados: CSV o TXT
            </p>

            <label className="mt-5 inline-flex cursor-pointer rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800">
              {loadingFile
                ? "Leyendo archivo..."
                : "Seleccionar archivo"}

              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={
                  handleFile
                }
                disabled={
                  loadingFile ||
                  saving
                }
                className="hidden"
              />
            </label>

            {fileName && (
              <p className="mt-4 text-sm text-gray-600">
                Archivo seleccionado:{" "}
                <span className="font-medium">
                  {fileName}
                </span>
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl bg-gray-900 p-5 text-sm text-gray-100">
            <p className="font-semibold">
              Formato esperado
            </p>

            <pre className="mt-3 overflow-x-auto text-xs">
{`sku,cantidad,motivo
DOG-001,25,Inventario inicial
CAT-002,40,Inventario inicial
DOG-003,12,Conteo físico`}
            </pre>

            <p className="mt-4 text-gray-300">
              También puedes utilizar punto y coma como separador.
            </p>

            <p className="mt-2 text-gray-300">
              La cantidad representa el stock final del producto.
            </p>
          </div>
        </section>

        {/* PREVISUALIZACIÓN */}

        <section className="mb-6 rounded-2xl bg-white shadow-sm">
          <div className="border-b px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Vista previa
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Revisa los productos antes de modificar el inventario.
                </p>
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={
                    clearItems
                  }
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl">
                📦
              </div>

              <p className="mt-4 font-medium text-gray-700">
                No hay productos preparados.
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Agrega productos manualmente o carga un archivo.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="border-b bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
                      <th className="px-5 py-4 font-medium">
                        SKU
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Producto
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Stock actual
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Nuevo stock
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Motivo
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Estado
                      </th>

                      <th className="px-5 py-4 text-right font-medium">
                        Acción
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {previewItems.map(
                      (item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-5 py-4 font-mono text-sm">
                            {item.sku}
                          </td>

                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-900">
                              {item.product?.name ||
                                "Producto no encontrado"}
                            </p>
                          </td>

                          <td className="px-5 py-4 text-right font-medium">
                            {item.currentStock ??
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-right font-bold">
                            {item.finalStock ??
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-sm text-gray-600">
                            {item.reason}
                          </td>

                          <td className="px-5 py-4">
                            {item.error ? (
                              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                                {item.error}
                              </span>
                            ) : (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                                Válido
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                removeItem(
                                  item.id
                                )
                              }
                              disabled={saving}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* RESUMEN */}

              <div className="border-t bg-gray-50 px-6 py-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-gray-500">
                      Productos
                    </p>

                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {items.length}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">
                      Válidos
                    </p>

                    <p className="mt-1 text-2xl font-bold text-green-600">
                      {validItems.length}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">
                      Con errores
                    </p>

                    <p className="mt-1 text-2xl font-bold text-red-600">
                      {invalidItems.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* CONFIRMAR */}

              <div className="border-t px-6 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      ¿Todo está correcto?
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Al confirmar se actualizará el stock
                      y se registrará un movimiento por cada
                      producto.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      handleConfirm
                    }
                    disabled={
                      saving ||
                      items.length === 0 ||
                      invalidItems.length > 0
                    }
                    className="rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Procesando..."
                      : "Confirmar cargue"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* RESULTADOS */}

        {results.length > 0 && (
          <section className="mb-6 rounded-2xl bg-white shadow-sm">
            <div className="border-b px-6 py-5">
              <h2 className="text-xl font-bold text-gray-900">
                Resultado del cargue
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Estos son los productos que fueron actualizados.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="border-b bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-5 py-4 font-medium">
                      SKU
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Producto
                    </th>

                    <th className="px-5 py-4 text-right font-medium">
                      Stock anterior
                    </th>

                    <th className="px-5 py-4 text-right font-medium">
                      Stock nuevo
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {results.map(
                    (result, index) => (
                      <tr
                        key={`${result.sku}-${index}`}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-5 py-4 font-mono text-sm">
                          {result.sku}
                        </td>

                        <td className="px-5 py-4 font-medium text-gray-900">
                          {result.product_name ||
                            "—"}
                        </td>

                        <td className="px-5 py-4 text-right">
                          {result.stock_before ??
                            "—"}
                        </td>

                        <td className="px-5 py-4 text-right font-bold">
                          {result.stock_after ??
                            "—"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* AYUDA */}

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Importante
          </h2>

          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            <li>
              • El SKU debe coincidir con un producto
              existente.
            </li>

            <li>
              • La cantidad representa el{" "}
              <strong>stock final</strong>, no una cantidad
              que se suma al stock actual.
            </li>

            <li>
              • Un SKU no puede aparecer más de una vez
              en el mismo cargue.
            </li>

            <li>
              • Los movimientos quedan registrados en
              el historial de inventario.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}