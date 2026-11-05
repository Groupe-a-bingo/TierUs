export const APP_TZ = process.env.APP_TIMEZONE ?? "Europe/Paris";

/** YYYY-MM-DD of `d` in the app timezone. */
export function dayKey(d: Date = new Date(), tz = APP_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export const ROUND_DURATION_MS = 24 * 60 * 60 * 1000;

export function formatDayFr(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
