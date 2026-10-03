/**
 * Escapa los caracteres comodín de LIKE/ILIKE (%, _) y la propia barra
 * de escape, para que un nombre que los contenga se busque tal cual
 * en vez de actuar como patrón (p. ej. "50% Off" no debe emparejar
 * cualquier nombre que empiece por "50").
 *
 * Postgres usa "\" como carácter de escape por defecto en LIKE/ILIKE.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
