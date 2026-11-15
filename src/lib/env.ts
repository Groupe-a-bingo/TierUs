/**
 * Fail fast on a misconfigured environment instead of running half-broken
 * (e.g. an empty auth secret or the example password in production).
 */
const isProd = process.env.NODE_ENV === "production";
const problems: string[] = [];

const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;
for (const key of required) {
  if (!process.env[key]?.trim()) problems.push(`${key} is missing`);
}

const secret = process.env.BETTER_AUTH_SECRET ?? "";
if (secret && secret.length < 32) problems.push("BETTER_AUTH_SECRET must be at least 32 characters");

if (isProd) {
  for (const [key, value] of Object.entries(process.env)) {
    if (value?.includes("change-me")) problems.push(`${key} still uses the example value "change-me"`);
  }
}

// Per-IP rate limits trust the client IP header: without a proxy that sets it,
// anyone reaching the app directly can forge X-Forwarded-For (and Better Auth
// falls back to one shared bucket for a multi-hop X-Forwarded-For, letting
// anyone lock every sign-in out).
if (isProd && process.env.NEXT_PHASE !== "phase-production-build" && !process.env.CLIENT_IP_HEADER?.trim() && !process.env.TRUSTED_PROXIES?.trim()) {
  problems.push("CLIENT_IP_HEADER (or TRUSTED_PROXIES) is required in production: set it to the header your proxy writes the client IP to (e.g. x-real-ip)");
}

if (problems.length) {
  throw new Error(`Invalid environment (.env):\n- ${problems.join("\n- ")}`);
}

export {};
