/**
 * products.purchase_price sigue existiendo en la tabla hasta que corra
 * la migración "fase B" de product_costs (tanda 3, A1). Hasta
 * entonces, ninguna ruta debe leerla ni escribirla: por eso el select
 * nunca usa "*" sobre products, sino esta lista explícita de columnas
 * (todas menos purchase_price). El costo se trae aparte, desde
 * product_costs, solo para los roles que pueden verlo.
 */
export const PRODUCT_COLUMNS_WITHOUT_COST = `
  id,
  store_id,
  supplier_id,
  name,
  brand,
  category,
  pet_type,
  presentation,
  sku,
  sale_price,
  stock,
  minimum_stock,
  maximum_stock,
  created_at,
  updated_at,
  barcode,
  description,
  subcategory,
  unit_of_measure,
  tax_rate,
  tax_type,
  reorder_point,
  is_active,
  image_url,
  manages_lots
`.trim();

/**
 * Arma el select de productos. `extra` agrega relaciones (por ejemplo
 * suppliers(...)); `includeCost` agrega el embed a product_costs,
 * que trae null/vacío automáticamente por RLS para quien no sea
 * owner/admin/manager, pero igual solo se pide cuando ya sabemos que
 * el rol puede verlo (ver COST_VIEW_ROLES).
 */
export function buildProductSelect(options: {
  includeCost: boolean;
  extra?: string;
}) {
  const parts = [PRODUCT_COLUMNS_WITHOUT_COST];

  if (options.extra) {
    parts.push(options.extra.trim());
  }

  if (options.includeCost) {
    parts.push("product_costs ( purchase_price )");
  }

  return parts.join(",\n");
}

type ProductCostEmbed =
  | { purchase_price: number | string | null }
  | { purchase_price: number | string | null }[]
  | null;

/**
 * Forma de una fila de products devuelta por buildProductSelect().
 *
 * Como el string de columnas se arma en tiempo de ejecución (no es un
 * literal), Supabase no puede inferir el tipo del resultado por sí
 * solo; las rutas que usan buildProductSelect() hacen
 * `as unknown as ProductRow` / `ProductRow[]` sobre el resultado.
 */
export type ProductRow = {
  id: string;
  store_id: string;
  supplier_id: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  pet_type: string | null;
  presentation: string | null;
  sku: string | null;
  sale_price: number;
  stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
  created_at: string;
  updated_at: string;
  barcode: string | null;
  description: string | null;
  subcategory: string | null;
  unit_of_measure: string;
  tax_rate: number;
  tax_type: string;
  reorder_point: number;
  is_active: boolean;
  image_url: string | null;
  manages_lots: boolean;
  suppliers?:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  product_costs?: ProductCostEmbed;
};

/**
 * Aplana el embed de product_costs a un campo plano purchase_price,
 * igual que lo devolvía la API cuando esa columna todavía vivía en
 * products. Si no se pidió el embed (rol sin permiso para ver
 * costos), el campo queda ausente del objeto devuelto.
 */
export function flattenProductCost<
  T extends { product_costs?: ProductCostEmbed }
>(
  product: T
): Omit<T, "product_costs"> & { purchase_price?: number } {
  const { product_costs, ...rest } = product;

  if (product_costs === undefined) {
    return rest;
  }

  const cost = Array.isArray(product_costs)
    ? product_costs[0]
    : product_costs;

  return {
    ...rest,
    purchase_price: Number(cost?.purchase_price ?? 0),
  };
}
