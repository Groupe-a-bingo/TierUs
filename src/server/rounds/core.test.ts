import { describe, expect, it } from "vitest";
import { aggregate, computeStats } from "./aggregate";
import { canSeeResults } from "./visibility";
import { validatePlacements } from "./submit";
import { countsForCounter } from "@/server/counter";
import { scoreToTier } from "@/lib/tiers";
import { HOUR_MS, addDays, dueDailyKey, formatRemaining, isActive, isDayKey, isUuid, localHour } from "@/lib/dates";

describe("scoreToTier", () => {
  it("rounds to the nearest tier, .5 up", () => {
    expect(scoreToTier(5)).toBe("S");
    expect(scoreToTier(4.5)).toBe("S");
    expect(scoreToTier(4.49)).toBe("A");
    expect(scoreToTier(0.4)).toBe("F");
    expect(scoreToTier(2.5)).toBe("B");
  });
});

describe("aggregate", () => {
  it("averages every vote including self-votes", () => {
    const res = aggregate([
      { voterId: "a", targetId: "a", tier: "S" }, // self-vote counts
      { voterId: "b", targetId: "a", tier: "B" },
      { voterId: "a", targetId: "b", tier: "F" },
      { voterId: "b", targetId: "b", tier: "F" },
    ]);
    const a = res.results.find((r) => r.targetId === "a")!;
    expect(a.mean).toBe(4); // (5+3)/2
    expect(a.tier).toBe("A");
    expect(res.rows.A.map((r) => r.targetId)).toEqual(["a"]);
    expect(res.rows.F.map((r) => r.targetId)).toEqual(["b"]);
    expect(res.voters).toBe(2);
  });

  it("finds the most controversial and the unanimous", () => {
    const res = aggregate([
      { voterId: "a", targetId: "x", tier: "S" },
      { voterId: "b", targetId: "x", tier: "F" },
      { voterId: "a", targetId: "y", tier: "C" },
      { voterId: "b", targetId: "y", tier: "C" },
    ]);
    expect(res.controversial?.targetId).toBe("x");
    expect(res.unanimous.map((r) => r.targetId)).toEqual(["y"]);
  });

  it("orders ties deterministically and handles no votes", () => {
    expect(aggregate([]).results).toEqual([]);
    const res = aggregate([
      { voterId: "a", targetId: "z", tier: "B" },
      { voterId: "a", targetId: "m", tier: "B" },
    ]);
    expect(res.rows.B.map((r) => r.targetId)).toEqual(["m", "z"]);
    expect(res.controversial).toBeNull();
  });
});

describe("canSeeResults", () => {
  it("opens results as soon as you answered, hides them otherwise (archived or not)", () => {
    expect(canSeeResults({ hasSubmitted: true })).toBe(true);
    expect(canSeeResults({ hasSubmitted: false })).toBe(false);
  });
});

describe("daily slot (08:00 Europe/Paris)", () => {
  const tz = "Europe/Paris";
  it("nothing is due before 08:00 (no prior-day catch-up), today's daily from 08:00 until midnight", () => {
    // winter (UTC+1): 08:00 Paris = 07:00Z
    expect(dueDailyKey(new Date("2026-11-06T06:59:59Z"), tz)).toBeNull();
    expect(dueDailyKey(new Date("2026-11-06T07:00:00Z"), tz)).toBe("2026-11-06");
    expect(dueDailyKey(new Date("2026-11-06T22:59:00Z"), tz)).toBe("2026-11-06"); // 23:59 Paris
    // just after midnight Paris: the new day, before its 08:00
    expect(dueDailyKey(new Date("2026-11-05T23:30:00Z"), tz)).toBeNull();
  });

  it("stays at 08:00 local time across DST changes", () => {
    // spring forward 2026-03-29: 08:00 CEST = 06:00Z
    expect(dueDailyKey(new Date("2026-03-29T05:59:00Z"), tz)).toBeNull();
    expect(dueDailyKey(new Date("2026-03-29T06:00:00Z"), tz)).toBe("2026-03-29");
    // fall back 2026-10-25: 08:00 CET = 07:00Z
    expect(dueDailyKey(new Date("2026-10-25T06:30:00Z"), tz)).toBeNull();
    expect(dueDailyKey(new Date("2026-10-25T07:00:00Z"), tz)).toBe("2026-10-25");
    expect(localHour(new Date("2026-10-25T07:00:00Z"), tz)).toBe(8);
  });

  it("addDays crosses months and years", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("TTL lifecycle", () => {
  const start = new Date("2026-11-06T07:00:00Z");
  const round = { startsAt: start, expiresAt: new Date(start.getTime() + 24 * HOUR_MS) };
  it("is active for exactly 24 real hours, then archived", () => {
    expect(isActive(round, new Date("2026-11-06T06:59:59Z"))).toBe(false); // not started
    expect(isActive(round, start)).toBe(true);
    expect(isActive(round, new Date("2026-11-07T06:59:59Z"))).toBe(true);
    expect(isActive(round, new Date("2026-11-07T07:00:00Z"))).toBe(false); // expires_at <= now
  });

  it("DST: 24 real hours make two dailies overlap in spring and leave a gap in autumn", () => {
    const ttl = 24 * HOUR_MS;
    // spring: drawn 08:00 CET (07:00Z) on the 28th, next at 08:00 CEST (06:00Z) on the 29th
    const sat = { startsAt: new Date("2026-03-28T07:00:00Z"), expiresAt: new Date(Date.parse("2026-03-28T07:00:00Z") + ttl) };
    const sun = { startsAt: new Date("2026-03-29T06:00:00Z"), expiresAt: new Date(Date.parse("2026-03-29T06:00:00Z") + ttl) };
    const overlap = new Date("2026-03-29T06:30:00Z");
    expect(isActive(sat, overlap) && isActive(sun, overlap)).toBe(true);
    // autumn: drawn 08:00 CEST (06:00Z) on the 24th, next at 08:00 CET (07:00Z) on the 25th
    const fri = { startsAt: new Date("2026-10-24T06:00:00Z"), expiresAt: new Date(Date.parse("2026-10-24T06:00:00Z") + ttl) };
    const gap = new Date("2026-10-25T06:30:00Z");
    expect(isActive(fri, gap)).toBe(false);
    expect(dueDailyKey(gap, "Europe/Paris")).toBeNull(); // nothing new is due before 08:00
  });

  it("formats the remaining time", () => {
    expect(formatRemaining(5 * HOUR_MS + 10 * 60_000)).toBe("encore 5 h");
    expect(formatRemaining(12 * 60_000)).toBe("encore 12 min");
    expect(formatRemaining(72 * HOUR_MS)).toBe("encore 3 j");
    expect(formatRemaining(0)).toBe("archivée");
  });
});

describe("personal counter rule", () => {
  const expires = new Date("2026-11-07T07:00:00Z");
  it("counts a first answer strictly before archiving only", () => {
    expect(countsForCounter(new Date("2026-11-07T06:59:59Z"), expires)).toBe(true);
    expect(countsForCounter(expires, expires)).toBe(false);
    expect(countsForCounter(new Date("2026-11-08T00:00:00Z"), expires)).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts tier list ids, rejects dates and junk", () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid("2026-11-05")).toBe(false);
    expect(isUuid("not-an-id")).toBe(false);
  });
});

describe("validatePlacements", () => {
  const targets = ["a", "b", "c"];
  const p = (id: string) => ({ targetId: id, tier: "S" as const, position: 0 });
  it("accepts exactly the targets", () => {
    expect(() => validatePlacements([p("a"), p("b"), p("c")], targets)).not.toThrow();
  });
  it("rejects strangers, duplicates and missing members", () => {
    expect(() => validatePlacements([p("a"), p("b"), p("zzz")], targets)).toThrow(/inconnu/);
    expect(() => validatePlacements([p("a"), p("a"), p("b")], targets)).toThrow(/deux fois/);
    expect(() => validatePlacements([p("a"), p("b")], targets)).toThrow(/tous/);
  });
});

describe("isDayKey", () => {
  it("accepts real calendar dates only", () => {
    expect(isDayKey("2026-11-05")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2026-02-31")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-1-5")).toBe(false);
  });
});

describe("computeStats", () => {
  // a rates: a=S(5) b=F(0) ; b rates: a=B(3) b=B(3)
  const votes = [
    { voterId: "a", targetId: "a", tier: "S" as const },
    { voterId: "a", targetId: "b", tier: "F" as const },
    { voterId: "b", targetId: "a", tier: "B" as const },
    { voterId: "b", targetId: "b", tier: "B" as const },
  ];
  const s = computeStats(votes);

  it("computes E[X] and Var[X] over all votes", () => {
    expect(s.mean).toBe(2.75); // (5+0+3+3)/4
    expect(s.variance).toBe(3.19); // mean of squared deviations
    expect(s.stddev).toBe(1.79);
  });

  it("measures consensus from per-member spread", () => {
    // σ(a)=1, σ(b)=1.5 → avg 1.25 → 1 - 1.25/2.5 = 50 %
    expect(s.avgSpread).toBe(1.25);
    expect(s.consensus).toBe(50);
  });

  it("ranks voters: generous / harsh / contrarian / ego", () => {
    expect(s.generous?.voterId).toBe("b"); // gave 3,3 vs 5,0
    expect(s.harsh?.voterId).toBe("a");
    // a and b are exactly as far from the consensus here (rmse ≈ 1.27 each)
    expect(s.voters.find((v) => v.voterId === "a")?.rmse).toBe(s.voters.find((v) => v.voterId === "b")?.rmse);
    expect(s.ego?.voterId).toBe("b"); // b: 3 for himself vs 0 from a → +3 (a: +2)
    expect(s.modest?.voterId).toBe("a");
    expect(s.voters.find((v) => v.voterId === "a")?.selfBias).toBe(2);
    expect(s.voters.find((v) => v.voterId === "b")?.selfBias).toBe(3); // b: 3 vs a's 0
  });

  it("handles a round without votes", () => {
    const e = computeStats([]);
    expect(e.mean).toBe(0);
    expect(e.consensus).toBe(100);
    expect(e.generous).toBeNull();
  });
});
