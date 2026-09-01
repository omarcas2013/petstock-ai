"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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

export default function MovimientosPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
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

  /*
   * CARGAR MOVIMIENTOS
   */
  const loadMovements = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/inventory/movements");

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Error cargando movimientos"
        );
      }

      setMovements(result.movements || []);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando movimientos"
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
   *
   * Se mantiene fuera del cuerpo directo del efecto.
   * El setTimeout evita la regla react-hooks/set-state-in-effect.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        loadMovements(),
        loadProducts(),
      ]);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadMovements, loadProducts]);

  /*
   * PRODUCTO SELECCIONADO
   */
  const selectedProduct = products.find(
    (product) => product.id === productId
  );

  /*
   * FILTRAR MOVIMIENTOS
   */
  const filteredMovements = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return movements.filter((movement) => {
      const matchesType =
        typeFilter === "todos" ||
        movement.movement_type === typeFilter;

      if (!matchesType) {
        return false;
      }

      if (!searchText) {
        return true;
      }

      const productName =
        movement.products?.name?.toLowerCase() || "";

      const sku =
        movement.products?.sku?.toLowerCase() || "";

      const movementReason =
        movement.reason?.toLowerCase() || "";

      return (
        productName.includes(searchText) ||
        sku.includes(searchText) ||
        movementReason.includes(searchText)
      );
    });
  }, [movements, search, typeFilter]);

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
   * REINICIAR FORMULARIO
   */
  function resetForm() {
    setProductId("");
    setMovementType("entrada");
    setQuantity("");
    setReason("");
    setFormError("");
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
        loadMovements(),
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
              Movimientos de inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Consulta y registra entradas,
              salidas y ajustes de inventario.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/inventario"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Volver al inventario
            </Link>

            <button
              type="button"
              onClick={() => {
                setFormError("");
                setShowForm(true);
              }}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              + Nuevo movimiento
            </button>
          </div>
        </div>

        {/* FORMULARIO */}

        {showForm && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-900">
                Nuevo movimiento
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Registra un cambio de inventario.
              </p>
            </div>

            {formError && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
                  <label className="text-sm font-medium text-gray-700">
                    Producto
                  </label>

                  <select
                    value={productId}
                    onChange={(event) =>
                      setProductId(event.target.value)
                    }
                    disabled={
                      loadingProducts || saving
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
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
                  <label className="text-sm font-medium text-gray-700">
                    Tipo de movimiento
                  </label>

                  <select
                    value={movementType}
                    onChange={(event) =>
                      setMovementType(
                        event.target.value as MovementType
                      )
                    }
                    disabled={saving}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
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
                  <label className="text-sm font-medium text-gray-700">
                    {movementType === "ajuste"
                      ? "Nuevo stock"
                      : "Cantidad"}
                  </label>

                  <input
                    type="number"
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
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />

                  {selectedProduct && (
                    <p className="mt-2 text-sm text-gray-500">
                      Stock actual:{" "}
                      <span className="font-semibold text-gray-700">
                        {selectedProduct.stock}
                      </span>
                    </p>
                  )}
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
                      setReason(event.target.value)
                    }
                    disabled={saving}
                    placeholder="Ej. Conteo físico"
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>

              {/* BOTONES */}

              <div className="flex justify-end gap-3 border-t pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="text-sm font-medium text-gray-700">
                Buscar
              </label>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Producto, SKU o motivo..."
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
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
                className="mt-2 w-full rounded-lg border border-gray-300 p-3"
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
        </div>

        {/* CONTADOR */}

        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Mostrando{" "}
            <span className="font-semibold text-gray-700">
              {filteredMovements.length}
            </span>{" "}
            movimiento
            {filteredMovements.length !== 1
              ? "s"
              : ""}
          </p>
        </div>

        {/* LOADING */}

        {loading && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500">
              Cargando movimientos...
            </p>
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            <p className="font-medium">
              Error cargando movimientos
            </p>

            <p className="mt-1 text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() => {
                void loadMovements();
              }}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {/* TABLA */}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            {filteredMovements.length === 0 ? (
              <div className="p-12 text-center">

                <div className="text-4xl">
                  📦
                </div>

                <p className="mt-4 font-medium text-gray-700">
                  No encontramos movimientos.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Prueba cambiando los filtros.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[900px]">

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
                        Stock
                      </th>

                      <th className="px-5 py-4 font-medium">
                        Motivo
                      </th>

                    </tr>
                  </thead>

                  <tbody className="divide-y">

                    {filteredMovements.map(
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

                          <td className="px-5 py-4">
                            <div className="font-medium text-gray-900">
                              {movement.products?.name ||
                                "—"}
                            </div>
                          </td>

                          <td className="px-5 py-4 font-mono text-sm text-gray-600">
                            {movement.products?.sku ||
                              "—"}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${getTypeClass(
                                movement.movement_type
                              )}`}
                            >
                              {getTypeLabel(
                                movement.movement_type
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-semibold">
                            {getQuantity(movement)}
                          </td>

                          <td className="px-5 py-4 text-sm">
                            {movement.stock_before !==
                              null &&
                            movement.stock_after !==
                              null ? (
                              <span className="font-medium text-gray-700">
                                {movement.stock_before}{" "}
                                →{" "}
                                {movement.stock_after}
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                —
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {movement.reason || "—"}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </div>
        )}

      </div>
    </main>
  );
}