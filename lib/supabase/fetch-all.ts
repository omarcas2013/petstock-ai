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

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return { data: rows, error: null };
}
