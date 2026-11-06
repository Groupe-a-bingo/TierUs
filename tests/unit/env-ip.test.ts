import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const h = (o: Record<string, string>) => new Headers(o);

describe("client IP", () => {
  it("trusts only the configured proxy header when CLIENT_IP_HEADER is set", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    const { ipFromHeaders } = await import("@/lib/rate-limit");
    // a forged X-Forwarded-For is ignored
    expect(ipFromHeaders(h({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(ipFromHeaders(h({}))).toBe("unknown");
  });

  it("otherwise walks X-Forwarded-For right-to-left, skipping trusted proxies", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "");
    vi.stubEnv("TRUSTED_PROXIES", "10.0.0.1");
    const { ipFromHeaders } = await import("@/lib/rate-limit");
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });
});

describe("environment validation", () => {
  const base = {
    DATABASE_URL: "postgres://x@localhost/db",
    BETTER_AUTH_SECRET: "x".repeat(40),
    BETTER_AUTH_URL: "http://localhost:3010",
  };
  const load = async (env: Record<string, string>, nodeEnv = "test") => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.stubEnv("NODE_ENV", nodeEnv);
    return import("@/lib/env");
  };

  it("accepts a complete environment", async () => {
    await expect(load(base)).resolves.toBeDefined();
  });

  it("fails fast on a missing or weak secret", async () => {
    await expect(load({ ...base, BETTER_AUTH_SECRET: "" })).rejects.toThrow(/BETTER_AUTH_SECRET/);
    vi.resetModules();
    await expect(load({ ...base, BETTER_AUTH_SECRET: "short" })).rejects.toThrow(/32 characters/);
  });

  it("refuses example values in production", async () => {
    await expect(load({ ...base, POSTGRES_PASSWORD: "change-me" }, "production")).rejects.toThrow(/change-me/);
  });
});
