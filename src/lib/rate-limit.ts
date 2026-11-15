import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { RateLimiterPostgres, RateLimiterRes } from "rate-limiter-flexible";
import { pool } from "@/db";
import { tooManyRequests } from "@/lib/errors";

export type LimitName = keyof typeof LIMITS;

/** points per duration (seconds) — see plan "Sécurité". */
const LIMITS = {
  idea: { points: 10, duration: 60 * 60 * 24 },
  // a member editing or deleting their own ideas
  ideaEdit: { points: 30, duration: 60 * 60 },
  comment: { points: 10, duration: 60 },
  commentDelete: { points: 30, duration: 60 },
  // live polling: one tab polls every 2 s (30/min), leave room for a few tabs
  live: { points: 120, duration: 60 },
  reaction: { points: 60, duration: 60 },
  upload: { points: 5, duration: 60 * 60 },
  submit: { points: 10, duration: 60 },
  modAction: { points: 60, duration: 60 },
  profile: { points: 20, duration: 60 * 60 },
  // failed sign-ins per (email, ip): only failures count, so nobody can lock
  // someone else out just by knowing their email
  authFail: { points: 20, duration: 60 * 60 },
  // global per-IP safety net for any mutating call
  ip: { points: 120, duration: 60 },
} as const;

const limiters = new Map<LimitName, RateLimiterPostgres>();

function limiter(name: LimitName) {
  let l = limiters.get(name);
  if (!l) {
    l = new RateLimiterPostgres({
      storeClient: pool,
      storeType: "pool",
      tableName: "app_rate_limits",
      tableCreated: true, // managed by drizzle migrations
      clearExpiredByTimeout: true, // purge expired rows (no unbounded growth)
      keyPrefix: `rl_${name}`,
      ...LIMITS[name],
    });
    limiters.set(name, l);
  }
  return l;
}

/** Keys are hashed: no raw emails / IPs at rest in the rate-limit table. */
const hashKey = (k: string) => createHash("sha256").update(k).digest("base64url").slice(0, 32);

/* ---------------- client IP ---------------- */

/**
 * Where the real client IP comes from.
 * - CLIENT_IP_HEADER set (e.g. "cf-connecting-ip" behind Cloudflare, or
 *   "x-real-ip" set by your nginx): that single header is trusted as-is.
 *   Use it whenever the app is behind a proxy that overwrites the header.
 * - otherwise X-Forwarded-For walked right-to-left, skipping TRUSTED_PROXIES
 *   (exact IPs). Without a proxy in front, X-Forwarded-For is client-controlled:
 *   always set CLIENT_IP_HEADER in production.
 */
export const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.trim().toLowerCase() || "";
const trustedProxies = new Set(
  (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function ipFromHeaders(h: Headers): string {
  if (CLIENT_IP_HEADER) return h.get(CLIENT_IP_HEADER)?.trim() || "unknown";
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!trustedProxies.has(chain[i])) return chain[i];
  }
  return chain[0] ?? "unknown";
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

/* ---------------- consume / peek ---------------- */

async function consume(name: LimitName, key: string) {
  try {
    await limiter(name).consume(hashKey(key));
  } catch (res) {
    if (res instanceof RateLimiterRes) {
      throw tooManyRequests(Math.ceil(res.msBeforeNext / 1000));
    }
    throw res; // DB error: fail closed
  }
}

/** Seconds to wait if `key` is already over its limit (does not consume). */
export async function peek(name: LimitName, key: string): Promise<number> {
  const res = await limiter(name).get(hashKey(key));
  if (res && res.consumedPoints >= LIMITS[name].points) return Math.max(1, Math.ceil(res.msBeforeNext / 1000));
  return 0;
}

/** Count one hit without throwing (e.g. a failed sign-in). */
export async function record(name: LimitName, key: string): Promise<void> {
  await limiter(name)
    .consume(hashKey(key))
    .catch((res) => {
      if (!(res instanceof RateLimiterRes)) throw res;
    });
}

/**
 * Consume one point for `name` keyed on the user (if given) and, for
 * mutations, one point on the global per-IP limiter. Throws HttpError(429).
 * Reads (live polling) skip the per-IP budget, meant for mutations.
 */
export async function rateLimit(name: LimitName, userId?: string, { perIp = true } = {}) {
  const ip = await clientIp();
  if (perIp) await consume("ip", ip);
  await consume(name, userId ?? `ip:${ip}`);
}
