import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertSameOrigin, badRequest, errorResponse, HttpError, runAction, tooManyRequests } from "@/lib/errors";

const req = (headers: Record<string, string>) => new Request("http://app.local/api/x", { method: "POST", headers });

describe("runAction", () => {
  it("returns data on success", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("maps HttpError to its message", async () => {
    expect(await runAction(async () => Promise.reject(badRequest("nope")))).toEqual({ ok: false, error: "nope" });
  });

  it("maps invalid client input (Zod) to a 400-style message, not a server error", async () => {
    expect(await runAction(async () => z.string().uuid().parse("x"))).toEqual({ ok: false, error: "Requête invalide" });
  });

  it("never leaks unexpected errors", async () => {
    const res = await runAction(async () => {
      throw new Error("db password is hunter2");
    });
    expect(res).toEqual({ ok: false, error: "Erreur serveur" });
  });

  it("lets Next.js redirect()/notFound() propagate", async () => {
    const nextSignal = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/login" });
    await expect(runAction(async () => Promise.reject(nextSignal))).rejects.toBe(nextSignal);
  });
});

describe("errorResponse", () => {
  it("serialises HttpError with status and Retry-After", async () => {
    const res = errorResponse(tooManyRequests(30));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toEqual({ error: "Trop de requêtes, réessaie plus tard" });
  });

  it("hides internal errors behind a 500", async () => {
    const res = errorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erreur serveur" });
  });
});

describe("assertSameOrigin (CSRF on route handlers)", () => {
  it("accepts the app's own origin", () => {
    expect(() => assertSameOrigin(req({ origin: "https://app.local", host: "app.local" }))).not.toThrow();
  });

  it.each([
    ["no Origin header", { host: "app.local" }],
    ["a foreign origin", { origin: "https://evil.example", host: "app.local" }],
    ["a malformed origin", { origin: "not a url", host: "app.local" }],
  ])("rejects %s", (_l, h) => {
    expect(() => assertSameOrigin(req(h))).toThrow(HttpError);
  });
});
