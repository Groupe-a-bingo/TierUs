import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayKey } from "@/lib/dates";
import { drawRound } from "@/server/rounds/draw";
import { getProgress, getTargets, getVotes } from "@/server/rounds/queries";
import { submitTierList } from "@/server/rounds/submit";
import { syncTodayTargets, missingTargetsFor } from "@/server/rounds/targets";
import { makeIdeas, makeUser, placementsFor, resetDb } from "../support/factories";

beforeEach(resetDb);

async function setup(members = 3, date = dayKey()) {
  const users = [];
  for (let i = 0; i < members; i++) users.push(await makeUser());
  await makeIdeas(3);
  const r = await drawRound(date);
  if (r.status !== "created") throw new Error("setup");
  const targets = await getTargets(r.roundId);
  return { users, roundId: r.roundId, targets };
}

const getRound = async (id: string) => (await db.select().from(schema.rounds).where(eq(schema.rounds.id, id)))[0];

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

describe("reveal on submission", () => {
  it("reveals when the last member plays, and later answers are flagged late", async () => {
    const { users, roundId, targets } = await setup(2);
    await submitTierList(users[0].id, { roundId, placements: placementsFor(targets, () => "S") });
    expect((await getRound(roundId)).revealedAt).toBeNull();
    await submitTierList(users[1].id, { roundId, placements: placementsFor(targets, () => "B") });
    const r = await getRound(roundId);
    expect(r.revealReason).toBe("all_played");

    const late = await makeUser();
    await submitTierList(late.id, { roundId, placements: placementsFor(targets, () => "C") });
    const [sub] = await db.select().from(schema.submissions).where(eq(schema.submissions.voterId, late.id));
    expect(sub.isLate).toBe(true);
  });

  it("progress counts members who played", async () => {
    const { users, roundId, targets } = await setup(3);
    await submitTierList(users[0].id, { roundId, placements: placementsFor(targets, () => "S") });
    expect(await getProgress(roundId)).toEqual({ played: 1, total: 3 });
  });
});

describe("streaks", () => {
  const streakOf = async (id: string) => (await db.select().from(schema.user).where(eq(schema.user.id, id)))[0];

  it("count on today's round only, never on archives", async () => {
    const u = await makeUser();
    await makeIdeas(2);
    const past = await drawRound("2020-01-01");
    if (past.status !== "created") throw new Error("setup");
    await submitTierList(u.id, { roundId: past.roundId, placements: placementsFor(await getTargets(past.roundId), () => "S") });
    expect((await streakOf(u.id)).streak).toBe(0);

    const today = await drawRound(dayKey());
    if (today.status !== "created") throw new Error("setup");
    await submitTierList(u.id, { roundId: today.roundId, placements: placementsFor(await getTargets(today.roundId), () => "S") });
    const after = await streakOf(u.id);
    expect(after.streak).toBe(1);
    expect(after.lastPlayedRoundDate).toBe(dayKey());
  });
});

describe("new members joining (complement)", () => {
  it("keeps existing answers and only accepts the newcomer", async () => {
    const { users, roundId, targets } = await setup(2);
    await submitTierList(users[0].id, { roundId, placements: placementsFor(targets, () => "A") });

    const newcomer = await makeUser();
    expect(await syncTodayTargets()).toEqual([newcomer.id]);
    expect(await missingTargetsFor(roundId, users[0].id)).toEqual([newcomer.id]);
    expect(await getVotes(roundId)).toHaveLength(2); // nothing deleted

    // an old member is not part of the complement
    await expect(
      submitTierList(users[0].id, { roundId, placements: [{ targetId: users[1].id, tier: "S", position: 0 }] }),
    ).rejects.toThrow(/inconnu/);
    await submitTierList(users[0].id, { roundId, placements: [{ targetId: newcomer.id, tier: "S", position: 0 }] });
    expect(await missingTargetsFor(roundId, users[0].id)).toEqual([]);
    expect(await getVotes(roundId)).toHaveLength(3);
  });

  it("only touches today's round", async () => {
    await makeUser();
    await makeIdeas(1);
    const old = await drawRound("2020-05-05");
    if (old.status !== "created") throw new Error("setup");
    await makeUser();
    expect(await syncTodayTargets()).toEqual([]);
    expect(await getTargets(old.roundId)).toHaveLength(1);
  });
});
