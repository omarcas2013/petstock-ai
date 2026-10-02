type PostgrestLikeError = {
  message?: string | null;
  code?: string | null;
} | null;

/**
 * Las funciones de negocio (RAISE EXCEPTION sin SQLSTATE explícito)
 * devuelven el código "P0001" y su mensaje es el que la función
 * escribió a propósito para el usuario ("Stock insuficiente", "El
 * producto X está inactivo", etc.): es seguro mostrarlo.
 *
 * Cualquier otro código es un error interno de Postgres (sintaxis,
 * restricción, permisos, columna inexistente...) y nunca debe
 * mostrarse tal cual: se registra en el servidor y al usuario se le
 * da `fallback`.
 */
export function rpcErrorMessage(
  error: PostgrestLikeError,
  fallback: string
): string {
  if (error?.code === "P0001" && error.message) {
    return error.message;
  }

  return fallback;
}
