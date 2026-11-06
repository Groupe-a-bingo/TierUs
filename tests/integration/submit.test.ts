import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HOUR_MS } from "@/lib/dates";
import { drawDaily, drawExtra } from "@/server/rounds/draw";
import { getProgress, getTargets, getVotes } from "@/server/rounds/queries";
import { submitTierList } from "@/server/rounds/submit";
import { addMemberToActiveRounds, missingTargetsFor } from "@/server/rounds/targets";
import { answeredOnTimeCount } from "@/server/counter";
import { setMemberStatus } from "@/server/members";
import { drawActive, makeIdeas, makeUser, placementsFor, resetDb } from "../support/factories";

beforeEach(resetDb);

// a fixed day: daily drawn at 08:00 CEST (06:00Z), "now" at 12:00 CEST
const DAY_8AM = new Date("2026-04-01T06:00:00Z");
const DAY_NOON = new Date("2026-04-01T10:00:00Z");
const DAYS_BEFORE = new Date("2026-03-25T07:00:00Z"); // 08:00 CET (before the DST change), archived by DAY_NOON

/** `now` given: that day's daily; otherwise a tier list active at the real time. */
async function setup(members = 3, now?: Date) {
  const users = [];
  for (let i = 0; i < members; i++) users.push(await makeUser());
  await makeIdeas(3);
  const r = now ? await drawDaily(now) : await drawActive();
  if (r.status !== "created") throw new Error("setup");
  const targets = await getTargets(r.roundId);
  return { users, roundId: r.roundId, targets };
}

const play = async (userId: string, roundId: string, now?: Date) =>
  submitTierList(userId, { roundId, placements: placementsFor(await getTargets(roundId), () => "A") }, now);

describe("submitTierList — validation", () => {
  it("accepts exactly the round's members", async () => {
    const { users, roundId, targets } = await setup();
    await submitTierList(users[0].id, { roundId, placements: placementsFor(targets, () => "A") });
    expect(await getVotes(roundId)).toHaveLength(3);
  });

  it.each([
    ["a stranger", (t: { id: string }[]) => [...placementsFor(t.slice(1), () => "S"), { targetId: "nope", tier: "S", position: 0 }], /inconnu/],
    ["a duplicate", (t: { id: string }[]) => placementsFor([...t.slice(1), t[1]], () => "S"), /deux fois/],
    ["a missing member", (t: { id: string }[]) => placementsFor(t.slice(1), () => "S"), /tous/],
    ["an unknown tier", (t: { id: string }[]) => t.map((x) => ({ targetId: x.id, tier: "Z", position: 0 })), /invalide/],
  ])("rejects %s", async (_label, build, error) => {
    const { users, roundId, targets } = await setup();
    await expect(submitTierList(users[0].id, { roundId, placements: build(targets) })).rejects.toThrow(error);
  });

  it("rejects a malformed round id and an unknown round", async () => {
    const { users, targets } = await setup();
    await expect(submitTierList(users[0].id, { roundId: "x", placements: placementsFor(targets, () => "S") })).rejects.toThrow(/invalide/);
    await expect(
      submitTierList(users[0].id, { roundId: crypto.randomUUID(), placements: placementsFor(targets, () => "S") }),
    ).rejects.toThrow(/introuvable/);
  });

  it("refuses a second full submission (409)", async () => {
    const { users, roundId, targets } = await setup();
    await submitTierList(users[0].id, { roundId, placements: placementsFor(targets, () => "A") });
    await expect(submitTierList(users[0].id, { roundId, placements: placementsFor(targets, () => "S") })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("TTL never closes voting", () => {
  it("accepts an answer after archiving, flagged late", async () => {
    const start = new Date("2026-06-01T06:00:00Z");
    const { users, roundId } = await setup(2, start);
    await play(users[0].id, roundId, new Date(start.getTime() + 23 * HOUR_MS));
    await play(users[1].id, roundId, new Date(start.getTime() + 30 * HOUR_MS)); // archived, still accepted
    const subs = await db.select().from(schema.submissions).where(eq(schema.submissions.roundId, roundId));
    expect(Object.fromEntries(subs.map((s) => [s.voterId, s.isLate]))).toEqual({ [users[0].id]: false, [users[1].id]: true });
    expect(await getProgress(roundId)).toEqual({ played: 2, total: 2 });
  });
});

describe("personal counter (tier lists answered before archiving)", () => {
  it("two answers on time on two tier lists of the same day give +2", async () => {
    const u = await makeUser();
    await makeIdeas(2);
    const daily = await drawDaily(DAY_8AM);
    const extra = await drawExtra(3, new Date("2026-04-01T09:00:00Z"));
    if (daily.status !== "created" || extra.status !== "created") throw new Error("setup");
    expect(await answeredOnTimeCount(u.id)).toBe(0);
    await play(u.id, daily.roundId, DAY_NOON);
    await play(u.id, extra.roundId, DAY_NOON);
    expect(await answeredOnTimeCount(u.id)).toBe(2);
  });

  it("an answer after archiving gives +0; a missed tier list removes nothing", async () => {
    const u = await makeUser();
    await makeIdeas(3);
    const d1 = await drawDaily(new Date("2026-01-01T07:00:00Z"));
    const d2 = await drawDaily(new Date("2026-01-02T07:00:00Z")); // missed entirely
    const d3 = await drawDaily(new Date("2026-01-03T07:00:00Z"));
    if (d1.status !== "created" || d2.status !== "created" || d3.status !== "created") throw new Error("setup");
    await play(u.id, d1.roundId, new Date("2026-01-01T12:00:00Z"));
    await play(u.id, d3.roundId, new Date("2026-01-03T12:00:00Z"));
    expect(await answeredOnTimeCount(u.id)).toBe(2); // the missed day didn't reset anything
    await play(u.id, d2.roundId, new Date("2026-01-05T12:00:00Z")); // after its archiving
    expect(await answeredOnTimeCount(u.id)).toBe(2);
  });

  it("placing a newcomer later doesn't count the same tier list twice", async () => {
    const { users, roundId } = await setup(2);
    await play(users[0].id, roundId);
    expect(await answeredOnTimeCount(users[0].id)).toBe(1);
    const newcomer = await makeUser({ status: "pending" });
    await setMemberStatus(newcomer.id, "active", null, "pending");
    await submitTierList(users[0].id, { roundId, placements: [{ targetId: newcomer.id, tier: "S", position: 0 }] });
    expect(await answeredOnTimeCount(users[0].id)).toBe(1);
  });
});

describe("new members joining (complement)", () => {
  it("validation adds the member to every active tier list (not archives), keeping existing answers", async () => {
    const now = DAY_NOON;
    const a = await makeUser();
    await makeIdeas(4);
    const old = await drawDaily(DAYS_BEFORE); // archived
    const daily = await drawDaily(DAY_8AM);
    const extra = await drawExtra(5, new Date("2026-04-01T09:00:00Z"));
    if (old.status !== "created" || daily.status !== "created" || extra.status !== "created") throw new Error("setup");
    await play(a.id, daily.roundId, now);

    const newcomer = await makeUser({ status: "pending" });
    const { addedTo } = await setMemberStatus(newcomer.id, "active", null, "pending", now);
    expect(addedTo.sort()).toEqual([daily.roundId, extra.roundId].sort());
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, newcomer.id));
    expect(u.status).toBe("active");

    for (const id of [daily.roundId, extra.roundId]) expect((await getTargets(id)).map((t) => t.id)).toContain(newcomer.id);
    expect(await getTargets(old.roundId)).toHaveLength(1);

    // the one who already played only places the newcomer
    expect(await missingTargetsFor(daily.roundId, a.id)).toEqual([newcomer.id]);
    expect(await getVotes(daily.roundId)).toHaveLength(1); // nothing deleted
    await expect(submitTierList(a.id, { roundId: daily.roundId, placements: [{ targetId: a.id, tier: "S", position: 0 }] })).rejects.toThrow(/inconnu/);
    await submitTierList(a.id, { roundId: daily.roundId, placements: [{ targetId: newcomer.id, tier: "S", position: 0 }] });
    expect(await missingTargetsFor(daily.roundId, a.id)).toEqual([]);
    expect(await getVotes(daily.roundId)).toHaveLength(2);
  });

  it("is atomic: if joining the tier lists fails, the account stays pending", async () => {
    await makeUser();
    await makeIdeas(1);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");
    const pending = await makeUser({ status: "pending" });
    // simulate a failure after the status update, inside the same transaction
    await expect(
      db.transaction(async (tx) => {
        await tx.update(schema.user).set({ status: "active" }).where(eq(schema.user.id, pending.id));
        await addMemberToActiveRounds(pending.id, tx);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, pending.id));
    expect(u.status).toBe("pending");
    expect((await getTargets(r.roundId)).map((t) => t.id)).not.toContain(pending.id);
  });

  it("a ban removes the member from active tier lists only", async () => {
    const now = DAY_NOON;
    const a = await makeUser();
    const b = await makeUser();
    await makeIdeas(2);
    const old = await drawDaily(DAYS_BEFORE);
    const cur = await drawDaily(DAY_8AM);
    if (old.status !== "created" || cur.status !== "created") throw new Error("setup");
    await setMemberStatus(b.id, "rejected", a.id, "active", now);
    expect((await getTargets(cur.roundId)).map((t) => t.id)).toEqual([a.id]);
    expect(await getTargets(old.roundId)).toHaveLength(2);
  });
});
