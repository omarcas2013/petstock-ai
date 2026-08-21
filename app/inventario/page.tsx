"use client";

import { useEffect, useState } from "react";

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
  products:
    | {
        name: string;
        sku: string | null;
      }
    | null;
};

export default function InventarioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMovements, setLoadingMovements] =
    useState(true);

  const [error, setError] = useState("");
  const [movementError, setMovementError] =
    useState("");

  const [search, setSearch] = useState("");

  const [movementOpen, setMovementOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null);

  const [movementType, setMovementType] =
    useState<MovementType>("entrada");

  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [movementLoading, setMovementLoading] =
    useState(false);
  const [movementMessage, setMovementMessage] =
    useState("");

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");

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

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando inventario"
      );
    } finally {
      setLoading(false);
    }
  }

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
          result.error ||
            "Error cargando movimientos"
        );
      }

      setMovements(result.movements || []);
    } catch (error) {
      console.error(error);

      setMovementError(
        error instanceof Error
          ? error.message
          : "Error cargando movimientos"
      );
    } finally {
      setLoadingMovements(false);
    }
  }

  useEffect(() => {
    loadProducts();
    loadMovements();
  }, []);

  function openMovement(product: Product) {
    setSelectedProduct(product);
    setMovementType("entrada");
    setQuantity("");
    setReason("");
    setMovementMessage("");
    setMovementOpen(true);
  }

  function closeMovement() {
    if (movementLoading) return;

    setMovementOpen(false);
    setSelectedProduct(null);
    setQuantity("");
    setReason("");
    setMovementMessage("");
  }

  async function handleMovement() {
    if (!selectedProduct) return;

    const numericQuantity = Number(quantity);

    if (
  movementType === "ajuste"
    ? (quantity === "" || numericQuantity < 0)
    : (!numericQuantity || numericQuantity <= 0)
) {
  setMovementMessage(
    movementType === "ajuste"
      ? "El nuevo stock no puede ser negativo."
      : "La cantidad debe ser mayor que 0."
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

      setMovementMessage(
        `Movimiento registrado correctamente. Stock: ${result.movement.stock_before} → ${result.movement.stock_after}`
      );

      await loadProducts();
      await loadMovements();

      setTimeout(() => {
        closeMovement();
      }, 1000);
    } catch (error) {
      console.error(error);

      setMovementMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el movimiento."
      );
    } finally {
      setMovementLoading(false);
    }
  }

  const filteredProducts = products.filter(
    (product) => {
      const text = search.toLowerCase();

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
          .includes(text)
      );
    }
  );

  function getStockStatus(product: Product) {
    if (product.stock <= 0) {
      return {
        text: "Agotado",
        className:
          "bg-red-100 text-red-700",
      };
    }

    if (
      product.stock <= product.minimum_stock
    ) {
      return {
        text: "Stock bajo",
        className:
          "bg-yellow-100 text-yellow-700",
      };
    }

    return {
      text: "Disponible",
      className:
        "bg-green-100 text-green-700",
    };
  }

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
    }).format(new Date(date));
  }

  function getMovementLabel(
    type: MovementType
  ) {
    if (type === "entrada") {
      return "Entrada";
    }

    if (type === "salida") {
      return "Salida";
    }

    return "Ajuste";
  }

  function getMovementClass(
    type: MovementType
  ) {
    if (type === "entrada") {
      return "bg-green-100 text-green-700";
    }

    if (type === "salida") {
      return "bg-red-100 text-red-700";
    }

    return "bg-blue-100 text-blue-700";
  }

  function getMovementQuantity(
    movement: Movement
  ) {
    if (movement.movement_type === "entrada") {
      return `+${movement.quantity}`;
    }

    if (movement.movement_type === "salida") {
      return `-${movement.quantity}`;
    }

    return movement.quantity.toString();
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
              Inventario
            </h1>

            <p className="mt-2 text-gray-600">
              Consulta y controla el stock de tus productos.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">

  <a
    href="/inventario/movimientos"
    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
  >
    🔄 Movimientos
  </a>

  <a
    href="/inventario/nuevo"
    className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800"
  >
    + Nuevo producto
  </a>

</div>
        </div>

        {/* TARJETAS */}

        <div className="mb-6 grid gap-4 md:grid-cols-3">

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

          <div className="rounded-2xl bg-white p-5 shadow-sm">
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
          </div>

        </div>

        {/* BUSCADOR */}

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-gray-700">
            Buscar producto
          </label>

          <input
            type="text"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Buscar por nombre, marca, categoría o SKU..."
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
              onClick={loadProducts}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">

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
                    <th className="w-[130px] whitespace-nowrap px-5 py-4 font-medium">
                        Acciones
                    </th>

                    </tr>
                </thead>

                <tbody className="divide-y">

                  {filteredProducts.map(
                    (product) => {
                      const status =
                        getStockStatus(product);

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
                                {product.presentation}
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.brand || "—"}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.category || "—"}
                          </td>
                          <td className="px-5 py-4 text-gray-700">
                            {product.suppliers?.name || "—"}
                          </td>

                          <td className="px-5 py-4 text-gray-700">
                            {product.pet_type || "—"}
                          </td>

                          <td className="px-5 py-4 font-mono text-sm text-gray-600">
                            {product.sku || "—"}
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
    <a
      href={`/inventario/${product.id}`}
      className="inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      Editar
    </a>

    <button
      onClick={() =>
        openMovement(product)
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

            {filteredProducts.length === 0 && (
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
                onClick={loadMovements}
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
                  <table className="w-full min-w-[1200px]">

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
                                ?.name || "—"}
                            </td>

                            <td className="px-5 py-4 font-mono text-sm text-gray-600">
                              {movement.products
                                ?.sku || "—"}
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

      {/* MODAL DE MOVIMIENTO */}

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
    {movementType === "entrada" && (
      <>
        Se agregarán{" "}
        <span className="font-semibold">
          {Number(quantity) || 0}
        </span>{" "}
        unidades.
      </>
    )}

    {movementType === "salida" && (
      <>
        Se retirarán{" "}
        <span className="font-semibold">
          {Number(quantity) || 0}
        </span>{" "}
        unidades.
      </>
    )}

    {movementType === "ajuste" && (
      <>
        El stock será establecido en{" "}
        <span className="font-semibold">
          {Number(quantity) || 0}
        </span>{" "}
        unidades.
      </>
    )}
  </div>

 {quantity && Number(quantity) > 0 && (
  <p className="mt-2 text-sm text-gray-500">
    Stock después:{" "}
    <span className="font-semibold text-gray-900">
      {movementType === "entrada"
        ? selectedProduct.stock +
          Number(quantity)
        : movementType === "salida"
        ? Number(quantity) > selectedProduct.stock
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
                    onChange={(e) =>
                      setMovementType(
                        e.target
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
                    min={movementType === "ajuste" ? "0" : "1"}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        e.target.value
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
                    onChange={(e) =>
                      setReason(
                        e.target.value
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
                    disabled={
                      movementLoading
                    }
                    className="rounded-lg border border-gray-300 px-5 py-3 font-medium disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleMovement
                    }
                    disabled={
                      movementLoading
                    }
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

    </main>
  );
}