/** Board, results visibility (only after your own answer) and live versions. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HOUR_MS } from "@/lib/dates";
import { drawDaily, drawExtra } from "@/server/rounds/draw";
import { getProgress, getDailyRoundId, getTargets, hasSubmitted } from "@/server/rounds/queries";
import { canSeeResults } from "@/server/rounds/visibility";
import { submitTierList } from "@/server/rounds/submit";
import { listBoard } from "@/server/board";
import { getComments, getPostReactions } from "@/server/comments";
import { clearLiveCache, boardVersion, roundVersion } from "@/server/live";
import { drawActive, makeIdeas, makeUser, placementsFor, resetDb } from "../support/factories";

beforeEach(resetDb);

const play = async (userId: string, roundId: string, now?: Date) =>
  submitTierList(userId, { roundId, placements: placementsFor(await getTargets(roundId), () => "S") }, now);

describe("results visibility", () => {
  it("each member sees the results right after their own answer, not before", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(1);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");

    await play(a.id, r.roundId);
    // a sees the results right away, without waiting for b
    expect(canSeeResults({ hasSubmitted: await hasSubmitted(r.roundId, a.id) })).toBe(true);
    expect((await listBoard(a.id, { scope: "active" }))[0].top3.length).toBeGreaterThan(0);
    // b doesn't, until they answer
    expect(canSeeResults({ hasSubmitted: await hasSubmitted(r.roundId, b.id) })).toBe(false);
    expect((await listBoard(b.id, { scope: "active" }))[0].top3).toEqual([]);
    await play(b.id, r.roundId);
    expect((await listBoard(b.id, { scope: "active" }))[0].top3.length).toBeGreaterThan(0);
  });

  it("archiving shows nothing by itself: still hidden from those who didn't answer, still open to voting", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(1);
    const start = new Date("2020-01-01T07:00:00Z");
    const r = await drawDaily(start);
    if (r.status !== "created") throw new Error("setup");
    await play(a.id, r.roundId, new Date("2020-01-01T08:00:00Z"));

    const later = new Date("2020-01-05T00:00:00Z");
    const [forB] = await listBoard(b.id, { scope: "archived", now: later });
    expect(forB.active).toBe(false);
    expect(forB.top3).toEqual([]);
    await play(b.id, r.roundId, later); // late answer accepted…
    const [after] = await listBoard(b.id, { scope: "archived", now: later });
    expect(after.top3.length).toBeGreaterThan(0); // …and it opens the results
  });
});

describe("board", () => {
  it("lists every active tier list on the home page (same day, distinct ids), the rest in archives", async () => {
    const u = await makeUser();
    await makeIdeas(4);
    const now = new Date("2026-05-05T12:00:00Z");
    const old = await drawDaily(new Date("2026-05-01T06:00:00Z"));
    const daily = await drawDaily(new Date("2026-05-05T06:00:00Z"));
    const extra = await drawExtra(2, new Date("2026-05-05T11:00:00Z"));
    if (old.status !== "created" || daily.status !== "created" || extra.status !== "created") throw new Error("setup");

    const active = await listBoard(u.id, { scope: "active", now });
    // newest first
    expect(active.map((p) => p.id)).toEqual([extra.roundId, daily.roundId]);
    expect(active.map((p) => p.kind)).toEqual(["extra", "daily"]);
    expect((await listBoard(u.id, { scope: "archived", now })).map((p) => p.id)).toEqual([old.roundId]);

    // the 2h extra expires first and moves to the archives on its own
    const later = new Date("2026-05-05T13:00:00Z");
    expect((await listBoard(u.id, { scope: "active", now: later })).map((p) => p.id)).toEqual([daily.roundId]);
    expect((await listBoard(u.id, { scope: "archived", now: later })).map((p) => p.id)).toEqual([extra.roundId, old.roundId]);
  });

  it("old /r/YYYY-MM-DD links resolve to that day's daily tier list", async () => {
    await makeUser();
    await makeIdeas(2);
    const extra = await drawExtra(24, new Date("2026-05-05T05:00:00Z"));
    const daily = await drawDaily(new Date("2026-05-05T06:00:00Z"));
    if (daily.status !== "created" || extra.status !== "created") throw new Error("setup");
    expect(await getDailyRoundId("2026-05-05")).toBe(daily.roundId);
    expect(await getDailyRoundId("2026-05-06")).toBeNull();
  });

  it("regression: 'X/Y ont joué' only counts members who actually played", async () => {
    const [a] = [await makeUser(), await makeUser(), await makeUser()];
    await makeIdeas(1);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");
    await play(a.id, r.roundId);

    const [post] = await listBoard(a.id, { scope: "active" });
    expect({ played: post.played, total: post.total }).toEqual({ played: 1, total: 3 });
    expect(await getProgress(r.roundId)).toEqual({ played: 1, total: 3 });
  });

  it("search treats % and _ literally", async () => {
    await makeUser();
    await db.insert(schema.ideas).values([{ title: "100% vrai" }, { title: "autre chose" }]);
    await drawDaily(new Date("2020-02-01T07:00:00Z"));
    await drawDaily(new Date("2020-02-02T07:00:00Z"));
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
    const r = await drawDaily(new Date("2020-03-03T07:00:00Z"));
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
    const r = await drawDaily(new Date("2020-03-04T07:00:00Z"));
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
  it("change on every kind of update (submission, comment, reaction, reroll, profile, archiving)", async () => {
    const a = await makeUser();
    await makeIdeas(3);
    const r = await drawActive();
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
    await play(a.id, r.roundId);
    await expectChanged("submission");
    // the TTL runs out: the tier list moves to the archives
    await db
      .update(schema.rounds)
      .set({ startsAt: new Date(Date.now() - 48 * HOUR_MS), expiresAt: new Date(Date.now() - HOUR_MS) })
      .where(eq(schema.rounds.id, r.roundId));
    await expectChanged("archiving");
  });
});
