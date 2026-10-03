const PAGE_SIZE = 1000;

// Tope de seguridad para no traer cantidades absurdas en una sola respuesta.
const MAX_ROWS = 50000;

type PageResult<T, E> = {
  data: T[] | null;
  error: E | null;
};

/**
 * Supabase (PostgREST) devuelve como máximo 1000 filas
 * por consulta y corta el resto sin avisar.
 *
 * Esta función pide páginas con .range(from, to)
 * hasta traer todas las filas.
 *
 * La consulta debe tener un orden estable (por ejemplo
 * terminar en .order("id")) para que las páginas no
 * se solapen.
 *
 * Uso:
 *   const { data, error } = await fetchAllRows((from, to) =>
 *     supabase.from("products").select("*").order("id").range(from, to)
 *   );
 */
export async function fetchAllRows<T, E>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<PageResult<T, E>>
): Promise<PageResult<T, E>> {
  const rows: T[] = [];

  let lastPageSize = 0;

  for (
    let from = 0;
    from < MAX_ROWS;
    from += PAGE_SIZE
  ) {
    const { data, error } = await fetchPage(
      from,
      from + PAGE_SIZE - 1
    );

    if (error) {
      return { data: null, error };
    }

    const page = data ?? [];

    rows.push(...page);
    lastPageSize = page.length;

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  // Si la última página vino llena justo al llegar al tope,
  // es probable que haya más filas que nunca pedimos: avisamos
  // en el log en vez de devolver datos truncados en silencio.
  if (rows.length >= MAX_ROWS && lastPageSize === PAGE_SIZE) {
    console.warn(
      `fetchAllRows: se alcanzó el tope de ${MAX_ROWS} filas; la lectura puede estar incompleta.`
    );
  }

  return { data: rows, error: null };
}
