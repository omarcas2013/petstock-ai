type CountResult = {
  count: number | null;
  error: { code?: string; message?: string } | null;
};

type RangedResult<T> = {
  data: T[] | null;
  count: number | null;
  error: { code?: string; message?: string } | null;
};

/**
 * Pide una página con .range(offset, offset + limit - 1) y
 * select(..., {count: "exact"}). Si offset ya no cae dentro del total
 * (por ejemplo, alguien borró filas entre que el cliente cargó la
 * página anterior y pidió la siguiente), PostgREST responde 416 con
 * PGRST103 en vez de una lista vacía (confirmado contra la API real).
 *
 * En ese caso, en vez de dejar subir ese error como un 500/400, se
 * pide el total aparte (head: true, sin .range()) y se devuelve una
 * página vacía con ese total, para que el cliente pueda ajustar su
 * paginación sin ver un error.
 *
 * `runRanged` y `countOnly` deben aplicar exactamente los mismos
 * filtros; `countOnly` solo cambia el select por uno liviano con
 * head: true y sin .range().
 */
export async function rangedQuery<T>(
  runRanged: () => PromiseLike<RangedResult<T>>,
  countOnly: () => PromiseLike<CountResult>
): Promise<RangedResult<T>> {
  const result = await runRanged();

  if (result.error?.code === "PGRST103") {
    const { count, error } = await countOnly();

    if (error) {
      return { data: null, count: null, error };
    }

    return { data: [], count: count ?? 0, error: null };
  }

  return result;
}
