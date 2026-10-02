"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  detectCsvDelimiter,
  parseEsCoInteger,
} from "@/lib/quantity";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  suppliers: {
    id: string;
    name: string;
  } | null;
  pet_type: string | null;
  presentation: string | null;
  sku: string | null;
  barcode?: string | null;
  purchase_price: number;
  sale_price: number;
  stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
  created_at: string;
};

type MovementType = "entrada" | "salida" | "ajuste";

type Movement = {
  id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  reason: string | null;
  created_at: string;
  stock_before: number | null;
  stock_after: number | null;
  products:
    | {
        name: string;
        sku: string | null;
      }
    | null;
};

type InitialInventoryItem = {
  productId: string;
  quantity: string;
};

type FileInventoryRow = {
  identifier: string;
  quantity: number;
};

export default function InventarioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  // "Compras" no es una acción de employee (matriz de roles):
  // se oculta el enlace mientras no sepamos el rol, para no
  // mostrarlo un instante y quitarlo enseguida.
  const [canSeePurchases, setCanSeePurchases] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  const [error, setError] = useState("");
  const [movementError, setMovementError] = useState("");

  const [search, setSearch] = useState("");

  /*
   * =====================================================
   * MOVIMIENTO INDIVIDUAL
   * =====================================================
   */

  const [movementOpen, setMovementOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null);

  const [movementType, setMovementType] =
    useState<MovementType>("entrada");

  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const [movementLoading, setMovementLoading] = useState(false);

  const [movementMessage, setMovementMessage] = useState("");

  /*
   * =====================================================
   * INVENTARIO INICIAL
   * =====================================================
   */

  const [
    initialInventoryOpen,
    setInitialInventoryOpen,
  ] = useState(false);

  const [
    initialInventorySearch,
    setInitialInventorySearch,
  ] = useState("");

  const [
    initialInventoryItems,
    setInitialInventoryItems,
  ] = useState<InitialInventoryItem[]>([]);

  const [
    initialInventoryLoading,
    setInitialInventoryLoading,
  ] = useState(false);

  const [
    initialInventoryMessage,
    setInitialInventoryMessage,
  ] = useState("");

  /*
   * =====================================================
   * ARCHIVO
   * =====================================================
   */

  const [fileLoading, setFileLoading] = useState(false);
  const [fileMessage, setFileMessage] = useState("");

  /*
   * =====================================================
   * CARGAR PRODUCTOS
   * =====================================================
   */

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/products");

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando productos."
        );
      }

      setProducts(result.products || []);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando inventario."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * =====================================================
   * CARGAR MOVIMIENTOS
   * =====================================================
   */

  async function loadMovements() {
    try {
      setLoadingMovements(true);
      setMovementError("");

      const response = await fetch(
        "/api/inventory/movements"
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando movimientos."
        );
      }

      setMovements(result.movements || []);
    } catch (error) {
      console.error(error);

      setMovementError(
        error instanceof Error
          ? error.message
          : "Error cargando movimientos."
      );
    } finally {
      setLoadingMovements(false);
    }
  }

  async function loadRole() {
    try {
      const supabase = createClient();

      const { data: role } = await supabase.rpc(
        "get_my_role"
      );

      setCanSeePurchases(
        role === "owner" ||
          role === "admin" ||
          role === "manager"
      );
    } catch (error) {
      console.error(
        "Error obteniendo el rol del usuario:",
        error
      );
    }
  }

  /*
   * =====================================================
   * CARGA INICIAL
   * =====================================================
   */

  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        loadProducts(),
        loadMovements(),
        loadRole(),
      ]);
    };

    void loadInitialData();
  }, []);

  /*
   * =====================================================
   * MOVIMIENTO INDIVIDUAL
   * =====================================================
   */

  function openMovement(product: Product) {
    setSelectedProduct(product);
    setMovementType("entrada");
    setQuantity("");
    setReason("");
    setMovementMessage("");
    setMovementOpen(true);
  }

  function closeMovement() {
    if (movementLoading) {
      return;
    }

    setMovementOpen(false);
    setSelectedProduct(null);
    setQuantity("");
    setReason("");
    setMovementMessage("");
  }

  async function handleMovement() {
    if (!selectedProduct) {
      return;
    }

    const numericQuantity = Number(quantity);

    const invalidQuantity =
      movementType === "ajuste"
        ? quantity === "" ||
          !Number.isInteger(numericQuantity) ||
          numericQuantity < 0
        : !Number.isInteger(numericQuantity) ||
          numericQuantity <= 0;

    if (invalidQuantity) {
      setMovementMessage(
        movementType === "ajuste"
          ? "El nuevo stock debe ser un número entero mayor o igual a 0."
          : "La cantidad debe ser un número entero mayor que 0."
      );

      return;
    }

    if (
      movementType === "salida" &&
      numericQuantity > selectedProduct.stock
    ) {
      setMovementMessage(
        `Stock insuficiente. Disponible: ${selectedProduct.stock}.`
      );

      return;
    }

    setMovementLoading(true);
    setMovementMessage("");

    try {
      const response = await fetch(
        "/api/inventory/movements",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id: selectedProduct.id,
            movement_type: movementType,
            quantity: numericQuantity,
            reason: reason.trim() || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error registrando movimiento."
        );
      }

      const movement = result.movement;

      setMovementMessage(
        movement?.stock_before !== undefined
          ? `Movimiento registrado correctamente. Stock: ${movement.stock_before} → ${movement.stock_after}`
          : "Movimiento registrado correctamente."
      );

      await Promise.all([
        loadProducts(),
        loadMovements(),
      ]);

      // El botón sigue deshabilitado hasta que se cierre
      // el modal, para que un segundo clic no registre
      // el mismo movimiento dos veces.
      window.setTimeout(() => {
        setMovementLoading(false);
        setMovementOpen(false);
        setSelectedProduct(null);
        setQuantity("");
        setReason("");
        setMovementMessage("");
      }, 1000);
    } catch (error) {
      console.error(error);

      setMovementMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el movimiento."
      );

      setMovementLoading(false);
    }
  }

  /*
   * =====================================================
   * PRODUCTOS FILTRADOS
   * =====================================================
   */

  const filteredProducts = useMemo(() => {
    const text = search.toLowerCase().trim();

    if (!text) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name
          ?.toLowerCase()
          .includes(text) ||
        product.brand
          ?.toLowerCase()
          .includes(text) ||
        product.category
          ?.toLowerCase()
          .includes(text) ||
        product.sku
          ?.toLowerCase()
          .includes(text) ||
        product.barcode
          ?.toLowerCase()
          .includes(text)
      );
    });
  }, [products, search]);

  /*
   * =====================================================
   * ESTADO STOCK
   * =====================================================
   */

  function getStockStatus(product: Product) {
    if (product.stock <= 0) {
      return {
        text: "Agotado",
        className: "bg-red-100 text-red-700",
      };
    }

    if (product.stock <= product.minimum_stock) {
      return {
        text: "Stock bajo",
        className: "bg-yellow-100 text-yellow-700",
      };
    }

    return {
      text: "Disponible",
      className: "bg-green-100 text-green-700",
    };
  }

  /*
   * =====================================================
   * FORMATEADORES
   * =====================================================
   */

  function formatPrice(price: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date(date));
  }

  function getMovementLabel(type: MovementType) {
    if (type === "entrada") {
      return "Entrada";
    }

    if (type === "salida") {
      return "Salida";
    }

    return "Ajuste";
  }

  function getMovementClass(type: MovementType) {
    if (type === "entrada") {
      return "bg-green-100 text-green-700";
    }

    if (type === "salida") {
      return "bg-red-100 text-red-700";
    }

    return "bg-blue-100 text-blue-700";
  }

  function getMovementQuantity(movement: Movement) {
    if (movement.movement_type === "entrada") {
      return `+${movement.quantity}`;
    }

    if (movement.movement_type === "salida") {
      return `-${movement.quantity}`;
    }

    // En un ajuste, quantity es el stock final:
    // mostramos la variación real, como en /inventario/movimientos.
    if (
      movement.movement_type === "ajuste" &&
      movement.stock_before !== null &&
      movement.stock_after !== null
    ) {
      const difference =
        movement.stock_after - movement.stock_before;

      return difference > 0
        ? `+${difference}`
        : `${difference}`;
    }

    return movement.quantity.toString();
  }

  /*
   * =====================================================
   * INVENTARIO INICIAL
   * =====================================================
   */

  function openInitialInventory() {
    setInitialInventorySearch("");
    setInitialInventoryMessage("");
    setFileMessage("");

    setInitialInventoryItems(
      products.map((product) => ({
        productId: product.id,
        quantity: "",
      }))
    );

    setInitialInventoryOpen(true);
  }

  function closeInitialInventory() {
    if (initialInventoryLoading) {
      return;
    }

    setInitialInventoryOpen(false);
    setInitialInventorySearch("");
    setInitialInventoryMessage("");
    setFileMessage("");
  }

  function getInitialQuantity(productId: string) {
    return (
      initialInventoryItems.find(
        (item) => item.productId === productId
      )?.quantity || ""
    );
  }

  function updateInitialQuantity(
    productId: string,
    value: string
  ) {
    if (
      value !== "" &&
      !/^\d+$/.test(value)
    ) {
      return;
    }

    setInitialInventoryItems((previous) =>
      previous.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: value,
            }
          : item
      )
    );
  }

  function clearInitialInventory() {
    setInitialInventoryItems((previous) =>
      previous.map((item) => ({
        ...item,
        quantity: "",
      }))
    );
  }

  const filteredInitialProducts = useMemo(() => {
    const text =
      initialInventorySearch.toLowerCase().trim();

    if (!text) {
      return products;
    }

    return products.filter(
      (product) =>
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
          .includes(text)
    );
  }, [products, initialInventorySearch]);

  const initialInventoryCount =
    initialInventoryItems.filter(
      (item) => item.quantity !== ""
    ).length;

  const initialInventoryUnits =
    initialInventoryItems.reduce(
      (total, item) =>
        total +
        (item.quantity === ""
          ? 0
          : Number(item.quantity)),
      0
    );

  /*
   * =====================================================
   * APLICAR INVENTARIO INICIAL
   * =====================================================
   */

  async function applyInitialInventory() {
    const items = initialInventoryItems
      .filter((item) => item.quantity !== "")
      .map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
      }));

    if (items.length === 0) {
      setInitialInventoryMessage(
        "Debes ingresar al menos una cantidad."
      );

      return;
    }

    const invalidItem = items.find(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 0
    );

    if (invalidItem) {
      setInitialInventoryMessage(
        "Todas las cantidades deben ser números enteros mayores o iguales a 0."
      );

      return;
    }

    const confirmed = window.confirm(
      `Se actualizarán ${items.length} productos con un total de ${initialInventoryUnits} unidades.\n\n¿Deseas continuar?`
    );

    if (!confirmed) {
      return;
    }

    setInitialInventoryLoading(true);
    setInitialInventoryMessage(
      "Aplicando inventario inicial..."
    );

    let successCount = 0;
    let errorCount = 0;
    let lastError = "";

    try {
      for (const item of items) {
        try {
          const response = await fetch(
            "/api/inventory/movements",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                product_id: item.productId,
                movement_type: "ajuste",
                quantity: item.quantity,
                reason: "Inventario inicial",
              }),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
                "No se pudo actualizar el producto."
            );
          }

          successCount++;
        } catch (error) {
          errorCount++;

          lastError =
            error instanceof Error
              ? error.message
              : "Error desconocido.";
        }
      }

      await Promise.all([
        loadProducts(),
        loadMovements(),
      ]);

      if (errorCount === 0) {
        setInitialInventoryMessage(
          `Inventario inicial aplicado correctamente. ${successCount} productos actualizados.`
        );

        window.setTimeout(() => {
          closeInitialInventory();
        }, 1500);
      } else {
        setInitialInventoryMessage(
          `Proceso terminado. ${successCount} productos actualizados y ${errorCount} con error. ${lastError}`
        );
      }
    } catch (error) {
      console.error(error);

      setInitialInventoryMessage(
        error instanceof Error
          ? error.message
          : "No se pudo aplicar el inventario inicial."
      );
    } finally {
      setInitialInventoryLoading(false);
    }
  }

  /*
   * =====================================================
   * ARCHIVO CSV
   * =====================================================
   */

  function normalizeHeader(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parseCsv(
    content: string,
    delimiter: "," | ";"
  ): string[][] {
    const rows: string[][] = [];

    let row: string[] = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const character = content[i];
      const nextCharacter = content[i + 1];

      if (
        character === '"' &&
        insideQuotes &&
        nextCharacter === '"'
      ) {
        field += '"';
        i++;
        continue;
      }

      if (character === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (
        character === delimiter &&
        !insideQuotes
      ) {
        row.push(field);
        field = "";
        continue;
      }

      if (
        (character === "\n" ||
          character === "\r") &&
        !insideQuotes
      ) {
        if (
          character === "\r" &&
          nextCharacter === "\n"
        ) {
          i++;
        }

        row.push(field);
        field = "";

        if (
          row.some(
            (value) => value.trim() !== ""
          )
        ) {
          rows.push(row);
        }

        row = [];

        continue;
      }

      field += character;
    }

    row.push(field);

    if (
      row.some(
        (value) => value.trim() !== ""
      )
    ) {
      rows.push(row);
    }

    return rows;
  }

  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileLoading(true);
    setFileMessage("");

    try {
      const extension = file.name
        .split(".")
        .pop()
        ?.toLowerCase();

      if (extension !== "csv") {
        throw new Error(
          "Por ahora el cargue de archivo debe realizarse en formato CSV."
        );
      }

      const content = await file.text();

      const rows = parseCsv(
        content,
        detectCsvDelimiter(content)
      );

      if (rows.length < 2) {
        throw new Error(
          "El archivo no contiene registros."
        );
      }

      const headers = rows[0].map(
        normalizeHeader
      );

      const identifierIndex =
        headers.findIndex((header) =>
          [
            "sku",
            "codigo",
            "codigo de barras",
            "barcode",
            "producto",
          ].includes(header)
        );

      const quantityIndex =
        headers.findIndex((header) =>
          [
            "cantidad",
            "stock",
            "existencia",
            "unidades",
          ].includes(header)
        );

      if (identifierIndex === -1) {
        throw new Error(
          "No encontramos una columna SKU, código, código de barras o producto."
        );
      }

      if (quantityIndex === -1) {
        throw new Error(
          "No encontramos una columna cantidad, stock, existencia o unidades."
        );
      }

      const parsedRows: FileInventoryRow[] = [];

      // Filas con cantidad inválida: no se cargan
      // y se reportan al usuario.
      const invalidRows: number[] = [];

      for (
        let i = 1;
        i < rows.length;
        i++
      ) {
        const identifier =
          rows[i][identifierIndex]?.trim();

        const rawQuantity =
          rows[i][quantityIndex]?.trim();

        if (!identifier) {
          continue;
        }

        // Formato es-CO: "1.000" son mil unidades.
        const parsedQuantity =
          parseEsCoInteger(rawQuantity);

        if (parsedQuantity === null) {
          invalidRows.push(i + 1);
          continue;
        }

        parsedRows.push({
          identifier,
          quantity: parsedQuantity,
        });
      }

      const invalidRowsMessage =
        invalidRows.length > 0
          ? ` Filas con cantidad inválida (no se cargaron): ${invalidRows
              .slice(0, 10)
              .join(", ")}${
              invalidRows.length > 10
                ? ` y ${invalidRows.length - 10} más`
                : ""
            }.`
          : "";

      if (parsedRows.length === 0) {
        throw new Error(
          "No encontramos registros válidos en el archivo." +
            invalidRowsMessage
        );
      }

      let matched = 0;
      let notFound = 0;

      const updatedItems = [
        ...initialInventoryItems,
      ];

      for (const row of parsedRows) {
        const identifier =
          row.identifier.toLowerCase();

        const product = products.find(
          (item) =>
            item.sku
              ?.toLowerCase() === identifier ||
            item.barcode
              ?.toLowerCase() === identifier ||
            item.name
              ?.toLowerCase() === identifier
        );

        if (!product) {
          notFound++;
          continue;
        }

        const existingIndex =
          updatedItems.findIndex(
            (item) =>
              item.productId === product.id
          );

        if (existingIndex >= 0) {
          updatedItems[existingIndex] = {
            ...updatedItems[existingIndex],
            quantity:
              row.quantity.toString(),
          };
        } else {
          updatedItems.push({
            productId: product.id,
            quantity:
              row.quantity.toString(),
          });
        }

        matched++;
      }

      setInitialInventoryItems(
        updatedItems
      );

      setFileMessage(
        `Archivo procesado: ${matched} productos encontrados${
          notFound > 0
            ? ` y ${notFound} no encontrados`
            : ""
        }.${invalidRowsMessage}`
      );
    } catch (error) {
      console.error(error);

      setFileMessage(
        error instanceof Error
          ? error.message
          : "No se pudo procesar el archivo."
      );
    } finally {
      setFileLoading(false);
      event.target.value = "";
    }
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
              Inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Consulta y controla el stock de tus productos.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openInitialInventory}
              className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-5 py-3 font-medium text-blue-700 hover:bg-blue-100"
            >
              📦 Cargar inventario
            </button>

            <Link
              href="/inventario/movimientos"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              🔄 Movimientos
            </Link>

            {canSeePurchases && (
              <Link
                href="/inventario/entradas/compras"
                className="inline-flex items-center justify-center rounded-lg border border-green-300 bg-green-50 px-5 py-3 font-medium text-green-700 hover:bg-green-100"
              >
                🛒 Compras
              </Link>
            )}

            {/* ALMACENAMIENTO */}

            <Link
              href="/inventario/almacenes"
              className="inline-flex items-center justify-center rounded-lg border border-purple-300 bg-purple-50 px-5 py-3 font-medium text-purple-700 hover:bg-purple-100"
            >
              🏭 Almacenes
            </Link>

            <Link
              href="/inventario/almacenes/sucursales"
              className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-5 py-3 font-medium text-blue-700 hover:bg-blue-100"
            >
              🏢 Sucursales
            </Link>

            <Link
              href="/inventario/traslados"
              className="inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-5 py-3 font-medium text-indigo-700 hover:bg-indigo-100"
            >
              ↔ Traslados
            </Link>

            <Link
              href="/inventario/nuevo"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              + Nuevo producto
            </Link>
          </div>
        </div>

        {/* TARJETAS */}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Productos
            </p>

            <p className="mt-2 text-3xl font-bold">
              {products.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Unidades en stock
            </p>

            <p className="mt-2 text-3xl font-bold">
              {products.reduce(
                (total, product) =>
                  total + (product.stock || 0),
                0
              )}
            </p>
          </div>

          <Link
            href="/inventario"
            className="rounded-2xl bg-white p-5 shadow-sm transition hover:bg-yellow-50"
          >
            <p className="text-sm text-gray-500">
              Stock bajo
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-600">
              {
                products.filter(
                  (product) =>
                    product.stock <=
                    product.minimum_stock
                ).length
              }
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Requieren atención
            </p>
          </Link>

          {/* ACCESO RÁPIDO A ALMACENES Y TRASLADOS */}

          <Link
            href="/inventario/almacenes"
            className="rounded-2xl border border-purple-200 bg-purple-50 p-5 shadow-sm transition hover:border-purple-300 hover:bg-purple-100"
          >
            <p className="text-sm font-medium text-purple-700">
              🏭 Almacenes
            </p>

            <p className="mt-2 text-xl font-bold text-purple-900">
              Stock por ubicación
            </p>

            <p className="mt-1 text-sm text-purple-700">
              Administra ubicaciones y traslada productos.
            </p>

            <p className="mt-3 text-sm font-semibold text-purple-800">
              Gestionar →
            </p>
          </Link>
        </div>

        {/* BUSCADOR */}

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-gray-700">
            Buscar producto
          </label>

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Buscar por nombre, marca, categoría, SKU o código de barras..."
            className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          />
        </div>

        {/* INVENTARIO */}

        {loading && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando inventario...
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-medium">
              Error cargando inventario
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadProducts()
              }
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="border-b bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-5 py-4 font-medium">
                      Producto
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Marca
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Categoría
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Proveedor
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Mascota
                    </th>

                    <th className="px-5 py-4 font-medium">
                      SKU
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Precio
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Stock
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Estado
                    </th>

                    <th className="w-[220px] px-5 py-4 font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filteredProducts.map(
                    (product) => {
                      const status =
                        getStockStatus(
                          product
                        );

                      return (
                        <tr
                          key={product.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-5 py-4">
                            <div className="font-medium text-gray-900">
                              {product.name}
                            </div>

                            {product.presentation && (
                              <div className="text-sm text-gray-500">
                                {
                                  product.presentation
                                }
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.brand ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.category ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.suppliers
                              ?.name ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.pet_type ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 font-mono text-sm text-gray-600">
                            {product.sku ||
                              "—"}
                          </td>

                          <td className="px-5 py-4 font-medium">
                            {formatPrice(
                              product.sale_price
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="font-semibold">
                              {product.stock}
                            </span>

                            <span className="ml-1 text-sm text-gray-500">
                              /{" "}
                              {product.maximum_stock ??
                                "∞"}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
                            >
                              {status.text}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex gap-2 whitespace-nowrap">
                              <Link
                                href={`/inventario/${product.id}`}
                                className="inline-block rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Editar
                              </Link>

                              <button
                                type="button"
                                onClick={() =>
                                  openMovement(
                                    product
                                  )
                                }
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Movimiento
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>

            {filteredProducts.length ===
              0 && (
              <div className="p-10 text-center">
                <p className="font-medium text-gray-700">
                  No encontramos productos.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Prueba con otro término de búsqueda.
                </p>
              </div>
            )}
          </div>
        )}

        {/* HISTORIAL */}

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Historial de movimientos
            </h2>

            <p className="mt-1 text-gray-600">
              Consulta las entradas, salidas y ajustes de inventario.
            </p>
          </div>

          {loadingMovements && (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="text-gray-500">
                Cargando movimientos...
              </p>
            </div>
          )}

          {movementError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
              <p className="font-medium">
                Error cargando movimientos
              </p>

              <p className="mt-1 text-sm">
                {movementError}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadMovements()
                }
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Intentar nuevamente
              </button>
            </div>
          )}

          {!loadingMovements &&
            !movementError &&
            movements.length === 0 && (
              <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
                <p className="font-medium text-gray-700">
                  No hay movimientos registrados.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Los movimientos que registres aparecerán aquí.
                </p>
              </div>
            )}

          {!loadingMovements &&
            !movementError &&
            movements.length > 0 && (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px]">
                    <thead className="border-b bg-gray-50">
                      <tr className="text-left text-sm text-gray-500">
                        <th className="px-5 py-4 font-medium">
                          Fecha
                        </th>

                        <th className="px-5 py-4 font-medium">
                          Producto
                        </th>

                        <th className="px-5 py-4 font-medium">
                          SKU
                        </th>

                        <th className="px-5 py-4 font-medium">
                          Tipo
                        </th>

                        <th className="px-5 py-4 font-medium">
                          Cantidad
                        </th>

                        <th className="px-5 py-4 font-medium">
                          Motivo
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {movements.map(
                        (movement) => (
                          <tr
                            key={movement.id}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-5 py-4 text-sm text-gray-600">
                              {formatDate(
                                movement.created_at
                              )}
                            </td>

                            <td className="px-5 py-4 font-medium text-gray-900">
                              {movement.products
                                ?.name ||
                                "—"}
                            </td>

                            <td className="px-5 py-4 font-mono text-sm text-gray-600">
                              {movement.products
                                ?.sku ||
                                "—"}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-medium ${getMovementClass(
                                  movement.movement_type
                                )}`}
                              >
                                {getMovementLabel(
                                  movement.movement_type
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-4 font-semibold">
                              {getMovementQuantity(
                                movement
                              )}
                            </td>

                            <td className="px-5 py-4 text-gray-700">
                              {movement.reason ||
                                "—"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </section>
      </div>

      {/* MODAL MOVIMIENTO INDIVIDUAL */}

      {movementOpen &&
        selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-6">
                <p className="text-sm text-gray-500">
                  Movimiento de inventario
                </p>

                <h2 className="mt-1 text-2xl font-bold text-gray-900">
                  {selectedProduct.name}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Stock actual:{" "}
                  <span className="font-semibold">
                    {selectedProduct.stock}
                  </span>
                </p>

                <div className="mt-4 rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    Resumen del movimiento
                  </p>

                  <div className="mt-2 text-sm text-gray-700">
                    {movementType ===
                      "entrada" && (
                      <>
                        Se agregarán{" "}
                        <span className="font-semibold">
                          {Number(quantity) ||
                            0}
                        </span>{" "}
                        unidades.
                      </>
                    )}

                    {movementType ===
                      "salida" && (
                      <>
                        Se retirarán{" "}
                        <span className="font-semibold">
                          {Number(quantity) ||
                            0}
                        </span>{" "}
                        unidades.
                      </>
                    )}

                    {movementType ===
                      "ajuste" && (
                      <>
                        El stock será establecido en{" "}
                        <span className="font-semibold">
                          {Number(quantity) ||
                            0}
                        </span>{" "}
                        unidades.
                      </>
                    )}
                  </div>

                  {quantity !== "" &&
                    Number(quantity) >=
                      0 && (
                      <p className="mt-2 text-sm text-gray-500">
                        Stock después:{" "}
                        <span className="font-semibold text-gray-900">
                          {movementType ===
                          "entrada"
                            ? selectedProduct.stock +
                              Number(quantity)
                            : movementType ===
                              "salida"
                            ? Number(quantity) >
                              selectedProduct.stock
                              ? "Stock insuficiente"
                              : selectedProduct.stock -
                                Number(quantity)
                            : Number(quantity)}
                        </span>
                      </p>
                    )}
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Tipo de movimiento
                  </label>

                  <select
                    value={movementType}
                    onChange={(event) =>
                      setMovementType(
                        event.target
                          .value as MovementType
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                  >
                    <option value="entrada">
                      Entrada
                    </option>

                    <option value="salida">
                      Salida
                    </option>

                    <option value="ajuste">
                      Ajuste
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    {movementType ===
                    "ajuste"
                      ? "Nuevo stock"
                      : "Cantidad"}
                  </label>

                  <input
                    type="number"
                    min={
                      movementType ===
                      "ajuste"
                        ? "0"
                        : "1"
                    }
                    step="1"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        event.target.value
                      )
                    }
                    placeholder={
                      movementType ===
                      "ajuste"
                        ? "Ej. 20"
                        : "Ej. 1"
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                  />
                </div>

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
                    placeholder="Ej. Compra a proveedor"
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                  />
                </div>

                {movementMessage && (
                  <div className="rounded-lg bg-gray-100 p-4 text-sm">
                    {movementMessage}
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeMovement}
                    disabled={movementLoading}
                    className="rounded-lg border border-gray-300 px-5 py-3 font-medium disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleMovement()
                    }
                    disabled={movementLoading}
                    className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white disabled:opacity-50"
                  >
                    {movementLoading
                      ? "Guardando..."
                      : "Guardar movimiento"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* MODAL INVENTARIO INICIAL */}

      {initialInventoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* HEADER */}

            <div className="border-b px-6 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">
                    Gestión de inventario
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-gray-900">
                    Inventario inicial
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Digita las existencias actuales o carga un archivo CSV.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeInitialInventory
                  }
                  disabled={
                    initialInventoryLoading
                  }
                  className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* CONTROLES */}

            <div className="border-b bg-gray-50 px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <label className="text-sm font-medium text-gray-700">
                    Buscar producto
                  </label>

                  <input
                    type="text"
                    value={
                      initialInventorySearch
                    }
                    onChange={(event) =>
                      setInitialInventorySearch(
                        event.target.value
                      )
                    }
                    placeholder="Nombre, SKU, código de barras o marca..."
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Cargar archivo
                  </label>

                  <label className="mt-2 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-400 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50">
                    {fileLoading
                      ? "Procesando..."
                      : "📄 Seleccionar CSV"}

                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={
                        handleFileUpload
                      }
                      disabled={
                        fileLoading ||
                        initialInventoryLoading
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <div className="rounded-lg bg-white px-4 py-2 text-sm text-gray-600">
                  Productos cargados:{" "}
                  <strong>
                    {
                      initialInventoryCount
                    }
                  </strong>
                </div>

                <div className="rounded-lg bg-white px-4 py-2 text-sm text-gray-600">
                  Unidades:{" "}
                  <strong>
                    {
                      initialInventoryUnits
                    }
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={
                    clearInitialInventory
                  }
                  disabled={
                    initialInventoryLoading
                  }
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Limpiar cantidades
                </button>
              </div>

              {fileMessage && (
                <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                  {fileMessage}
                </div>
              )}

              {initialInventoryMessage && (
                <div className="mt-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
                  {initialInventoryMessage}
                </div>
              )}
            </div>

            {/* TABLA */}

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px]">
                <thead className="sticky top-0 border-b bg-white">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-6 py-4 font-medium">
                      Producto
                    </th>

                    <th className="px-6 py-4 font-medium">
                      SKU
                    </th>

                    <th className="px-6 py-4 font-medium">
                      Código de barras
                    </th>

                    <th className="px-6 py-4 font-medium">
                      Stock actual
                    </th>

                    <th className="w-[180px] px-6 py-4 font-medium">
                      Nuevo stock
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filteredInitialProducts.map(
                    (product) => (
                      <tr
                        key={product.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {product.name}
                          </div>

                          {product.brand && (
                            <div className="text-sm text-gray-500">
                              {product.brand}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 font-mono text-sm text-gray-600">
                          {product.sku || "—"}
                        </td>

                        <td className="px-6 py-4 font-mono text-sm text-gray-600">
                          {product.barcode ||
                            "—"}
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-semibold">
                            {product.stock}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={getInitialQuantity(
                              product.id
                            )}
                            onChange={(event) =>
                              updateInitialQuantity(
                                product.id,
                                event.target
                                  .value
                              )
                            }
                            placeholder={String(
                              product.stock
                            )}
                            disabled={
                              initialInventoryLoading
                            }
                            className="w-full rounded-lg border border-gray-300 p-3 font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                          />
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>

              {filteredInitialProducts.length ===
                0 && (
                <div className="p-10 text-center">
                  <p className="font-medium text-gray-700">
                    No encontramos productos.
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    Cambia el término de búsqueda.
                  </p>
                </div>
              )}
            </div>

            {/* FOOTER */}

            <div className="flex flex-col gap-3 border-t bg-gray-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-500">
                <strong>Importante:</strong>{" "}
                el cargue registrará ajustes de inventario con el motivo{" "}
                <span className="font-medium">
                  &quot;Inventario inicial&quot;
                </span>
                .
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={
                    closeInitialInventory
                  }
                  disabled={
                    initialInventoryLoading
                  }
                  className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void applyInitialInventory()
                  }
                  disabled={
                    initialInventoryLoading ||
                    initialInventoryCount ===
                      0
                  }
                  className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {initialInventoryLoading
                    ? "Aplicando..."
                    : "Aplicar inventario"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}