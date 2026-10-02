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
