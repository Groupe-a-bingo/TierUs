/**
 * Black-box tests against a running build (`next start`).
 * Env: E2E_BASE_URL (the app), TEST_DATABASE_URL (same DB the app uses, to
 * validate accounts), and the app must run with CLIENT_IP_HEADER=x-test-ip.
 * The suite writes to that database (sign-ups, status changes): like the
 * integration suite, it refuses any database whose name doesn't contain "test".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import sharp from "sharp";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is not set (HTTP tests need a dedicated test database)");
const testDbName = new URL(TEST_DB_URL).pathname.slice(1);
if (!/test/i.test(testDbName)) throw new Error(`Refusing to run HTTP tests on database "${testDbName}" (name must contain "test")`);
// the app under test must use that same database, never a real one
const appDb = process.env.DATABASE_URL;
if (appDb && new URL(appDb).pathname.slice(1) !== testDbName) {
  throw new Error(`DATABASE_URL points to "${new URL(appDb).pathname.slice(1)}", not the test database "${testDbName}"`);
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";
const pool = new Pool({ connectionString: TEST_DB_URL });
afterAll(() => pool.end());

let ipCounter = 0;
const runId = Math.floor(Math.random() * 250) + 1;
/** each logical client gets its own IP (unique per run) so per-IP limits never leak between tests or runs */
const newIp = () => `10.${runId}.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

type Client = { cookie: string; ip: string; email: string };

async function call(path: string, init: RequestInit & { client?: Client } = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  if (init.client) {
    headers.set("cookie", init.client.cookie);
    headers.set("x-test-ip", init.client.ip);
  }
  return fetch(BASE + path, { ...init, headers, redirect: "manual" });
}

async function signUp(name = "Testeur"): Promise<Client> {
  const ip = newIp();
  const email = `http-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", "x-test-ip": ip },
    body: JSON.stringify({ name, email, password: "motdepasse123" }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, ip, email };
}

const activate = (email: string) => pool.query(`update "user" set status = 'active' where email = $1`, [email]);

let member: Client;
beforeAll(async () => {
  member = await signUp("Membre");
  await activate(member.email);
});

describe("security headers", () => {
  it("every page has a nonce CSP and anti-framing / sniffing headers", async () => {
    const res = await call("/login");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("access control", () => {
  it("anonymous visitors are sent to /login and APIs answer 401", async () => {
    expect((await call("/")).headers.get("location")).toMatch(/\/login$/);
    expect((await call("/api/live")).status).toBe(401);
    expect((await call(`/api/files/${crypto.randomUUID()}`)).status).toBe(401);
  });

  it("new accounts are pending: kept on /pending, APIs answer 403", async () => {
    const p = await signUp("Nouveau");
    expect((await call("/", { client: p })).headers.get("location")).toMatch(/\/pending$/);
    expect((await call("/api/live", { client: p })).status).toBe(403);
  });

  it("nobody becomes admin by signing up", async () => {
    const p = await signUp("Admin wannabe");
    const { rows } = await pool.query(`select role, status from "user" where email = $1`, [p.email]);
    expect(rows[0]).toEqual({ role: "member", status: "pending" });
  });

  it("rejects invalid pseudos even through Better Auth's own endpoint", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json", "x-test-ip": newIp() },
      body: JSON.stringify({ name: "x".repeat(60), email: `long-${Date.now()}@test.local`, password: "motdepasse123" }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses auth requests from a foreign origin", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json", "x-test-ip": newIp() },
      body: JSON.stringify({ email: member.email, password: "motdepasse123" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("rate limiting", () => {
  it("sign-in is limited per IP (6th attempt in a minute → 429)", async () => {
    const ip = newIp();
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json", "x-test-ip": ip },
        body: JSON.stringify({ email: "nobody@test.local", password: "wrong-password" }),
      });
      codes.push(res.status);
    }
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe("avatars", () => {
  it("accepts a real image, serves it as WebP to members only", async () => {
    const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: "blue" } }).png().toBuffer();
    const up = await call("/api/upload/avatar", { method: "POST", body: new Uint8Array(img), client: member });
    expect(up.status).toBe(200);
    const { fileId } = (await up.json()) as { fileId: string };

    const ok = await call(`/api/files/${fileId}`, { client: member });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");

    const pending = await signUp("Curieux");
    expect((await call(`/api/files/${fileId}`, { client: pending })).status).toBe(403);
  });

  it("rejects HTML disguised as an image and cross-site uploads", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await call("/api/upload/avatar", { method: "POST", body: html, client: member })).status).toBe(400);
    const res = await fetch(`${BASE}/api/upload/avatar`, {
      method: "POST",
      headers: { cookie: member.cookie, "x-test-ip": member.ip, origin: "https://evil.example" },
      body: html,
    });
    expect(res.status).toBe(403);
  });
});

describe("pages", () => {
  it("board, ideas, profile render for members", async () => {
    for (const p of ["/", "/ideas", "/profile"]) {
      expect((await call(p, { client: member })).status, p).toBe(200);
    }
  });

  it("members can't open the moderation page (redirected, nothing leaks)", async () => {
    const res = await call("/mod", { client: member });
    const body = await res.text();
    // streamed pages redirect in the payload instead of a Location header
    expect(res.headers.get("location") ?? body).toMatch(/NEXT_REDIRECT|\/$/);
    expect(body).not.toContain("Inscriptions en attente");
    expect(body).not.toContain("Banque d");
  });

  it("regressions: impossible dates and repeated query params don't crash", async () => {
    const bad = await call("/r/2026-02-31", { client: member });
    expect(await bad.text()).toContain("Page introuvable");
    expect((await call("/?q=a&q=b", { client: member })).status).toBe(200);
  });

  it("tier lists are addressed by id; unknown ids and old date links without a tier list are 404", async () => {
    expect(await (await call(`/r/${crypto.randomUUID()}`, { client: member })).text()).toContain("Page introuvable");
    expect(await (await call("/r/1999-01-01", { client: member })).text()).toContain("Page introuvable");
    expect(await (await call("/r/not-an-id", { client: member })).text()).toContain("Page introuvable");
  });

  it("live endpoint answers a version fingerprint", async () => {
    const res = await call("/api/live", { client: member });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).v).toMatch(/^[0-9a-f]{32}$/);
  });
});
