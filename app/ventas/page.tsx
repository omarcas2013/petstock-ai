"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  sale_price: number;
  stock: number;
  minimum_stock: number;
  is_active?: boolean;
};

// Los productos inactivos no se pueden vender.
function onlyActive(products: unknown): Product[] {
  return Array.isArray(products)
    ? (products as Product[]).filter(
        (product) => product.is_active !== false
      )
    : [];
}

type CartItem = {
  // Tanda 4: un mismo producto puede ir en varias líneas, una por
  // origen (sin ubicar o cada ubicación).
  lineKey: string;
  product: Product;
  quantity: number;
  // Tanda 4: de dónde sale. null = "sin ubicar"; "" = falta elegir.
  stockId: string | null | "";
};

// Existencia ubicada de un producto (fila de inventory_stock).
type StockOption = {
  id: string;
  label: string;
  quantity: number;
};

type StockApiRow = {
  id: string;
  product_id: string;
  quantity: number;
  branches: { name: string } | null;
  warehouses: { name: string } | null;
  locations: { name: string } | null;
};

async function fetchLocatedStock(): Promise<
  Record<string, StockOption[]>
> {
  const response = await fetch("/api/inventory/stock", {
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
        "Error cargando existencias por ubicación."
    );
  }

  const grouped: Record<string, StockOption[]> = {};

  for (const row of (result.stock ?? []) as StockApiRow[]) {
    const quantity = Number(row.quantity || 0);

    if (quantity <= 0) {
      continue;
    }

    (grouped[row.product_id] ??= []).push({
      id: row.id,
      label: stockLabel(row),
      quantity,
    });
  }

  for (const options of Object.values(grouped)) {
    options.sort((a, b) => b.quantity - a.quantity);
  }

  return grouped;
}

function stockLabel(row: StockApiRow) {
  if (row.locations?.name) {
    return `${row.warehouses?.name ?? "Almacén"} · ${row.locations.name}`;
  }

  if (row.warehouses?.name) {
    return row.warehouses.name;
  }

  return row.branches?.name ?? "Ubicación";
}

type SaleItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products: {
    name: string;
    sku: string | null;
  } | null;
};

type Sale = {
  id: string;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  total: number;
  created_at: string;
  sale_items: SaleItem[];
};

export default function VentasPage() {
  const router = useRouter();

  const [products, setProducts] =
    useState<Product[]>([]);

  const [cart, setCart] =
    useState<CartItem[]>([]);

  // product_id -> existencias ubicadas con cantidad > 0
  const [locatedByProduct, setLocatedByProduct] =
    useState<Record<string, StockOption[]>>({});

  const [sales, setSales] =
    useState<Sale[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [loadingSales, setLoadingSales] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [salesError, setSalesError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [customerName, setCustomerName] =
    useState("");

  const [paymentMethod, setPaymentMethod] =
    useState("efectivo");

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/products"
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando productos."
        );
      }

      setProducts(
        onlyActive(result.products)
      );
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando productos."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadLocatedStock() {
    try {
      setLocatedByProduct(await fetchLocatedStock());
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Error cargando existencias por ubicación."
      );
    }
  }

  function locatedTotal(productId: string) {
    return (locatedByProduct[productId] ?? []).reduce(
      (sum, option) => sum + option.quantity,
      0
    );
  }

  function unlocatedQuantity(product: Product) {
    // Usar el stock más reciente (el del carrito puede estar viejo).
    const current =
      products.find((candidate) => candidate.id === product.id) ??
      product;

    return Math.max(
      Number(current.stock || 0) - locatedTotal(product.id),
      0
    );
  }

  // Máximo vendible en la línea según el origen elegido.
  function maxForItem(item: CartItem) {
    if (item.stockId === "") {
      return 0;
    }

    if (item.stockId === null) {
      return unlocatedQuantity(item.product);
    }

    const option = (
      locatedByProduct[item.product.id] ?? []
    ).find((candidate) => candidate.id === item.stockId);

    return option?.quantity ?? 0;
  }

  // Orígenes ya usados por otras líneas del mismo producto.
  function usedSources(
    productId: string,
    exceptLineKey?: string
  ) {
    return new Set(
      cart
        .filter(
          (item) =>
            item.product.id === productId &&
            item.lineKey !== exceptLineKey &&
            item.stockId !== ""
        )
        .map((item) => item.stockId ?? "__sin_ubicar__")
    );
  }

  function changeSource(
    lineKey: string,
    value: string
  ) {
    setCart((previous) =>
      previous.map((item) => {
        if (item.lineKey !== lineKey) {
          return item;
        }

        const stockId =
          value === "__sin_ubicar__" ? null : value;

        const next = { ...item, stockId };
        const max = maxForItem(next);

        return {
          ...next,
          quantity: Math.max(1, Math.min(item.quantity, max || 1)),
        };
      })
    );
  }

  async function loadSales() {
    try {
      setLoadingSales(true);
      setSalesError("");

      // Vista previa de ventas recientes: límite explícito, no el
      // valor por defecto de la API. El historial completo con
      // paginación y filtros vive en /ventas/historial.
      const response = await fetch(
        "/api/sales?limit=10"
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Error cargando ventas."
        );
      }

      setSales(
        Array.isArray(result.sales)
          ? result.sales
          : []
      );
    } catch (error) {
      console.error(error);

      setSalesError(
        error instanceof Error
          ? error.message
          : "Error cargando ventas."
      );
    } finally {
      setLoadingSales(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchInitialData() {
      try {
        const [
          productsResponse,
          salesResponse,
        ] = await Promise.all([
          fetch("/api/products", {
            method: "GET",
            cache: "no-store",
          }),

          fetch("/api/sales?limit=10", {
            method: "GET",
            cache: "no-store",
          }),
        ]);

        const productsResult =
          await productsResponse.json();

        const salesResult =
          await salesResponse.json();

        if (!productsResponse.ok) {
          throw new Error(
            productsResult.error ||
              "Error cargando productos."
          );
        }

        if (!salesResponse.ok) {
          throw new Error(
            salesResult.error ||
              "Error cargando ventas."
          );
        }

        if (cancelled) {
          return;
        }

        setProducts(
          onlyActive(productsResult.products)
        );

        setSales(
          Array.isArray(
            salesResult.sales
          )
            ? salesResult.sales
            : []
        );

        setError("");
        setSalesError("");

      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(error);

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Error cargando datos.";

        setError(errorMessage);
        setSalesError(errorMessage);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingSales(false);
        }
      }
    }

    // Existencias por ubicación (para elegir de dónde sale cada
    // producto en el carrito). Aparte, para que un fallo aquí no
    // marque como fallido el historial de ventas.
    async function fetchInitialLocated() {
      try {
        const located = await fetchLocatedStock();

        if (!cancelled) {
          setLocatedByProduct(located);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);

          setError(
            error instanceof Error
              ? error.message
              : "Error cargando existencias por ubicación."
          );
        }
      }
    }

    fetchInitialData();
    fetchInitialLocated();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const text = search
      .trim()
      .toLowerCase();

    if (!text) {
      return products;
    }

    return products.filter(
      (product) => {
        return (
          product.name
            .toLowerCase()
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
  }, [products, search]);

  function formatPrice(
    price: number
  ) {
    return new Intl.NumberFormat(
      "es-CO",
      {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }
    ).format(price);
  }

  function formatDate(
    date: string
  ) {
    return new Intl.DateTimeFormat(
      "es-CO",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(new Date(date));
  }

  function formatPaymentMethod(
    method: string
  ) {
    const methods: Record<
      string,
      string
    > = {
      efectivo: "Efectivo",
      tarjeta: "Tarjeta",
      transferencia:
        "Transferencia",
      otro: "Otro",
    };

    return methods[method] || method;
  }

  function addToCart(
    product: Product
  ) {
    setMessage("");

    if (product.stock <= 0) {
      setMessage(
        `No hay stock disponible de ${product.name}.`
      );
      return;
    }

    const lines = cart.filter(
      (item) => item.product.id === product.id
    );

    // 1. Sumar a una línea que todavía tenga cupo en su origen.
    const withRoom = lines.find(
      (item) =>
        item.stockId !== "" &&
        item.quantity < maxForItem(item)
    );

    if (withRoom) {
      setCart((previous) =>
        previous.map((item) =>
          item.lineKey === withRoom.lineKey
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      return;
    }

    if (lines.some((item) => item.stockId === "")) {
      setMessage(
        `Elige de qué ubicación sale ${product.name}.`
      );
      return;
    }

    // 2. Abrir otra línea desde un origen que aún no se use.
    const used = usedSources(product.id);
    const located = locatedByProduct[product.id] ?? [];

    const unlocatedFree =
      !used.has("__sin_ubicar__") &&
      unlocatedQuantity(product) > 0;

    const locatedFree = located.filter(
      (option) => !used.has(option.id)
    );

    if (!unlocatedFree && locatedFree.length === 0) {
      setMessage(
        `No hay más unidades disponibles de ${product.name}.`
      );
      return;
    }

    // Si hay unidades sin ubicar, sale de ahí por defecto; si no, el
    // vendedor elige la ubicación.
    setCart((previous) => [
      ...previous,
      {
        lineKey: crypto.randomUUID(),
        product,
        quantity: 1,
        stockId: unlocatedFree ? null : "",
      },
    ]);
  }

  function updateQuantity(
    lineKey: string,
    quantity: number
  ) {
    if (quantity <= 0) {
      removeFromCart(lineKey);
      return;
    }

    setCart((previous) =>
      previous.map((item) => {
        if (item.lineKey !== lineKey) {
          return item;
        }

        const safeQuantity =
          Math.min(
            quantity,
            Math.max(maxForItem(item), 1)
          );

        return {
          ...item,
          quantity: safeQuantity,
        };
      })
    );
  }

  function removeFromCart(
    lineKey: string
  ) {
    setCart((previous) =>
      previous.filter(
        (item) => item.lineKey !== lineKey
      )
    );
  }

  function clearCart() {
    setCart([]);
    setMessage("");
  }

  const total = useMemo(() => {
    return cart.reduce(
      (sum, item) =>
        sum +
        item.product.sale_price *
          item.quantity,
      0
    );
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    );
  }, [cart]);

  async function handleSale() {
    setMessage("");

    if (cart.length === 0) {
      setMessage(
        "Agrega al menos un producto a la venta."
      );
      return;
    }

    const missingSource = cart.find(
      (item) => item.stockId === ""
    );

    if (missingSource) {
      setMessage(
        `Elige de qué ubicación sale ${missingSource.product.name}.`
      );
      return;
    }

    const overLimit = cart.find(
      (item) => item.quantity > maxForItem(item)
    );

    if (overLimit) {
      setMessage(
        `No hay suficientes unidades de ${overLimit.product.name} en el origen elegido (máximo ${maxForItem(
          overLimit
        )}).`
      );
      return;
    }

    setSaving(true);

    try {
      const items = cart.map(
        (item) => ({
          product_id:
            item.product.id,
          quantity:
            item.quantity,
          stock_id:
            item.stockId || null,
        })
      );

      const response = await fetch(
        "/api/sales",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            items,
            payment_method:
              paymentMethod,
            customer_name:
              customerName.trim() ||
              null,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No se pudo registrar la venta."
        );
      }

      // La venta ya quedó registrada: vaciamos el carrito
      // antes de cualquier otra cosa para que un reintento
      // no la duplique.
      setCart([]);
      setCustomerName("");

      const saleTotal = Number(
        result.sale?.total ?? total
      );

      setMessage(
        `Venta registrada correctamente. Total: ${formatPrice(
          saleTotal
        )}`
      );

      await loadProducts();
      await loadLocatedStock();
      await loadSales();
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la venta."
      );

      // Otra venta pudo cambiar las existencias: refrescar para que el
      // selector de origen muestre cantidades reales.
      void loadProducts();
      void loadLocatedStock();
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
              Nueva venta
            </h1>

            <p className="mt-2 text-gray-600">
              Selecciona productos y registra la venta.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/inventario"
                )
              }
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              Inventario
            </button>
          </div>
        </div>

        {/* MENSAJES */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-gray-700 shadow-sm">
            {message}
          </div>
        )}

        {/* NUEVA VENTA */}

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">

          {/* PRODUCTOS */}

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700">
                Buscar producto
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Nombre, marca, categoría o SKU..."
                className="mt-2 w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-500">
                Cargando productos...
              </div>
            ) : filteredProducts.length ===
              0 ? (
              <div className="rounded-xl bg-gray-50 p-10 text-center">
                <p className="font-medium text-gray-700">
                  No encontramos productos.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Prueba con otro término.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map(
                  (product) => {
                    const cartItem =
                      cart.find(
                        (item) =>
                          item.product.id ===
                          product.id
                      );

                    const quantityInCart =
                      cartItem?.quantity ||
                      0;

                    const unavailable =
                      product.stock <= 0 ||
                      quantityInCart >=
                        product.stock;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() =>
                          addToCart(
                            product
                          )
                        }
                        disabled={
                          unavailable
                        }
                        className="rounded-xl border border-gray-200 p-4 text-left transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="font-semibold text-gray-900">
                          {product.name}
                        </div>

                        {product.brand && (
                          <div className="mt-1 text-sm text-gray-500">
                            {product.brand}
                          </div>
                        )}

                        {product.sku && (
                          <div className="mt-2 font-mono text-xs text-gray-400">
                            {product.sku}
                          </div>
                        )}

                        <div className="mt-3 flex items-end justify-between gap-2">
                          <span className="font-bold text-gray-900">
                            {formatPrice(
                              product.sale_price
                            )}
                          </span>

                          <span className="text-xs text-gray-500">
                            Stock:{" "}
                            {product.stock}
                          </span>
                        </div>

                        {quantityInCart >
                          0 && (
                          <div className="mt-2 text-xs font-medium text-gray-700">
                            En carrito:{" "}
                            {quantityInCart}
                          </div>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </section>

          {/* CARRITO */}

          <aside className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Carrito
                </h2>

                <p className="text-sm text-gray-500">
                  {totalItems}{" "}
                  {totalItems === 1
                    ? "unidad"
                    : "unidades"}
                </p>
              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Vaciar
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <p className="font-medium text-gray-700">
                  El carrito está vacío.
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Selecciona productos para comenzar.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map(
                  (item) => (
                    <div
                      key={item.lineKey}
                      className="border-b pb-4"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {
                              item
                                .product
                                .name
                            }
                          </p>

                          <p className="text-sm text-gray-500">
                            {formatPrice(
                              item
                                .product
                                .sale_price
                            )}{" "}
                            c/u
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(item.lineKey)
                          }
                          className="text-sm text-red-600"
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center rounded-lg border">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.lineKey,
                                item.quantity -
                                  1
                              )
                            }
                            className="px-3 py-2"
                          >
                            −
                          </button>

                          <span className="min-w-10 text-center font-medium">
                            {
                              item.quantity
                            }
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.lineKey,
                                item.quantity +
                                  1
                              )
                            }
                            disabled={
                              item.quantity >=
                              maxForItem(item)
                            }
                            className="px-3 py-2 disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>

                        <span className="font-semibold">
                          {formatPrice(
                            item
                              .product
                              .sale_price *
                              item.quantity
                          )}
                        </span>
                      </div>

                      {(locatedByProduct[item.product.id] ?? [])
                        .length > 0 && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-gray-600">
                            Sale de
                          </label>

                          <select
                            value={
                              item.stockId === null
                                ? "__sin_ubicar__"
                                : item.stockId
                            }
                            onChange={(e) =>
                              changeSource(
                                item.lineKey,
                                e.target.value
                              )
                            }
                            className={`mt-1 w-full rounded-lg border p-2 text-sm ${
                              item.stockId === ""
                                ? "border-red-400 bg-red-50"
                                : "border-gray-300"
                            }`}
                          >
                            <option value="" disabled>
                              Elige la ubicación…
                            </option>

                            <option
                              value="__sin_ubicar__"
                              disabled={
                                unlocatedQuantity(
                                  item.product
                                ) === 0 ||
                                usedSources(
                                  item.product.id,
                                  item.lineKey
                                ).has("__sin_ubicar__")
                              }
                            >
                              Sin ubicar (
                              {unlocatedQuantity(
                                item.product
                              )}
                              )
                            </option>

                            {(
                              locatedByProduct[
                                item.product.id
                              ] ?? []
                            ).map((option) => (
                              <option
                                key={option.id}
                                value={option.id}
                                disabled={usedSources(
                                  item.product.id,
                                  item.lineKey
                                ).has(option.id)}
                              >
                                {option.label} (
                                {option.quantity})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Cliente
                </label>

                <input
                  type="text"
                  value={customerName}
                  onChange={(e) =>
                    setCustomerName(
                      e.target.value
                    )
                  }
                  placeholder="Opcional"
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Método de pago
                </label>

                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(
                      e.target.value
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 p-3"
                >
                  <option value="efectivo">
                    Efectivo
                  </option>

                  <option value="tarjeta">
                    Tarjeta
                  </option>

                  <option value="transferencia">
                    Transferencia
                  </option>

                  <option value="otro">
                    Otro
                  </option>
                </select>
              </div>

              <div className="border-t pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">
                    Total
                  </span>

                  <span className="text-2xl font-bold text-gray-900">
                    {formatPrice(total)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSale}
                disabled={
                  saving ||
                  cart.length === 0
                }
                className="w-full rounded-lg bg-gray-900 px-5 py-4 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Registrando venta..."
                  : "Registrar venta"}
              </button>
            </div>
          </aside>
        </div>

        {/* HISTORIAL DE VENTAS */}

        <section className="mt-8 rounded-2xl bg-white shadow-sm">
          <div className="border-b px-6 py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Ventas recientes
                </h2>

                <p className="text-sm text-gray-500">
                  Las 10 ventas más recientes.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    router.push("/ventas/historial")
                  }
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Ver historial completo
                </button>

                <button
                  type="button"
                  onClick={loadSales}
                  disabled={loadingSales}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {loadingSales
                    ? "Cargando..."
                    : "Actualizar"}
                </button>
              </div>
            </div>
          </div>

          {salesError && (
            <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              <p className="font-medium">
                Error cargando ventas
              </p>

              <p className="mt-1 text-sm">
                {salesError}
              </p>
            </div>
          )}

          {loadingSales ? (
            <div className="p-10 text-center text-gray-500">
              Cargando historial...
            </div>
          ) : !salesError &&
            sales.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium text-gray-700">
                No hay ventas registradas.
              </p>
            </div>
          ) : !salesError ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead className="border-b bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-6 py-4 font-medium">
                      Fecha
                    </th>

                    <th className="px-6 py-4 font-medium">
                      Cliente
                    </th>

                    <th className="px-6 py-4 font-medium">
                      Productos
                    </th>

                    <th className="px-6 py-4 font-medium">
                      Pago
                    </th>

                    <th className="px-6 py-4 text-right font-medium">
                      Total
                    </th>

                    <th className="px-6 py-4 text-right font-medium">
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {sales.map(
                    (sale) => (
                      <tr
                        key={sale.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {formatDate(
                            sale.created_at
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">
                            {sale.customer_name ||
                              "Cliente general"}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="max-w-[280px]">
                            {sale.sale_items
                              .map(
                                (
                                  item
                                ) =>
                                  item
                                    .products
                                    ?.name ||
                                  "Producto"
                              )
                              .join(", ")}

                            <p className="mt-1 text-xs text-gray-500">
                              {sale.sale_items.reduce(
                                (
                                  sum,
                                  item
                                ) =>
                                  sum +
                                  item.quantity,
                                0
                              )}{" "}
                              unidad(es)
                            </p>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatPaymentMethod(
                            sale.payment_method
                          )}
                        </td>

                        <td className="px-6 py-4 text-right font-bold text-gray-900">
                          {formatPrice(
                            sale.total
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/ventas/${sale.id}`
                              )
                            }
                            className="whitespace-nowrap rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}