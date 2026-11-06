import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { peek, record } from "@/lib/rate-limit";
import { resetDb } from "../support/factories";

beforeEach(resetDb);

describe("rate limit store", () => {
  it("only blocks after 20 recorded failures, per (email, ip) key", async () => {
    const key = "victim@test.local|1.2.3.4";
    for (let i = 0; i < 19; i++) await record("authFail", key);
    expect(await peek("authFail", key)).toBe(0);
    await record("authFail", key);
    expect(await peek("authFail", key)).toBeGreaterThan(0);
    // same email from another IP is untouched (no lock-out of the real owner)
    expect(await peek("authFail", "victim@test.local|5.6.7.8")).toBe(0);
  });

  it("peek never consumes", async () => {
    for (let i = 0; i < 50; i++) await peek("authFail", "x@test.local|1.1.1.1");
    expect(await peek("authFail", "x@test.local|1.1.1.1")).toBe(0);
  });

  it("stores hashed keys only (no raw email at rest)", async () => {
    await record("authFail", "someone@test.local|9.9.9.9");
    const rows = await db.select().from(schema.appRateLimits);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.key.includes("@") || r.key.includes("9.9.9.9"))).toBe(false);
  });
});
