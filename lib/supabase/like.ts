/**
 * Escapa los caracteres comodín de LIKE/ILIKE (%, _) y la propia barra
 * de escape, para que un nombre que los contenga se busque tal cual
 * en vez de actuar como patrón (p. ej. "50% Off" no debe emparejar
 * cualquier nombre que empiece por "50").
 *
 * Postgres usa "\" como carácter de escape por defecto en LIKE/ILIKE.
 * También se escapa "*": PostgREST lo acepta como alias de "%" al
 * parsear el valor de un filtro en la URL (para evitarlo en entornos
 * donde "%" no se puede escribir fácil), así que un "*" literal en el
 * texto buscado también actuaría como comodín si no se escapa aquí.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, (match) => `\\${match}`);
}

/**
 * Envuelve un valor ya escapado con escapeLikePattern() en comillas
 * dobles, para usarlo dentro del string combinado de un filtro
 * .or()/.and() de PostgREST (confirmado contra la API real: sin esto,
 * un valor con comas, puntos o paréntesis rompe el parseo del árbol
 * lógico con PGRST100). Dentro de esas comillas, "\" y "\"" se escapan
 * con una barra adicional, como exige esa sintaxis.
 */
export function quoteOrFilterValue(value: string): string {
  const escaped = value.replace(/[\\"]/g, (match) => `\\${match}`);

  return `"${escaped}"`;
}
