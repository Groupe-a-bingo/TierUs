import { describe, expect, it } from "vitest";
import { TIERS, TIER_SCORE, emptyRows, isTier, scoreToTier } from "@/lib/tiers";
import { dayKey, formatDayFr, isDayKey, nextDrawHint } from "@/lib/dates";
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

describe("nextDrawHint", () => {
  // Paris is UTC+1 in January
  const early = new Date("2026-01-15T05:30:00Z"); // 06:30 Paris
  const late = new Date("2026-01-15T10:00:00Z"); // 11:00 Paris
  it("before 08:00, an idea added to an empty bank waits for 08:00", () => {
    expect(nextDrawHint(0, 8, early)).toContain("avant 8 h");
    expect(nextDrawHint(3, 8, early)).toBe("La prochaine tier list est tirée à 8 h.");
  });
  it("after 08:00, the next idea launches today's tier list", () => {
    expect(nextDrawHint(0, 8, late)).toContain("lance la tier list du jour");
    expect(nextDrawHint(3, 8, late)).toContain("demain à 8 h");
  });
  it("follows the configured hour", () => {
    expect(nextDrawHint(3, 12, late)).toBe("La prochaine tier list est tirée à 12 h.");
    expect(nextDrawHint(0, 12, late)).toContain("avant 12 h");
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
