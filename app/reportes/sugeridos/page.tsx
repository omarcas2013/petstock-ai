"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/*
 * Tanda 6: sugeridos de compra.
 *
 * Demanda neta de los últimos N días (ventas − devoluciones) y compra
 * sugerida para cubrir 30 días más el stock mínimo, descontando las
 * compras pendientes y, si el negocio maneja lotes, las unidades que
 * vencerían antes de venderse. Opcionalmente crea una compra pendiente
 * por proveedor y descarga el resultado en Excel.
 */

type Item = {
  product_id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  presentation: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  stock: number;
  at_risk: number;
  available: number;
  pending: number;
  minimum_stock: number;
  maximum_stock: number;
  net_sold: number;
  daily_demand: number;
  days_of_stock: number | null;
  target: number;
  suggested: number;
  unit_cost: number | null;
};

type Report = {
  desde: string;
  hasta: string;
  days: number;
  coverage_days: number;
  manages_lots: boolean;
  items: Item[];
};

type Edit = {
  quantity: string;
  cost: string;
};

type Group = {
  key: string;
  supplierId: string | null;
  supplierName: string;
  items: Item[];
};

const DAY_OPTIONS = [30, 60, 90, 180];
const NO_SUPPLIER = "__sin_proveedor__";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0);
}

function parseQuantity(value: string) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function parseCost(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function sheetName(base: string, used: Set<string>) {
  const clean =
    base.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 28) ||
    "Proveedor";

  let name = clean;
  let i = 2;

  while (used.has(name.toLowerCase())) {
    name = `${clean.slice(0, 26)} ${i}`;
    i += 1;
  }

  used.add(name.toLowerCase());
  return name;
}

export default function SugeridosCompraPage() {
  const router = useRouter();

  const [days, setDays] = useState(90);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [onlySuggested, setOnlySuggested] = useState(true);
  const [search, setSearch] = useState("");

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const requestRef = useRef(0);

  const load = useCallback(async (selectedDays: number) => {
    const requestId = ++requestRef.current;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/reports/purchase-suggestions?dias=${selectedDays}`,
        { cache: "no-store" }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "No se pudo generar el reporte de sugeridos."
        );
      }

      if (requestId !== requestRef.current) {
        return;
      }

      const data = result.report as Report;

      const nextEdits: Record<string, Edit> = {};

      for (const item of data.items) {
        nextEdits[item.product_id] = {
          quantity: item.suggested > 0 ? String(item.suggested) : "",
          cost:
            item.unit_cost !== null && item.unit_cost !== undefined
              ? String(item.unit_cost)
              : "",
        };
      }

      setReport(data);
      setEdits(nextEdits);
    } catch (loadError) {
      if (requestId !== requestRef.current) {
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo generar el reporte de sugeridos."
      );
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(days);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [days, load]);

  function updateEdit(productId: string, field: keyof Edit, value: string) {
    setEdits((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? { quantity: "", cost: "" }),
        [field]: value,
      },
    }));
  }

  const visibleItems = useMemo(() => {
    if (!report) {
      return [];
    }

    const term = search.trim().toLowerCase();

    return report.items.filter((item) => {
      if (onlySuggested && item.suggested <= 0) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(term) ||
        (item.sku ?? "").toLowerCase().includes(term) ||
        (item.brand ?? "").toLowerCase().includes(term) ||
        (item.supplier_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [report, onlySuggested, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();

    for (const item of visibleItems) {
      const key = item.supplier_id ?? NO_SUPPLIER;

      if (!map.has(key)) {
        map.set(key, {
          key,
          supplierId: item.supplier_id,
          supplierName: item.supplier_name ?? "Sin proveedor",
          items: [],
        });
      }

      map.get(key)!.items.push(item);
    }

    return [...map.values()].sort((a, b) => {
      if (a.key === NO_SUPPLIER) return 1;
      if (b.key === NO_SUPPLIER) return -1;
      return a.supplierName.localeCompare(b.supplierName, "es");
    });
  }, [visibleItems]);

  function lineQuantity(item: Item) {
    return parseQuantity(edits[item.product_id]?.quantity ?? "");
  }

  function lineCost(item: Item) {
    return parseCost(edits[item.product_id]?.cost ?? "") ?? 0;
  }

  function groupTotals(group: Group) {
    let units = 0;
    let total = 0;
    let lines = 0;

    for (const item of group.items) {
      const q = lineQuantity(item);

      if (q > 0) {
        lines += 1;
        units += q;
        total += q * lineCost(item);
      }
    }

    return { units, total, lines };
  }

  const summary = useMemo(() => {
    let products = 0;
    let units = 0;
    let total = 0;

    for (const item of visibleItems) {
      const q = parseQuantity(edits[item.product_id]?.quantity ?? "");

      if (q > 0) {
        products += 1;
        units += q;
        total +=
          q * (parseCost(edits[item.product_id]?.cost ?? "") ?? 0);
      }
    }

    return { products, units, total, suppliers: groups.length };
  }, [visibleItems, edits, groups.length]);

  async function createPurchase(group: Group) {
    if (!group.supplierId || creating || !report) {
      return;
    }

    const items: {
      product_id: string;
      quantity: number;
      unit_cost: number;
    }[] = [];

    for (const item of group.items) {
      const quantity = lineQuantity(item);

      if (quantity <= 0) {
        continue;
      }

      const cost = parseCost(edits[item.product_id]?.cost ?? "");

      if (cost === null) {
        setError(
          `Revisa el costo unitario de "${item.name}": debe ser un número mayor o igual a 0.`
        );
        return;
      }

      items.push({
        product_id: item.product_id,
        quantity,
        unit_cost: cost,
      });
    }

    if (items.length === 0) {
      setError(
        `No hay cantidades a pedir para ${group.supplierName}.`
      );
      return;
    }

    const confirmed = window.confirm(
      `¿Crear una compra pendiente a ${group.supplierName} con ${items.length} producto(s)? Podrás revisarla en Compras antes de recibirla.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setCreating(group.key);
      setError("");
      setMessage("");

      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: group.supplierId,
          notes: `Generada desde sugeridos de compra (demanda de ${report.days} días).`,
          items,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo crear la compra.");
      }

      setMessage(
        `Compra pendiente creada para ${group.supplierName}. Los sugeridos ya descuentan esas unidades.`
      );

      await load(report.days);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear la compra."
      );
    } finally {
      setCreating(null);
    }
  }

  async function exportExcel() {
    if (!report || exporting) {
      return;
    }

    try {
      setExporting(true);
      setError("");

      const ExcelJS = (await import("exceljs")).default;

      const workbook = new ExcelJS.Workbook();
      const usedNames = new Set<string>();

      const money = '"$"#,##0';

      const all = workbook.addWorksheet(sheetName("Sugeridos", usedNames));

      const columns: { header: string; key: string; width: number }[] = [
        { header: "Proveedor", key: "supplier", width: 24 },
        { header: "Producto", key: "name", width: 36 },
        { header: "SKU", key: "sku", width: 14 },
        { header: `Vendidas ${report.days} días`, key: "net_sold", width: 14 },
        { header: "Demanda diaria", key: "daily", width: 14 },
        { header: "Stock", key: "stock", width: 10 },
      ];

      if (report.manages_lots) {
        columns.push({ header: "Por vencer", key: "at_risk", width: 11 });
      }

      columns.push(
        { header: "Pendiente", key: "pending", width: 11 },
        { header: "Stock mínimo", key: "min", width: 12 },
        { header: "Stock máximo", key: "max", width: 12 },
        { header: "Días de inventario", key: "days_of_stock", width: 14 },
        { header: "Sugerido", key: "suggested", width: 10 },
        { header: "A pedir", key: "quantity", width: 10 },
        { header: "Costo unitario", key: "cost", width: 14 },
        { header: "Subtotal", key: "subtotal", width: 16 }
      );

      all.columns = columns;

      for (const group of groups) {
        for (const item of group.items) {
          const quantity = lineQuantity(item);
          const cost = lineCost(item);

          all.addRow({
            supplier: group.supplierName,
            name: item.name,
            sku: item.sku ?? "",
            net_sold: item.net_sold,
            daily: Number(item.daily_demand),
            stock: item.stock,
            at_risk: item.at_risk,
            pending: item.pending,
            min: item.minimum_stock,
            max: item.maximum_stock || null,
            days_of_stock: item.days_of_stock,
            suggested: item.suggested,
            quantity,
            cost,
            subtotal: quantity * cost,
          });
        }
      }

      all.getRow(1).font = { bold: true };
      all.getColumn("daily").numFmt = "0.00";
      all.getColumn("cost").numFmt = money;
      all.getColumn("subtotal").numFmt = money;
      all.views = [{ state: "frozen", ySplit: 1 }];

      for (const group of groups) {
        const lines = group.items.filter((item) => lineQuantity(item) > 0);

        if (lines.length === 0) {
          continue;
        }

        const sheet = workbook.addWorksheet(
          sheetName(group.supplierName, usedNames)
        );

        sheet.columns = [
          { header: "Producto", key: "name", width: 36 },
          { header: "SKU", key: "sku", width: 14 },
          { header: "Presentación", key: "presentation", width: 16 },
          { header: "Cantidad", key: "quantity", width: 10 },
          { header: "Costo unitario", key: "cost", width: 14 },
          { header: "Subtotal", key: "subtotal", width: 16 },
        ];

        let total = 0;

        for (const item of lines) {
          const quantity = lineQuantity(item);
          const cost = lineCost(item);
          total += quantity * cost;

          sheet.addRow({
            name: item.name,
            sku: item.sku ?? "",
            presentation: item.presentation ?? "",
            quantity,
            cost,
            subtotal: quantity * cost,
          });
        }

        const totalRow = sheet.addRow({ name: "Total", subtotal: total });
        totalRow.font = { bold: true };

        sheet.getRow(1).font = { bold: true };
        sheet.getColumn("cost").numFmt = money;
        sheet.getColumn("subtotal").numFmt = money;
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sugeridos-compra-${report.hasta}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      console.error("Error exportando sugeridos:", exportError);
      setError("No se pudo generar el archivo de Excel.");
    } finally {
      setExporting(false);
    }
  }

  const showLots = report?.manages_lots ?? false;

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Reportes</p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Sugeridos de compra
            </h1>

            <p className="mt-2 text-gray-600">
              Demanda de los últimos {days} días. La compra sugerida
              cubre {report?.coverage_days ?? 30} días más el stock
              mínimo, descontando compras pendientes
              {showLots ? " y unidades que vencerían antes de venderse" : ""}.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/reportes")}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              Reportes
            </button>

            <button
              type="button"
              onClick={exportExcel}
              disabled={!report || exporting || loading}
              className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {exporting ? "Generando..." : "Descargar Excel"}
            </button>
          </div>
        </div>

        <section className="mb-6 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm md:flex-row md:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Demanda de los últimos
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} días
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-gray-700">
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Producto, SKU, marca o proveedor"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlySuggested}
              onChange={(event) => setOnlySuggested(event.target.checked)}
            />
            Solo productos con sugerido
          </label>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {message}{" "}
            <Link
              href="/inventario/entradas/compras"
              className="font-semibold underline"
            >
              Ver compras
            </Link>
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Productos a pedir", value: formatNumber(summary.products) },
            { label: "Unidades a pedir", value: formatNumber(summary.units) },
            { label: "Costo estimado", value: formatMoney(summary.total) },
            { label: "Proveedores", value: formatNumber(summary.suppliers) },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {card.value}
              </p>
            </div>
          ))}
        </section>

        {loading && (
          <p className="text-gray-500">Calculando sugeridos...</p>
        )}

        {!loading && report && groups.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-gray-600 shadow-sm">
            {onlySuggested
              ? "Con la demanda de este período no hay productos que necesiten compra."
              : "No hay productos activos."}
          </div>
        )}

        {!loading &&
          groups.map((group) => {
            const totals = groupTotals(group);

            return (
              <section
                key={group.key}
                className="mb-6 overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {group.supplierName}
                    </h2>

                    <p className="text-sm text-gray-500">
                      {totals.lines} producto(s) · {formatNumber(totals.units)} unidades ·{" "}
                      {formatMoney(totals.total)}
                    </p>
                  </div>

                  {group.supplierId ? (
                    <button
                      type="button"
                      onClick={() => createPurchase(group)}
                      disabled={creating !== null || totals.lines === 0}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {creating === group.key
                        ? "Creando..."
                        : "Crear compra pendiente"}
                    </button>
                  ) : (
                    <p className="text-sm text-amber-700">
                      Asigna un proveedor a estos productos para poder
                      crear la compra.
                    </p>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-right">Vendidas</th>
                        <th className="px-4 py-3 text-right">Demanda/día</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                        {showLots && (
                          <th className="px-4 py-3 text-right">Por vencer</th>
                        )}
                        <th className="px-4 py-3 text-right">Pendiente</th>
                        <th className="px-4 py-3 text-right">Mín / Máx</th>
                        <th className="px-4 py-3 text-right">Días inv.</th>
                        <th className="px-4 py-3 text-right">Sugerido</th>
                        <th className="px-4 py-3 text-right">A pedir</th>
                        <th className="px-4 py-3 text-right">Costo unit.</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {group.items.map((item) => {
                        const edit = edits[item.product_id] ?? {
                          quantity: "",
                          cost: "",
                        };

                        const quantity = parseQuantity(edit.quantity);
                        const cost = parseCost(edit.cost) ?? 0;

                        return (
                          <tr key={item.product_id}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">
                                {item.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {[item.sku, item.brand, item.presentation]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatNumber(item.net_sold)}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatNumber(item.daily_demand, 2)}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatNumber(item.stock)}
                            </td>

                            {showLots && (
                              <td
                                className={`px-4 py-3 text-right ${
                                  item.at_risk > 0 ? "font-semibold text-amber-700" : ""
                                }`}
                              >
                                {formatNumber(item.at_risk)}
                              </td>
                            )}

                            <td className="px-4 py-3 text-right">
                              {formatNumber(item.pending)}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatNumber(item.minimum_stock)} /{" "}
                              {item.maximum_stock > 0
                                ? formatNumber(item.maximum_stock)
                                : "—"}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {item.days_of_stock === null
                                ? "—"
                                : formatNumber(item.days_of_stock)}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold">
                              {formatNumber(item.suggested)}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={edit.quantity}
                                onChange={(event) =>
                                  updateEdit(
                                    item.product_id,
                                    "quantity",
                                    event.target.value
                                  )
                                }
                                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right"
                              />
                            </td>

                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                value={edit.cost}
                                placeholder="0"
                                onChange={(event) =>
                                  updateEdit(
                                    item.product_id,
                                    "cost",
                                    event.target.value
                                  )
                                }
                                className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-right"
                              />
                            </td>

                            <td className="px-4 py-3 text-right">
                              {formatMoney(quantity * cost)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
      </div>
    </main>
  );
}
