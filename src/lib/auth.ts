import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tryConsume } from "@/lib/rate-limit";
import { db, schema } from "@/db";

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
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
      ipAddressHeaders: ["x-forwarded-for"],
      // Forwarded chain is walked right-to-left; only these hops are skipped.
      trustedProxies: trustedProxies.length ? trustedProxies : undefined,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (adminEmail && user.email.toLowerCase() === adminEmail) {
            return { data: { ...user, role: "admin", status: "active" } };
          }
          return { data: { ...user, role: "member", status: "pending" } };
        },
      },
    },
  },
  hooks: {
    // Per-email limit on top of Better Auth's per-IP limit (credential stuffing)
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-up/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
      if (!email) return;
      const wait = await tryConsume("authEmail", email);
      if (wait > 0) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: "Trop de tentatives pour cet email, réessaie plus tard",
        });
      }
    }),
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
