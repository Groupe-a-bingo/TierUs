import { describe, expect, it } from "vitest";
import { aggregate } from "./aggregate";
import { canSeeResults } from "./visibility";
import { validatePlacements } from "./submit";
import { nextStreak, displayStreak } from "@/server/streaks";
import { scoreToTier } from "@/lib/tiers";

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
  it("hides everything before reveal", () => {
    expect(canSeeResults({ revealed: false, isCurrent: true, hasSubmitted: true })).toBe(false);
    expect(canSeeResults({ revealed: false, isCurrent: false, hasSubmitted: true })).toBe(false);
  });
  it("requires playing the current round", () => {
    expect(canSeeResults({ revealed: true, isCurrent: true, hasSubmitted: false })).toBe(false);
    expect(canSeeResults({ revealed: true, isCurrent: true, hasSubmitted: true })).toBe(true);
  });
  it("opens archives to everyone", () => {
    expect(canSeeResults({ revealed: true, isCurrent: false, hasSubmitted: false })).toBe(true);
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

describe("streaks", () => {
  it("increments when the previous round was played", () => {
    expect(nextStreak({ current: 3, lastPlayed: "2026-11-04", roundDate: "2026-11-05", previousRoundDate: "2026-11-04" })).toBe(4);
  });
  it("skips days without a round", () => {
    expect(nextStreak({ current: 3, lastPlayed: "2026-11-02", roundDate: "2026-11-05", previousRoundDate: "2026-11-02" })).toBe(4);
  });
  it("resets after a missed round", () => {
    expect(nextStreak({ current: 3, lastPlayed: "2026-11-03", roundDate: "2026-11-05", previousRoundDate: "2026-11-04" })).toBe(1);
  });
  it("is idempotent for the same round", () => {
    expect(nextStreak({ current: 3, lastPlayed: "2026-11-05", roundDate: "2026-11-05", previousRoundDate: "2026-11-04" })).toBe(3);
  });
  it("displays 0 once a round was missed", () => {
    expect(displayStreak({ streak: 5, lastPlayed: "2026-11-03", currentRoundDate: "2026-11-05", previousRoundDate: "2026-11-04" })).toBe(0);
    expect(displayStreak({ streak: 5, lastPlayed: "2026-11-04", currentRoundDate: "2026-11-05", previousRoundDate: "2026-11-04" })).toBe(5);
  });
});
