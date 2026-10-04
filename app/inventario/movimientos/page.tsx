"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type MovementType = "entrada" | "salida" | "ajuste";

type Movement = {
  id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  stock_before: number | null;
  stock_after: number | null;
  reason: string | null;
  created_at: string;
  products:
    | {
        name: string;
        sku: string | null;
      }
    | null;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
};

const PAGE_SIZE = 20;

export default function MovimientosPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [search, setSearch] = useState("");

  const [typeFilter, setTypeFilter] =
    useState<"todos" | MovementType>("todos");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] =
    useState<MovementType>("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  // Tanda 4: origen de una salida. "" = sin ubicar.
  const [stockId, setStockId] = useState("");
  const [stockOptions, setStockOptions] = useState<
    { id: string; label: string; quantity: number }[]
  >([]);
  // Descarta respuestas tardías si el usuario cambió de producto.
  const latestStockRequestRef = useRef(0);

  // Descarta una respuesta tardía si el usuario siguió escribiendo o
  // cambió de página antes de que esta llegara.
  const latestRequestRef = useRef(0);

  /*
   * CARGAR MOVIMIENTOS
   */
  const loadMovements = useCallback(
    async (nextOffset: number) => {
      const requestId = ++latestRequestRef.current;

      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();

        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(nextOffset));

        if (search.trim()) {
          params.set("search", search.trim());
        }

        if (typeFilter !== "todos") {
          params.set("type", typeFilter);
        }

        const response = await fetch(
          `/api/inventory/movements?${params.toString()}`
        );

        const result = await response.json();

        if (latestRequestRef.current !== requestId) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            result.error || "Error cargando movimientos"
          );
        }

        setMovements(result.movements || []);
        setTotal(
          typeof result.total === "number" ? result.total : 0
        );
        setOffset(nextOffset);
      } catch (error) {
        if (latestRequestRef.current !== requestId) {
          return;
        }

        console.error(error);

        setError(
          error instanceof Error
            ? error.message
            : "Error cargando movimientos"
        );
      } finally {
        if (latestRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [search, typeFilter]
  );

  /*
   * CARGAR PRODUCTOS
   */
  const loadProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);

      const response = await fetch("/api/products");

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando productos"
        );
      }

      setProducts(result.products || []);
    } catch (error) {
      console.error(error);

      setFormError(
        error instanceof Error
          ? error.message
          : "Error cargando productos"
      );
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  /*
   * CARGA INICIAL
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMovements(0);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  /*
   * PRODUCTO SELECCIONADO
   */
  const selectedProduct = products.find(
    (product) => product.id === productId
  );

  /*
   * CONTADORES (de la página actual)
   */
  const movementCounts = useMemo(() => {
    return {
      entradas: movements.filter(
        (movement) =>
          movement.movement_type === "entrada"
      ).length,
      salidas: movements.filter(
        (movement) =>
          movement.movement_type === "salida"
      ).length,
      ajustes: movements.filter(
        (movement) =>
          movement.movement_type === "ajuste"
      ).length,
    };
  }, [movements]);

  /*
   * FORMATEAR FECHA
   */
  function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  }

  /*
   * ETIQUETA DEL TIPO
   */
  function getTypeLabel(type: MovementType) {
    if (type === "entrada") {
      return "Entrada";
    }

    if (type === "salida") {
      return "Salida";
    }

    return "Ajuste";
  }

  /*
   * CLASE DEL TIPO
   */
  function getTypeClass(type: MovementType) {
    if (type === "entrada") {
      return "bg-green-100 text-green-700";
    }

    if (type === "salida") {
      return "bg-red-100 text-red-700";
    }

    return "bg-blue-100 text-blue-700";
  }

  /*
   * CANTIDAD MOSTRADA
   */
  function getQuantity(movement: Movement) {
    if (movement.movement_type === "entrada") {
      return `+${movement.quantity}`;
    }

    if (movement.movement_type === "salida") {
      return `-${movement.quantity}`;
    }

    if (
      movement.movement_type === "ajuste" &&
      movement.stock_before !== null &&
      movement.stock_after !== null
    ) {
      const difference =
        movement.stock_after - movement.stock_before;

      if (difference > 0) {
        return `+${difference}`;
      }

      if (difference < 0) {
        return `${difference}`;
      }

      return "0";
    }

    return movement.quantity.toString();
  }

  /*
   * CLASE DE LA CANTIDAD
   */
  function getQuantityClass(type: MovementType) {
    if (type === "entrada") {
      return "text-green-700";
    }

    if (type === "salida") {
      return "text-red-700";
    }

    return "text-blue-700";
  }

  /*
   * REINICIAR FORMULARIO
   */
  function resetForm() {
    setProductId("");
    setMovementType("entrada");
    setQuantity("");
    setReason("");
    setFormError("");
    setStockId("");
    setStockOptions([]);
  }

  /*
   * Existencias ubicadas del producto, para elegir de dónde sale una
   * salida. Se llama desde los onChange (no desde un efecto).
   */
  async function refreshStockOptions(
    nextProductId: string,
    nextType: MovementType
  ) {
    const requestId = ++latestStockRequestRef.current;

    setStockId("");
    setStockOptions([]);

    if (!nextProductId || nextType !== "salida") {
      return;
    }

    try {
      const response = await fetch(
        `/api/inventory/stock?product_id=${encodeURIComponent(
          nextProductId
        )}`,
        { cache: "no-store" }
      );

      const result = await response.json();

      if (latestStockRequestRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudieron cargar las ubicaciones."
        );
      }

      type Row = {
        id: string;
        quantity: number;
        branches: { name: string } | null;
        warehouses: { name: string } | null;
        locations: { name: string } | null;
      };

      setStockOptions(
        ((result.stock ?? []) as Row[])
          .filter((row) => Number(row.quantity) > 0)
          .map((row) => ({
            id: row.id,
            quantity: Number(row.quantity),
            label: row.locations?.name
              ? `${row.warehouses?.name ?? "Almacén"} · ${row.locations.name}`
              : row.warehouses?.name ??
                row.branches?.name ??
                "Ubicación",
          }))
          .sort((a, b) => b.quantity - a.quantity)
      );
    } catch (error) {
      if (latestStockRequestRef.current !== requestId) {
        return;
      }

      console.error(error);

      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las ubicaciones."
      );
    }
  }

  /*
   * CERRAR FORMULARIO
   */
  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    resetForm();
  }

  /*
   * GUARDAR MOVIMIENTO
   */
  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setFormError("");

    if (!productId) {
      setFormError("Debes seleccionar un producto.");
      return;
    }

    if (quantity === "") {
      setFormError("Debes indicar una cantidad.");
      return;
    }

    const numericQuantity = Number(quantity);

    if (!Number.isInteger(numericQuantity)) {
      setFormError(
        "La cantidad debe ser un número entero."
      );
      return;
    }

    if (
      movementType === "ajuste"
        ? numericQuantity < 0
        : numericQuantity <= 0
    ) {
      setFormError(
        movementType === "ajuste"
          ? "El nuevo stock no puede ser negativo."
          : "La cantidad debe ser mayor que 0."
      );
      return;
    }

    if (
      movementType === "salida" &&
      selectedProduct &&
      numericQuantity > selectedProduct.stock
    ) {
      setFormError(
        `Stock insuficiente. Stock actual: ${selectedProduct.stock}.`
      );
      return;
    }

    if (movementType === "salida" && selectedProduct) {
      const located = stockOptions.reduce(
        (sum, option) => sum + option.quantity,
        0
      );

      const available = stockId
        ? stockOptions.find((option) => option.id === stockId)
            ?.quantity ?? 0
        : Math.max(selectedProduct.stock - located, 0);

      if (numericQuantity > available) {
        setFormError(
          stockId
            ? `En esa ubicación solo hay ${available} unidades.`
            : `Sin ubicar solo hay ${available} unidades. Elige una ubicación de origen.`
        );
        return;
      }
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/inventory/movements",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id: productId,
            movement_type: movementType,
            quantity: numericQuantity,
            reason: reason.trim() || null,
            stock_id:
              movementType === "salida" && stockId
                ? stockId
                : null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo registrar el movimiento."
        );
      }

      setShowForm(false);
      resetForm();

      await Promise.all([
        loadMovements(0),
        loadProducts(),
      ]);
    } catch (error) {
      console.error(error);

      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el movimiento."
      );
    } finally {
      setSaving(false);
    }
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* ENCABEZADO */}

        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">
              PetStock AI · Inventario
            </p>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Movimientos de inventario
            </h1>

            <p className="mt-2 max-w-2xl text-slate-600">
              Consulta el historial de entradas, salidas y
              ajustes realizados en tu inventario.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/inventario"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              ← Inventario
            </Link>

            <Link
              href="/inventario/entradas/compras"
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
            >
              🛒 Compras
            </Link>

            <button
              type="button"
              onClick={() => {
                setFormError("");
                setShowForm(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              + Nuevo movimiento
            </button>
          </div>
        </div>

        {/* RESUMEN */}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Movimientos encontrados
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {total}
            </p>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-green-700">
              Entradas (página actual)
            </p>

            <p className="mt-2 text-3xl font-bold text-green-800">
              {movementCounts.entradas}
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-red-700">
              Salidas (página actual)
            </p>

            <p className="mt-2 text-3xl font-bold text-red-800">
              {movementCounts.salidas}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-blue-700">
              Ajustes (página actual)
            </p>

            <p className="mt-2 text-3xl font-bold text-blue-800">
              {movementCounts.ajustes}
            </p>
          </div>
        </div>

        {/* INFORMACIÓN */}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
              🔄
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">
                Historial de inventario
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                Las recepciones de compras generan automáticamente
                movimientos de entrada. Esta pantalla funciona como
                historial y también permite registrar movimientos
                manuales.
              </p>
            </div>
          </div>
        </div>

        {/* FORMULARIO */}

        {showForm && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Nuevo movimiento
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Registra manualmente un cambio de inventario.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Cerrar formulario"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {formError}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">

                {/* PRODUCTO */}

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Producto
                  </label>

                  <select
                    value={productId}
                    onChange={(event) => {
                      setProductId(event.target.value);
                      void refreshStockOptions(
                        event.target.value,
                        movementType
                      );
                    }}
                    disabled={
                      loadingProducts || saving
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">
                      {loadingProducts
                        ? "Cargando productos..."
                        : "Selecciona un producto"}
                    </option>

                    {products.map((product) => (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.name}
                        {product.sku
                          ? ` — ${product.sku}`
                          : ""}
                        {` — Stock: ${product.stock}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* TIPO */}

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Tipo de movimiento
                  </label>

                  <select
                    value={movementType}
                    onChange={(event) => {
                      const nextType =
                        event.target.value as MovementType;

                      setMovementType(nextType);
                      void refreshStockOptions(
                        productId,
                        nextType
                      );
                    }}
                    disabled={saving}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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

                {/* CANTIDAD */}

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {movementType === "ajuste"
                      ? "Nuevo stock"
                      : "Cantidad"}
                  </label>

                  <input
                    type="number"
                    onWheel={(event) => event.currentTarget.blur()}
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(event.target.value)
                    }
                    disabled={saving}
                    placeholder={
                      movementType === "ajuste"
                        ? "Ej. 10"
                        : "Ej. 5"
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  {selectedProduct && (
                    <p className="mt-2 text-sm text-slate-500">
                      Stock actual:{" "}
                      <span className="font-semibold text-slate-700">
                        {selectedProduct.stock}
                      </span>
                    </p>
                  )}
                </div>

                {/* ORIGEN DE LA SALIDA (tanda 4) */}

                {movementType === "salida" &&
                  stockOptions.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Sale de
                      </label>

                      <select
                        value={stockId}
                        onChange={(event) =>
                          setStockId(event.target.value)
                        }
                        disabled={saving}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">
                          Sin ubicar (
                          {Math.max(
                            (selectedProduct?.stock ?? 0) -
                              stockOptions.reduce(
                                (sum, option) =>
                                  sum + option.quantity,
                                0
                              ),
                            0
                          )}
                          )
                        </option>

                        {stockOptions.map((option) => (
                          <option
                            key={option.id}
                            value={option.id}
                          >
                            {option.label} ({option.quantity})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                {/* MOTIVO */}

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Motivo
                  </label>

                  <input
                    type="text"
                    value={reason}
                    onChange={(event) =>
                      setReason(event.target.value)
                    }
                    disabled={saving}
                    placeholder="Ej. Conteo físico"
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              {/* AVISO AJUSTE */}

              {movementType === "ajuste" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  En un ajuste debes indicar el stock final
                  que debe tener el producto.
                </div>
              )}

              {/* BOTONES */}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Guardando..."
                    : "Guardar movimiento"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* FILTROS */}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="text-sm font-medium text-slate-700">
                Buscar
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Producto, SKU o motivo..."
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Tipo de movimiento
              </label>

              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(
                    event.target.value as
                      | "todos"
                      | MovementType
                  )
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="todos">
                  Todos
                </option>

                <option value="entrada">
                  Entradas
                </option>

                <option value="salida">
                  Salidas
                </option>

                <option value="ajuste">
                  Ajustes
                </option>
              </select>
            </div>
          </div>

          {(search || typeFilter !== "todos") && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500">
                Filtros activos
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("todos");
                }}
                className="text-sm font-semibold text-slate-700 hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>

        {/* CONTADOR */}

        {!loading && !error && (
          <div className="mb-4">
            <p className="text-sm text-slate-500">
              Mostrando{" "}
              <span className="font-semibold text-slate-700">
                {movements.length}
              </span>{" "}
              de{" "}
              <span className="font-semibold text-slate-700">
                {total}
              </span>{" "}
              movimientos
            </p>
          </div>
        )}

        {/* LOADING */}

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />

            <p className="text-slate-500">
              Cargando movimientos...
            </p>
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <p className="font-semibold">
              Error cargando movimientos
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() => {
                void loadMovements(offset);
              }}
              className="mt-4 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {/* TABLA */}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {movements.length === 0 ? (
              <div className="p-12 text-center">

                <div className="text-5xl">
                  📦
                </div>

                <p className="mt-4 font-semibold text-slate-700">
                  No encontramos movimientos.
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {total === 0
                    ? "Cuando registres una entrada, salida o ajuste aparecerá aquí."
                    : "Prueba cambiando los filtros de búsqueda."}
                </p>

                {total === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormError("");
                      setShowForm(true);
                    }}
                    className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    + Registrar movimiento
                  </button>
                )}

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1000px]">

                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr className="text-left text-sm text-slate-500">

                      <th className="px-5 py-4 font-semibold">
                        Fecha
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Producto
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        SKU
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Tipo
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Cantidad
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Stock
                      </th>

                      <th className="px-5 py-4 font-semibold">
                        Motivo
                      </th>

                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {movements.map(
                      (movement) => (
                        <tr
                          key={movement.id}
                          className="transition hover:bg-slate-50"
                        >

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {formatDate(
                              movement.created_at
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">
                              {movement.products?.name ||
                                "Producto desconocido"}
                            </div>
                          </td>

                          <td className="px-5 py-4 font-mono text-sm text-slate-600">
                            {movement.products?.sku ||
                              "—"}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTypeClass(
                                movement.movement_type
                              )}`}
                            >
                              {getTypeLabel(
                                movement.movement_type
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`font-bold ${getQuantityClass(
                                movement.movement_type
                              )}`}
                            >
                              {getQuantity(movement)}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-sm">
                            {movement.stock_before !==
                              null &&
                            movement.stock_after !==
                              null ? (
                              <div className="flex items-center gap-2 font-semibold text-slate-700">
                                <span>
                                  {movement.stock_before}
                                </span>

                                <span className="text-slate-400">
                                  →
                                </span>

                                <span>
                                  {movement.stock_after}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">
                                —
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {movement.reason || "—"}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

            {/* PAGINACIÓN */}

            {movements.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
                <p className="text-sm text-slate-500">
                  Página {currentPage} de {totalPages}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() =>
                      loadMovements(
                        Math.max(0, offset - PAGE_SIZE)
                      )
                    }
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() =>
                      loadMovements(offset + PAGE_SIZE)
                    }
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </main>
  );
}
