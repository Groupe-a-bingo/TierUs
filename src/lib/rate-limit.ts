import "server-only";
import { headers } from "next/headers";
import { RateLimiterPostgres, RateLimiterRes } from "rate-limiter-flexible";
import { pool } from "@/db";
import { tooManyRequests } from "@/lib/errors";

type LimitName = keyof typeof LIMITS;

/** points per duration (seconds) — see plan "Sécurité". */
const LIMITS = {
  idea: { points: 10, duration: 60 * 60 * 24 },
  comment: { points: 10, duration: 60 },
  reaction: { points: 60, duration: 60 },
  upload: { points: 5, duration: 60 * 60 },
  submit: { points: 10, duration: 60 },
  modAction: { points: 60, duration: 60 },
  profile: { points: 20, duration: 60 * 60 },
  authEmail: { points: 20, duration: 60 * 60 },
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
      keyPrefix: `rl_${name}`,
      ...LIMITS[name],
    });
    limiters.set(name, l);
  }
  return l;
}

const trustedProxies = new Set(
  (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Client IP from X-Forwarded-For, walked right-to-left: the rightmost entry is
 * added by the closest hop (Next.js itself / our proxy) and can't be forged
 * by the client. Trusted proxies (exact IPs) are skipped.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!trustedProxies.has(chain[i])) return chain[i];
  }
  return chain[0] ?? "unknown";
}

async function consume(name: LimitName, key: string) {
  try {
    await limiter(name).consume(key);
  } catch (res) {
    if (res instanceof RateLimiterRes) {
      throw tooManyRequests(Math.ceil(res.msBeforeNext / 1000));
    }
    throw res; // DB error: fail closed
  }
}

/** Raw consume on an arbitrary key; returns seconds to wait, or 0 if allowed. */
export async function tryConsume(name: LimitName, key: string): Promise<number> {
  try {
    await limiter(name).consume(key);
    return 0;
  } catch (res) {
    if (res instanceof RateLimiterRes) return Math.max(1, Math.ceil(res.msBeforeNext / 1000));
    throw res;
  }
}

/**
 * Consume one point for `name` keyed on the user (if given) and always
 * one point on the global per-IP limiter. Throws HttpError(429).
 */
export async function rateLimit(name: LimitName, userId?: string) {
  const ip = await clientIp();
  await consume("ip", ip);
  await consume(name, userId ?? `ip:${ip}`);
}
