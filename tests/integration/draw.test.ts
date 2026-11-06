import { beforeEach, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { drawRound, rerollRound } from "@/server/rounds/draw";
import { getTargets } from "@/server/rounds/queries";
import { submitTierList } from "@/server/rounds/submit";
import { makeIdeas, makeUser, placementsFor, resetDb } from "../support/factories";

beforeEach(resetDb);

describe("drawRound", () => {
  it("creates the day's round with a random unused idea and snapshots active members only", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeUser({ status: "pending" });
    await makeUser({ status: "rejected" });
    await makeIdeas(3);

    const res = await drawRound("2026-01-10");
    expect(res.status).toBe("created");
    if (res.status !== "created") return;

    const targets = await getTargets(res.roundId);
    expect(targets.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    const [idea] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, res.ideaId));
    expect(idea.usedAt).not.toBeNull();
  });

  it("never draws the same idea twice and reports an empty bank", async () => {
    await makeUser();
    await makeIdeas(3);
    const ideas = new Set<string>();
    for (const d of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
      const r = await drawRound(d);
      expect(r.status).toBe("created");
      if (r.status === "created") ideas.add(r.ideaId);
    }
    expect(ideas.size).toBe(3);
    expect((await drawRound("2026-01-04")).status).toBe("empty_bank");
  });

  it("is idempotent for a date, even when called concurrently", async () => {
    await makeUser();
    await makeIdeas(5);
    const results = await Promise.all(Array.from({ length: 6 }, () => drawRound("2026-02-01")));
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.every((r) => r.status === "created" || r.status === "exists")).toBe(true);
    const rounds = await db.select().from(schema.rounds);
    expect(rounds).toHaveLength(1);
    // only one idea consumed
    const used = await db.select().from(schema.ideas).where(isNull(schema.ideas.usedAt));
    expect(used).toHaveLength(4);
  });

  it("closes (reveals) older rounds that were still open", async () => {
    await makeUser();
    await makeIdeas(2);
    const first = await drawRound("2026-03-01");
    await drawRound("2026-03-02");
    if (first.status !== "created") throw new Error("setup");
    const [r] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, first.roundId));
    expect(r.revealedAt).not.toBeNull();
    expect(r.revealReason).toBe("timeout");
  });
});

describe("rerollRound", () => {
  it("swaps the idea and puts the old one back in the bank", async () => {
    await makeUser();
    await makeIdeas(2);
    const r = await drawRound("2026-04-01");
    if (r.status !== "created") throw new Error("setup");
    const res = await rerollRound(r.roundId);
    expect(res.ok).toBe(true);
    const [old] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, r.ideaId));
    expect(old.usedAt).toBeNull();
    const [round] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, r.roundId));
    expect(round.ideaId).not.toBe(r.ideaId);
  });

  it("is refused once someone played, or when the bank has nothing else", async () => {
    const u = await makeUser();
    await makeUser(); // a second member, so one submission doesn't reveal the round
    await makeIdeas(1);
    const r = await drawRound("2026-04-02");
    if (r.status !== "created") throw new Error("setup");
    expect(await rerollRound(r.roundId)).toEqual({ ok: false, error: "Aucune autre idée disponible dans la banque" });

    await makeIdeas(1, "Autre");
    const targets = await getTargets(r.roundId);
    await submitTierList(u.id, { roundId: r.roundId, placements: placementsFor(targets, () => "S") });
    expect(await rerollRound(r.roundId)).toEqual({ ok: false, error: "Impossible : des membres ont déjà joué" });
  });
});
