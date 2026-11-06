import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayKey } from "@/lib/dates";
import { drawRound } from "@/server/rounds/draw";
import { revealIfAllPlayed, revealRound, revealTimedOut } from "@/server/rounds/reveal";
import { getProgress, getTargets } from "@/server/rounds/queries";
import { submitTierList } from "@/server/rounds/submit";
import { listBoard } from "@/server/board";
import { getComments, getPostReactions } from "@/server/comments";
import { clearLiveCache, boardVersion, roundVersion } from "@/server/live";
import { makeIdeas, makeUser, placementsFor, resetDb } from "../support/factories";

beforeEach(resetDb);

describe("reveal", () => {
  it("times out after 24h, and is idempotent", async () => {
    await makeUser();
    await makeIdeas(1);
    const r = await drawRound("2026-06-01", new Date("2026-06-01T00:00:00+02:00"));
    if (r.status !== "created") throw new Error("setup");
    expect(await revealTimedOut(new Date("2026-06-01T23:00:00+02:00"))).toEqual([]);
    expect(await revealTimedOut(new Date("2026-06-02T00:00:01+02:00"))).toEqual([r.roundId]);
    expect(await revealRound(r.roundId, "moderator")).toBe(false);
    const [row] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, r.roundId));
    expect(row.revealReason).toBe("timeout");
  });

  it("a member removed from the round (ban) no longer blocks the reveal", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(1);
    const r = await drawRound(dayKey());
    if (r.status !== "created") throw new Error("setup");
    await submitTierList(a.id, { roundId: r.roundId, placements: placementsFor(await getTargets(r.roundId), () => "S") });
    expect(await revealIfAllPlayed(r.roundId)).toBe(false);
    // what the ban action does for open rounds
    await db.execute(sql`delete from round_targets where round_id = ${r.roundId} and user_id = ${b.id}`);
    expect(await revealIfAllPlayed(r.roundId)).toBe(true);
  });
});

describe("board", () => {
  it("regression: 'X/Y ont joué' only counts members who actually played", async () => {
    const [a] = [await makeUser(), await makeUser(), await makeUser()];
    await makeIdeas(1);
    const r = await drawRound(dayKey());
    if (r.status !== "created") throw new Error("setup");
    await submitTierList(a.id, { roundId: r.roundId, placements: placementsFor(await getTargets(r.roundId), () => "S") });

    const [post] = await listBoard(a.id);
    expect({ played: post.played, total: post.total }).toEqual({ played: 1, total: 3 });
    expect(await getProgress(r.roundId)).toEqual({ played: 1, total: 3 });
  });

  it("hides today's podium from people who haven't played, shows archives to everyone", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(2);
    const old = await drawRound("2020-01-01");
    if (old.status !== "created") throw new Error("setup");
    await submitTierList(a.id, { roundId: old.roundId, placements: placementsFor(await getTargets(old.roundId), () => "S") });
    await submitTierList(b.id, { roundId: old.roundId, placements: placementsFor(await getTargets(old.roundId), () => "A") });

    const today = await drawRound(dayKey());
    if (today.status !== "created") throw new Error("setup");
    await submitTierList(a.id, { roundId: today.roundId, placements: placementsFor(await getTargets(today.roundId), () => "S") });
    await submitTierList(b.id, { roundId: today.roundId, placements: placementsFor(await getTargets(today.roundId), () => "S") });

    const outsider = await makeUser();
    const posts = await listBoard(outsider.id);
    expect(posts.find((p) => p.id === today.roundId)?.top3).toEqual([]);
    expect(posts.find((p) => p.id === old.roundId)?.top3.length).toBeGreaterThan(0);
    expect((await listBoard(a.id)).find((p) => p.id === today.roundId)?.top3.length).toBeGreaterThan(0);
  });

  it("search treats % and _ literally", async () => {
    await makeUser();
    await db.insert(schema.ideas).values([{ title: "100% vrai" }, { title: "autre chose" }]);
    await drawRound("2020-02-01");
    await drawRound("2020-02-02");
    const u = await makeUser();
    expect((await listBoard(u.id, { q: "%" })).map((p) => p.title)).toEqual(["100% vrai"]);
    expect(await listBoard(u.id, { q: "_" })).toEqual([]);
  });
});

describe("comments & reactions", () => {
  it("hides deleted messages nobody replied to, keeps a placeholder otherwise, never leaks deleted text", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(1);
    const r = await drawRound("2020-03-03");
    if (r.status !== "created") throw new Error("setup");
    const [lonely, parent] = await db
      .insert(schema.comments)
      .values([
        { roundId: r.roundId, userId: a.id, body: "secret 1", deletedAt: new Date() },
        { roundId: r.roundId, userId: a.id, body: "secret 2", deletedAt: new Date() },
      ])
      .returning();
    await db.insert(schema.comments).values({ roundId: r.roundId, userId: b.id, body: "réponse", replyToId: parent.id });

    const list = await getComments(r.roundId, b.id, false);
    expect(list.map((c) => c.id)).not.toContain(lonely.id);
    const kept = list.find((c) => c.id === parent.id)!;
    expect(kept.deleted).toBe(true);
    expect(kept.body).toBe("");
    expect(JSON.stringify(list)).not.toContain("secret");
    expect(list.find((c) => c.body === "réponse")?.canDelete).toBe(true);
  });

  it("summarises post reactions with the viewer's own", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(1);
    const r = await drawRound("2020-03-04");
    if (r.status !== "created") throw new Error("setup");
    await db.insert(schema.reactions).values([
      { roundId: r.roundId, userId: a.id, emoji: "😂" },
      { roundId: r.roundId, userId: b.id, emoji: "😂" },
      { roundId: r.roundId, userId: b.id, emoji: "💀" },
    ]);
    const res = await getPostReactions(r.roundId, a.id);
    expect(res.find((x) => x.emoji === "😂")).toEqual({ emoji: "😂", count: 2, mine: true });
    expect(res.find((x) => x.emoji === "💀")).toEqual({ emoji: "💀", count: 1, mine: false });
  });
});

describe("live versions", () => {
  it("change on every kind of update (submission, comment, reaction, reveal, reroll, profile)", async () => {
    const a = await makeUser();
    await makeIdeas(3);
    const r = await drawRound(dayKey());
    if (r.status !== "created") throw new Error("setup");

    const snap = async () => {
      clearLiveCache();
      return [await roundVersion(r.roundId), await boardVersion()];
    };
    let [rv, bv] = await snap();
    const expectChanged = async (what: string, round = true) => {
      const [nrv, nbv] = await snap();
      if (round) expect(nrv, what).not.toBe(rv);
      expect(nbv, what).not.toBe(bv);
      [rv, bv] = [nrv, nbv];
    };

    await db.insert(schema.comments).values({ roundId: r.roundId, userId: a.id, body: "yo" });
    await expectChanged("comment");
    await db.insert(schema.reactions).values({ roundId: r.roundId, userId: a.id, emoji: "👀" });
    await expectChanged("reaction");
    await db.update(schema.rounds).set({ ideaId: (await makeIdeas(1, "Reroll"))[0].id }).where(eq(schema.rounds.id, r.roundId));
    await expectChanged("reroll");
    await db.update(schema.user).set({ name: "Nouveau pseudo", updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.user.id, a.id));
    await expectChanged("profile", false);
    await submitTierList(a.id, { roundId: r.roundId, placements: placementsFor(await getTargets(r.roundId), () => "S") });
    await expectChanged("submission + reveal");
  });
});
