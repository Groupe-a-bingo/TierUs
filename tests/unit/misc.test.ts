import { describe, expect, it } from "vitest";
import { TIERS, TIER_SCORE, emptyRows, isTier, scoreToTier } from "@/lib/tiers";
import { dayKey, formatDayFr, isDayKey } from "@/lib/dates";
import { REACTION_EMOJIS } from "@/lib/reactions";
import { aggregate } from "@/server/rounds/aggregate";

describe("tiers", () => {
  it("scores and tiers are consistent both ways", () => {
    for (const t of TIERS) expect(scoreToTier(TIER_SCORE[t])).toBe(t);
    expect(scoreToTier(-3)).toBe("F");
    expect(scoreToTier(99)).toBe("S");
  });
  it("isTier / emptyRows", () => {
    expect(isTier("S")).toBe(true);
    expect(isTier("s")).toBe(false);
    expect(Object.keys(emptyRows())).toEqual([...TIERS]);
  });
});

describe("dates", () => {
  it("dayKey uses the app timezone (Paris), not UTC", () => {
    // 23:30 UTC on Nov 5 is already Nov 6 in Paris (UTC+1)
    expect(dayKey(new Date("2026-11-05T23:30:00Z"), "Europe/Paris")).toBe("2026-11-06");
    expect(dayKey(new Date("2026-11-05T22:30:00Z"), "Europe/Paris")).toBe("2026-11-05");
  });
  it("formats days in French and validates real dates", () => {
    expect(formatDayFr("2026-11-05")).toBe("jeudi 5 novembre");
    expect(isDayKey("2026-02-29")).toBe(false); // not a leap year
    expect(isDayKey("2026-11-05")).toBe(true);
  });
});

describe("reactions", () => {
  it("has unique emojis and includes the double-tap like", () => {
    expect(new Set(REACTION_EMOJIS).size).toBe(REACTION_EMOJIS.length);
    expect(REACTION_EMOJIS).toContain("❤️");
  });
});

describe("aggregate edge cases", () => {
  it("a single voter's tier list is the average", () => {
    const res = aggregate([
      { voterId: "a", targetId: "x", tier: "S" },
      { voterId: "a", targetId: "y", tier: "D" },
    ]);
    expect(res.rows.S.map((r) => r.targetId)).toEqual(["x"]);
    expect(res.rows.D.map((r) => r.targetId)).toEqual(["y"]);
    expect(res.unanimous).toEqual([]); // one vote isn't "unanimous"
  });
});
