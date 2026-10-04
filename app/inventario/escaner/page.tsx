"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  pet_type: string | null;
  presentation: string | null;
  sku: string | null;
  barcode: string | null;
  stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
  sale_price: number;
  purchase_price: number;
  suppliers?: {
    id: string;
    name: string;
  } | null;
};

type Movement = {
  ok: boolean;
  movement_id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
};

type MovementType =
  | "entrada"
  | "salida";

export default function ScannerPage() {
  const inputRef =
    useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] =
    useState("");

  const [product, setProduct] =
    useState<Product | null>(null);

  const [quantity, setQuantity] =
    useState(1);

  const [mode, setMode] =
    useState<MovementType>("salida");

  const [loading, setLoading] =
    useState(false);

  const [movementLoading, setMovementLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [lastMovement, setLastMovement] =
    useState<Movement | null>(null);

  /*
  |--------------------------------------------------------------------------
  | FOCUS INICIAL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /*
  |--------------------------------------------------------------------------
  | MANTENER EL ESCÁNER PREPARADO
  |--------------------------------------------------------------------------
  */

  function focusScanner() {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }

  /*
  |--------------------------------------------------------------------------
  | BUSCAR PRODUCTO
  |--------------------------------------------------------------------------
  */

  async function searchProduct(
    code?: string
  ) {
    const value =
      (code ?? barcode).trim();

    if (!value) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setLastMovement(null);

    try {
      const response =
        await fetch(
          `/api/products?barcode=${encodeURIComponent(
            value
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se encontró el producto."
        );
      }

      setProduct(
        data.product
      );

      setQuantity(1);

    } catch (err) {
      setProduct(null);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo buscar el producto."
      );
    } finally {
      setLoading(false);

      focusScanner();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ENTER DEL LECTOR
  |--------------------------------------------------------------------------
  */

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      searchProduct();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CAMBIAR CANTIDAD
  |--------------------------------------------------------------------------
  */

  function changeQuantity(
    amount: number
  ) {
    setQuantity((current) =>
      Math.max(
        1,
        current + amount
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | LIMPIAR
  |--------------------------------------------------------------------------
  */

  function clearProduct() {
    setProduct(null);
    setBarcode("");
    setQuantity(1);
    setError("");
    setSuccess("");
    setLastMovement(null);

    focusScanner();
  }

  /*
  |--------------------------------------------------------------------------
  | CAMBIAR MODO
  |--------------------------------------------------------------------------
  */

  function changeMode(
    newMode: MovementType
  ) {
    setMode(newMode);
    setError("");
    setSuccess("");

    focusScanner();
  }

  /*
  |--------------------------------------------------------------------------
  | REGISTRAR MOVIMIENTO
  |--------------------------------------------------------------------------
  */

  async function registerMovement(
    movementType?: MovementType
  ) {
    if (!product) {
      return;
    }

    const selectedMode =
      movementType ?? mode;

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      setError(
        "La cantidad debe ser mayor que 0."
      );

      return;
    }

    if (
      selectedMode === "salida" &&
      quantity > product.stock
    ) {
      setError(
        `Stock insuficiente. Actualmente hay ${product.stock} unidades.`
      );

      return;
    }

    setMovementLoading(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/inventory/barcode",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              barcode:
                product.barcode,

              movement_type:
                selectedMode,

              quantity,

              reason:
                selectedMode ===
                "entrada"
                  ? `Entrada de ${quantity} unidad(es) desde lector de código de barras`
                  : `Salida de ${quantity} unidad(es) desde lector de código de barras`,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "No se pudo registrar el movimiento."
        );
      }

      const movement:
        Movement =
        data.movement;

      setLastMovement(
        movement
      );

      setProduct(
        data.product
      );

      setSuccess(
        selectedMode ===
        "entrada"
          ? `Entrada de ${quantity} unidad(es) registrada correctamente.`
          : `Salida de ${quantity} unidad(es) registrada correctamente.`
      );

      setQuantity(1);

      setBarcode("");

      focusScanner();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar el movimiento."
      );
    } finally {
      setMovementLoading(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">

      <div className="mx-auto max-w-4xl">

        {/* HEADER */}

        <div className="mb-6">

          <h1 className="text-3xl font-bold text-gray-900">
            Escáner de inventario
          </h1>

          <p className="mt-1 text-gray-600">
            Escanea productos y actualiza
            rápidamente el inventario.
          </p>

        </div>

        {/* MODO */}

        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">

          <p className="mb-3 text-sm font-semibold text-gray-700">
            Modo de operación
          </p>

          <div className="grid grid-cols-2 gap-3">

            <button
              type="button"
              onClick={() =>
                changeMode("salida")
              }
              className={`rounded-xl px-4 py-3 font-semibold transition ${
                mode === "salida"
                  ? "bg-red-600 text-white"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              − Salida
            </button>

            <button
              type="button"
              onClick={() =>
                changeMode("entrada")
              }
              className={`rounded-xl px-4 py-3 font-semibold transition ${
                mode === "entrada"
                  ? "bg-green-600 text-white"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              + Entrada
            </button>

          </div>

          <p className="mt-3 text-center text-xs text-gray-500">
            Modo actual:{" "}
            <strong>
              {mode === "salida"
                ? "Salida de inventario"
                : "Entrada de inventario"}
            </strong>
          </p>

        </div>

        {/* SCANNER */}

        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">

          <label
            htmlFor="barcode"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            Código de barras
          </label>

          <div className="flex gap-2">

            <input
              ref={inputRef}
              id="barcode"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={barcode}
              onChange={(event) =>
                setBarcode(
                  event.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder="Escanea el código..."
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-4 text-lg outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              disabled={
                loading ||
                movementLoading
              }
            />

            <button
              type="button"
              onClick={() =>
                searchProduct()
              }
              disabled={
                loading ||
                movementLoading ||
                !barcode.trim()
              }
              className="rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "..."
                : "Buscar"}
            </button>

          </div>

          <p className="mt-2 text-xs text-gray-500">
            El lector USB funciona como un
            teclado: escanea el código y
            presiona Enter automáticamente.
          </p>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* SUCCESS */}

        {success && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* PRODUCT */}

        {product && (
          <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">

            {/* PRODUCT INFO */}

            <div className="p-6">

              <div className="flex flex-col justify-between gap-4 sm:flex-row">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Producto encontrado
                  </p>

                  <h2 className="mt-1 text-3xl font-bold text-gray-900">
                    {product.name}
                  </h2>

                  {product.brand && (
                    <p className="mt-1 text-gray-600">
                      {product.brand}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">

                    {product.presentation && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {product.presentation}
                      </span>
                    )}

                    {product.pet_type && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {product.pet_type}
                      </span>
                    )}

                    {product.sku && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        SKU: {product.sku}
                      </span>
                    )}

                    {product.barcode && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        EAN: {product.barcode}
                      </span>
                    )}

                  </div>

                </div>

                {/* STOCK */}

                <div className="rounded-2xl bg-gray-50 px-8 py-5 text-center">

                  <p className="text-sm font-medium text-gray-500">
                    Stock actual
                  </p>

                  <p className="mt-1 text-5xl font-bold text-gray-900">
                    {product.stock}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    unidades
                  </p>

                </div>

              </div>

            </div>

            {/* CANTIDAD */}

            <div className="border-t border-gray-100 p-6">

              <p className="mb-3 text-center text-sm font-semibold text-gray-700">
                Cantidad a{" "}
                {mode === "salida"
                  ? "retirar"
                  : "ingresar"}
              </p>

              <div className="mx-auto flex max-w-xs items-center justify-center gap-5">

                <button
                  type="button"
                  onClick={() =>
                    changeQuantity(-1)
                  }
                  disabled={
                    quantity <= 1 ||
                    movementLoading
                  }
                  className="h-12 w-12 rounded-xl border border-gray-300 text-2xl font-bold hover:bg-gray-50 disabled:opacity-40"
                >
                  −
                </button>

                <input
                  type="number"
                  onWheel={(event) => event.currentTarget.blur()}
                  min={1}
                  value={quantity}
                  onChange={(event) => {
                    const value =
                      Number(
                        event.target.value
                      );

                    if (
                      Number.isInteger(
                        value
                      ) &&
                      value >= 1
                    ) {
                      setQuantity(value);
                    }
                  }}
                  className="h-14 w-24 rounded-xl border border-gray-300 text-center text-2xl font-bold outline-none focus:border-blue-500"
                  disabled={
                    movementLoading
                  }
                />

                <button
                  type="button"
                  onClick={() =>
                    changeQuantity(1)
                  }
                  disabled={
                    movementLoading
                  }
                  className="h-12 w-12 rounded-xl border border-gray-300 text-2xl font-bold hover:bg-gray-50 disabled:opacity-40"
                >
                  +
                </button>

              </div>

            </div>

            {/* ACCIÓN PRINCIPAL */}

            <div className="border-t border-gray-100 p-6">

              <button
                type="button"
                onClick={() =>
                  registerMovement()
                }
                disabled={
                  movementLoading ||
                  (
                    mode === "salida" &&
                    product.stock <= 0
                  )
                }
                className={`w-full rounded-2xl px-6 py-5 text-xl font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  mode === "salida"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >

                {movementLoading
                  ? "Registrando..."
                  : mode === "salida"
                  ? `− Registrar salida de ${quantity} ${
                      quantity === 1
                        ? "unidad"
                        : "unidades"
                    }`
                  : `+ Registrar entrada de ${quantity} ${
                      quantity === 1
                        ? "unidad"
                        : "unidades"
                    }`}

              </button>

              <button
                type="button"
                onClick={clearProduct}
                disabled={
                  movementLoading
                }
                className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Limpiar y escanear otro
              </button>

            </div>

            {/* ÚLTIMO MOVIMIENTO */}

            {lastMovement && (
              <div className="border-t border-gray-100 bg-gray-50 p-6">

                <p className="mb-4 text-center text-sm font-semibold text-gray-700">
                  Último movimiento
                </p>

                <div className="mx-auto grid max-w-lg grid-cols-3 gap-4 text-center">

                  <div>

                    <p className="text-xs text-gray-500">
                      Antes
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        lastMovement.stock_before
                      }
                    </p>

                  </div>

                  <div>

                    <p className="text-xs text-gray-500">
                      Movimiento
                    </p>

                    <p className="mt-1 text-2xl font-bold">

                      {lastMovement.movement_type ===
                      "entrada"
                        ? `+${lastMovement.quantity}`
                        : `-${lastMovement.quantity}`}

                    </p>

                  </div>

                  <div>

                    <p className="text-xs text-gray-500">
                      Después
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        lastMovement.stock_after
                      }
                    </p>

                  </div>

                </div>

              </div>
            )}

          </div>
        )}

        {/* AYUDA */}

        {!product && !error && (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">

            <div className="text-5xl">
              📷
            </div>

            <h2 className="mt-3 text-lg font-bold text-gray-900">
              Listo para escanear
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Selecciona el modo de operación,
              escanea un código de barras y
              actualiza el inventario en segundos.
            </p>

          </div>
        )}

      </div>
    </main>
  );
}