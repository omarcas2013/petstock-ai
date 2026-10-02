/**
 * Convierte una cantidad recibida en el body a número.
 *
 * Devuelve null si el valor falta o viene vacío.
 * Number("") y Number(null) dan 0, y eso dejaba
 * el stock en 0 cuando una celda del Excel venía vacía.
 *
 * No valida que sea entero ni el rango: eso lo hace
 * cada ruta según sus reglas.
 */
export function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return null;
    }

    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export const INVENTORY_MANAGER_ROLES = [
  "owner",
  "admin",
  "manager",
];

/**
 * Convierte una cantidad escrita en formato es-CO
 * (como la exporta Excel en español) a entero.
 *
 * "1.000" -> 1000, "1000" -> 1000, "12,0" -> 12.
 * Devuelve null si está vacía, no es un entero >= 0
 * o el formato es ambiguo (por ejemplo "1.5": no es
 * un separador de miles válido ni un entero).
 */
export function parseEsCoInteger(
  value: string | undefined
): number | null {
  const text = (value ?? "").trim().replace(/\s/g, "");

  if (text === "") {
    return null;
  }

  // Solo aceptamos "." como separador de miles
  // en grupos de tres: 1.000, 12.345.678.
  const [integerPart, decimalPart, ...rest] =
    text.split(",");

  if (rest.length > 0) {
    return null;
  }

  if (
    !/^\d+$/.test(integerPart) &&
    !/^\d{1,3}(\.\d{3})+$/.test(integerPart)
  ) {
    return null;
  }

  if (
    decimalPart !== undefined &&
    !/^0*$/.test(decimalPart)
  ) {
    return null;
  }

  const parsed = Number(integerPart.replace(/\./g, ""));

  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Excel en español exporta CSV con ";".
 * Elegimos el delimitador según la fila de encabezados.
 */
export function detectCsvDelimiter(
  content: string
): "," | ";" {
  const headerLine = content.split(/\r?\n/, 1)[0] ?? "";

  const semicolons = headerLine.split(";").length - 1;
  const commas = headerLine.split(",").length - 1;

  return semicolons > commas ? ";" : ",";
}
