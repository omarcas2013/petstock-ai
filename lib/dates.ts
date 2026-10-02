/*
 * Fechas de negocio en hora de Colombia.
 *
 * America/Bogota es UTC-5 todo el año (sin horario de verano),
 * así que el desfase fijo -05:00 es exacto.
 */

const BOGOTA_TIME_ZONE = "America/Bogota";
const BOGOTA_OFFSET = "-05:00";

/**
 * Devuelve "YYYY-MM-DD" del día en Bogotá,
 * sin importar la zona horaria del navegador o del servidor.
 */
export function getBogotaDateKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Primer día del mes actual en Bogotá ("YYYY-MM-01").
 */
export function getBogotaMonthStartKey(date: Date = new Date()) {
  return `${getBogotaDateKey(date).slice(0, 7)}-01`;
}

/**
 * Valida "YYYY-MM-DD" y que la fecha exista
 * (rechaza, por ejemplo, 2026-02-31).
 */
export function isValidDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Inicio del día "YYYY-MM-DD" en Bogotá, en ISO.
 */
export function bogotaStartOfDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00${BOGOTA_OFFSET}`).toISOString();
}

/**
 * Fin del día "YYYY-MM-DD" en Bogotá, en ISO.
 */
export function bogotaEndOfDay(dateKey: string) {
  return new Date(`${dateKey}T23:59:59.999${BOGOTA_OFFSET}`).toISOString();
}
