import { beforeEach, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { HOUR_MS } from "@/lib/dates";
import { drawDaily, drawExtra, rerollRound } from "@/server/rounds/draw";
import { getActiveRounds, getTargets } from "@/server/rounds/queries";
import { submitTierList } from "@/server/rounds/submit";
import { setMemberStatus } from "@/server/members";
import { drawActive, makeIdeas, makeUser, placementsFor, resetDb } from "../support/factories";

beforeEach(resetDb);

const round = async (id: string) => (await db.select().from(schema.rounds).where(eq(schema.rounds.id, id)))[0];
// 08:00 Paris in winter = 07:00Z
const at = (iso: string) => new Date(iso);

describe("drawDaily (08:00 Europe/Paris)", () => {
  it("creates the day's tier list with a random unused idea, a 24h TTL and active members only", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(3);
    await makeUser({ status: "pending" });
    await makeUser({ status: "rejected" });

    const now = at("2026-01-10T07:00:00Z");
    const res = await drawDaily(now);
    expect(res.status).toBe("created");
    if (res.status !== "created") return;

    const r = await round(res.roundId);
    expect(r.kind).toBe("daily");
    expect(r.date).toBe("2026-01-10");
    expect(r.startsAt.toISOString()).toBe(now.toISOString());
    expect(r.expiresAt.getTime() - r.startsAt.getTime()).toBe(24 * HOUR_MS);

    const targets = await getTargets(res.roundId);
    expect(targets.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    const [idea] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, res.ideaId));
    expect(idea.usedAt).not.toBeNull();
  });

  it("nothing is due before 08:00; from 08:00 the day's daily is drawn once", async () => {
    await makeUser();
    await makeIdeas(3);
    const first = await drawDaily(at("2026-01-10T07:00:00Z")); // 08:00 on the 10th
    expect(first.status).toBe("created");
    expect(await drawDaily(at("2026-01-10T22:00:00Z"))).toEqual({ status: "exists", roundId: first.status === "created" ? first.roundId : "" });
    expect(await drawDaily(at("2026-01-11T06:30:00Z"))).toEqual({ status: "not_due" }); // 07:30 on the 11th
    expect((await drawDaily(at("2026-01-11T07:00:00Z"))).status).toBe("created"); // 08:00 on the 11th
    expect(await db.select().from(schema.rounds)).toHaveLength(2);
  });

  it("a day missed entirely (empty bank) is not caught up the next morning before 08:00", async () => {
    await makeUser();
    expect((await drawDaily(at("2026-01-10T07:00:00Z"))).status).toBe("empty_bank"); // 08:00 on the 10th
    await makeIdeas(2);
    // an idea proposed at 03:00 on the 11th: no daily dated the 10th overlapping the 08:00 one
    expect(await drawDaily(at("2026-01-11T02:00:00Z"))).toEqual({ status: "not_due" });
    const next = await drawDaily(at("2026-01-11T07:00:00Z"));
    if (next.status !== "created") throw new Error("expected the 11th's daily");
    expect((await round(next.roundId)).date).toBe("2026-01-11");
    expect(await db.select().from(schema.rounds)).toHaveLength(1);
  });

  it("concurrent draws with a single idea in the bank: one created, all others 'exists' (never 'empty_bank')", async () => {
    await makeUser();
    await makeIdeas(1);
    const now = at("2026-02-02T07:00:00Z");
    const results = await Promise.all(Array.from({ length: 6 }, () => drawDaily(now)));
    const created = results.filter((r) => r.status === "created");
    expect(created).toHaveLength(1);
    expect(results.filter((r) => r.status === "exists")).toHaveLength(5);
    const winner = created[0].status === "created" ? created[0].roundId : "";
    expect(results.every((r) => r.status === "created" || (r.status === "exists" && r.roundId === winner))).toBe(true);
  });

  it("a member validated while a tier list is drawn always ends up in it (shared advisory lock)", async () => {
    await makeUser();
    for (let i = 0; i < 10; i++) {
      await makeIdeas(1, `Course ${i}`);
      const pending = await makeUser({ status: "pending" });
      // both orders are possible; neither may lose the member
      const [, drawn] = await Promise.all([setMemberStatus(pending.id, "active", null, "pending"), drawActive()]);
      if (drawn.status !== "created") throw new Error("setup");
      expect((await getTargets(drawn.roundId)).map((t) => t.id), `iteration ${i}`).toContain(pending.id);
    }
  });

  it("never draws the same idea twice and reports an empty bank", async () => {
    await makeUser();
    await makeIdeas(3);
    const ideas = new Set<string>();
    for (const d of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
      const r = await drawDaily(at(`${d}T07:00:00Z`));
      expect(r.status).toBe("created");
      if (r.status === "created") ideas.add(r.ideaId);
    }
    expect(ideas.size).toBe(3);
    expect((await drawDaily(at("2026-01-04T07:00:00Z"))).status).toBe("empty_bank");
  });

  it("is idempotent for a day, even when called concurrently", async () => {
    await makeUser();
    await makeIdeas(5);
    const now = at("2026-02-01T07:00:00Z");
    const results = await Promise.all(Array.from({ length: 6 }, () => drawDaily(now)));
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.every((r) => r.status === "created" || r.status === "exists")).toBe(true);
    expect(await db.select().from(schema.rounds)).toHaveLength(1);
    // only one idea consumed
    expect(await db.select().from(schema.ideas).where(isNull(schema.ideas.usedAt))).toHaveLength(4);
  });

  it("catch-up: bank empty at 08:00, the first new idea triggers the missing daily, once", async () => {
    await makeUser();
    expect((await drawDaily(at("2026-03-02T07:00:00Z"))).status).toBe("empty_bank");
    // what addIdea does after saving an idea at 10:15
    await makeIdeas(2);
    const caught = await drawDaily(at("2026-03-02T09:15:00Z"));
    expect(caught.status).toBe("created");
    if (caught.status !== "created") return;
    const r = await round(caught.roundId);
    expect(r.date).toBe("2026-03-02");
    expect(r.startsAt.toISOString()).toBe("2026-03-02T09:15:00.000Z");
    // another idea the same day: no duplicate
    expect((await drawDaily(at("2026-03-02T11:00:00Z"))).status).toBe("exists");
    expect(await db.select().from(schema.ideas).where(isNull(schema.ideas.usedAt))).toHaveLength(1);
  });

  it("DST: the 08:00 draws of both sides of the change overlap in spring (24 real hours each)", async () => {
    await makeUser();
    await makeIdeas(2);
    const sat = await drawDaily(at("2026-03-28T07:00:00Z")); // 08:00 CET
    const sun = await drawDaily(at("2026-03-29T06:00:00Z")); // 08:00 CEST
    if (sat.status !== "created" || sun.status !== "created") throw new Error("setup");
    const active = await getActiveRounds(at("2026-03-29T06:30:00Z"));
    expect(active.map((a) => a.round.id).sort()).toEqual([sat.roundId, sun.roundId].sort());
    expect((await getActiveRounds(at("2026-03-29T07:00:00Z"))).map((a) => a.round.id)).toEqual([sun.roundId]);
  });
});

describe("drawExtra", () => {
  it("adds tier lists on top of the daily one, same day, each with its own TTL and id", async () => {
    await makeUser();
    await makeIdeas(3);
    const now = at("2026-05-05T10:00:00Z");
    const daily = await drawDaily(at("2026-05-05T06:00:00Z"));
    const x1 = await drawExtra(2, now);
    const x2 = await drawExtra(48, now);
    if (daily.status !== "created" || x1.status !== "created" || x2.status !== "created") throw new Error("setup");
    expect(new Set([daily.roundId, x1.roundId, x2.roundId]).size).toBe(3);
    expect((await round(x1.roundId)).expiresAt.toISOString()).toBe("2026-05-05T12:00:00.000Z");
    expect((await round(x2.roundId)).kind).toBe("extra");

    expect(await getActiveRounds(at("2026-05-05T11:00:00Z"))).toHaveLength(3);
    // the 2h one is archived first, the others stay on the home page
    expect((await getActiveRounds(at("2026-05-05T12:00:00Z"))).map((a) => a.round.id).sort()).toEqual([daily.roundId, x2.roundId].sort());
    expect((await getActiveRounds(at("2026-05-06T06:00:00Z"))).map((a) => a.round.id)).toEqual([x2.roundId]);
  });

  it("reports an empty bank", async () => {
    expect((await drawExtra(24)).status).toBe("empty_bank");
  });
});

describe("rerollRound", () => {
  it("swaps the idea and puts the old one back in the bank", async () => {
    await makeUser();
    await makeIdeas(2);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");
    const res = await rerollRound(r.roundId);
    expect(res.ok).toBe(true);
    const [old] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, r.ideaId));
    expect(old.usedAt).toBeNull();
    expect((await round(r.roundId)).ideaId).not.toBe(r.ideaId);
  });

  it("is refused once someone played, when the bank has nothing else, or once archived", async () => {
    const u = await makeUser();
    await makeUser();
    await makeIdeas(1);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");
    expect(await rerollRound(r.roundId)).toEqual({ ok: false, error: "Aucune autre idée disponible dans la banque" });

    await makeIdeas(1, "Autre");
    expect(await rerollRound(r.roundId, new Date(Date.now() + 25 * HOUR_MS))).toEqual({ ok: false, error: "Cette tier list est archivée" });
    const targets = await getTargets(r.roundId);
    await submitTierList(u.id, { roundId: r.roundId, placements: placementsFor(targets, () => "S") });
    expect(await rerollRound(r.roundId)).toEqual({ ok: false, error: "Impossible : des membres ont déjà joué" });
  });
});
