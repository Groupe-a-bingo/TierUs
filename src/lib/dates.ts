/**
 * The community's timezone: the 08:00 draw, day keys, and every time shown.
 * A constant, not a setting: the browser formats dates too and must agree
 * with the server (a server-only env var would silently diverge).
 */
export const APP_TZ = "Europe/Paris";

export const HOUR_MS = 60 * 60 * 1000;
/** Default local hour of the automatic daily draw (wall clock in APP_TZ, DST included); admins can change it (getDrawHour). */
export const DAILY_DRAW_HOUR = 8;
/** Default lifetime of a tier list: 24 real hours (not "until tomorrow 08:00"). */
export const DEFAULT_TTL_HOURS = 24;
export const MIN_TTL_HOURS = 1;
export const MAX_TTL_HOURS = 24 * 7;

/** YYYY-MM-DD of `d` in the app timezone. */
export function dayKey(d: Date = new Date(), tz = APP_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Wall-clock hour (0–23) of `d` in the app timezone. */
export function localHour(d: Date = new Date(), tz = APP_TZ): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));
}

/** Calendar arithmetic on a YYYY-MM-DD key (no timezone involved). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Day whose daily tier list is due at `now`: today from 08:00 local time,
 * nothing before. A daily missed during its day (empty bank, worker down) is
 * caught up later that same day (next worker tick, next idea, restart), never
 * the next morning: a prior day's catch-up drawn at e.g. 03:00 would overlap
 * the 08:00 draw five hours later with a second "daily" dated yesterday.
 */
export function dueDailyKey(now: Date = new Date(), tz = APP_TZ, drawHour = DAILY_DRAW_HOUR): string | null {
  return localHour(now, tz) >= drawHour ? dayKey(now, tz) : null;
}

/**
 * What the home and /mod say when no tier list is running. Before 08:00 an idea
 * entering an empty bank draws nothing (drawDaily is "not_due"): it waits for 08:00.
 */
export function nextDrawHint(bank: number, drawHour: number, now: Date = new Date(), tz = APP_TZ): string {
  const due = dueDailyKey(now, tz, drawHour) !== null;
  if (bank === 0) {
    return due
      ? "La banque d'idées est vide : la prochaine idée qui y entre lance la tier list du jour."
      : `La banque d'idées est vide : propose une idée avant ${drawHour} h pour avoir la tier list du jour.`;
  }
  return due ? `La prochaine tier list est tirée demain à ${drawHour} h.` : `La prochaine tier list est tirée à ${drawHour} h.`;
}

/** Active = started and not yet expired. The TTL only decides home vs archives. */
export function isActive(round: { startsAt: Date; expiresAt: Date }, now: Date = new Date()): boolean {
  return round.startsAt.getTime() <= now.getTime() && now.getTime() < round.expiresAt.getTime();
}

/** "encore 5 h" / "encore 12 min" / "encore 2 j" */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "archivée";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `encore ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `encore ${hours} h`;
  return `encore ${Math.floor(hours / 24)} j`;
}

export function formatDayFr(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "14:30" in the app timezone. */
export function formatTimeFr(d: Date, tz = APP_TZ): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
}

/** YYYY-MM-DD that is an actual calendar date (2026-02-31 → false). */
export function isDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
