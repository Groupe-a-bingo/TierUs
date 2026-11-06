import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { CLIENT_IP_HEADER, ipFromHeaders, peek, record } from "@/lib/rate-limit";
import { db, schema } from "@/db";
import "@/lib/env";

/** Same rule as the profile form: 2–32 visible characters. */
function checkName(name: unknown) {
  if (typeof name !== "string") return;
  const n = name.trim();
  if (n.length < 2 || n.length > 32) {
    throw new APIError("BAD_REQUEST", { message: "Le pseudo doit faire entre 2 et 32 caractères" });
  }
}

const trustedProxies = (process.env.TRUSTED_PROXIES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // extra public origins (e.g. a Cloudflare tunnel), comma-separated
  trustedOrigins: (process.env.EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      // input: false => clients can never set these through sign-up / update-user
      role: { type: "string", input: false, defaultValue: "member" },
      status: { type: "string", input: false, defaultValue: "pending" },
      avatarFileId: { type: "string", input: false, required: false },
      streak: { type: "number", input: false, defaultValue: 0 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // avoid a DB hit per request; role/status are re-read from the user row anyway
    cookieCache: { enabled: true, maxAge: 60 },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    ipAddress: {
      // same source of truth as our own limiter (see lib/rate-limit.ts)
      ipAddressHeaders: [CLIENT_IP_HEADER || "x-forwarded-for"],
      // Forwarded chain is walked right-to-left; only these hops are skipped.
      trustedProxies: trustedProxies.length ? trustedProxies : undefined,
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Everyone starts as a pending member. Admins are promoted from the
        // server only (npm run admin:promote -- <email>), never by signing up
        // with a magic email (that let anyone claim admin first).
        before: async (user) => {
          checkName(user.name);
          return { data: { ...user, name: user.name.trim(), role: "member", status: "pending" } };
        },
      },
      update: {
        before: async (user) => {
          checkName(user.name);
          return { data: user };
        },
      },
    },
  },
  hooks: {
    // Failed sign-ins per (email, ip), on top of Better Auth's per-IP limit.
    // Only failures count and the key includes the IP, so an attacker can't
    // lock a victim out of their account from elsewhere.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const key = failKey(ctx.body?.email, ctx.headers);
      if (!key) return;
      if ((await peek("authFail", key)) > 0) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Trop de tentatives, réessaie plus tard" });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const key = failKey(ctx.body?.email, ctx.headers);
      if (key && isAPIError(ctx.context.returned)) await record("authFail", key);
    }),
  },
  plugins: [nextCookies()],
});

function failKey(email: unknown, headers: Headers | undefined): string | null {
  if (typeof email !== "string" || !email.trim()) return null;
  const ip = headers ? ipFromHeaders(headers) : "unknown";
  return `${email.trim().toLowerCase()}|${ip}`;
}

export type Session = typeof auth.$Infer.Session;
