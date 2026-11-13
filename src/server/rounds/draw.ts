import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_TTL_HOURS, HOUR_MS, dayKey, dueDailyKey } from "@/lib/dates";
import { availableIdea } from "@/server/ideas";
import { lockMembership } from "./lock";

const { ideas, rounds, roundTargets, submissions, user } = schema;

export type DrawResult =
  | { status: "created"; roundId: string; ideaId: string }
  | { status: "exists"; roundId: string }
  | { status: "empty_bank" }
  /** before 08:00 Paris: no daily is due yet today */
  | { status: "not_due" };

type NewRound = { kind: "daily" | "extra"; date: string; now: Date; ttlHours: number };

/**
 * Create a tier list: pick a random never-used approved idea (no duplicates ever),
 * mark it used, and snapshot the active members as targets.
 *
 * Everything happens in one transaction that first takes the membership
 * advisory lock (see ./lock.ts): concurrent draws run one after the other,
 * so the daily existence check made under the lock is reliable (the second
 * caller gets "exists", even when the bank only held one idea), and a member
 * validated concurrently is either snapshotted here or added afterwards.
 * The partial unique index on daily dates stays as the last line of defense.
 */
async function createRound({ kind, date, now, ttlHours }: NewRound): Promise<DrawResult> {
  return db.transaction(async (tx): Promise<DrawResult> => {
    await lockMembership(tx);

    if (kind === "daily") {
      const [existing] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.kind, "daily"), eq(rounds.date, date)))
        .limit(1);
      if (existing) return { status: "exists", roundId: existing.id };
    }

    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from ${ideas}
      where ${availableIdea()}
      order by random()
      limit 1
      for update skip locked
    `);
    const idea = rows[0];
    if (!idea) return { status: "empty_bank" };

    const inserted = await tx
      .insert(rounds)
      .values({ ideaId: idea.id, kind, date, startsAt: now, expiresAt: new Date(now.getTime() + ttlHours * HOUR_MS) })
      // only the daily partial unique index can conflict (unreachable under the lock)
      .onConflictDoNothing()
      .returning({ id: rounds.id });
    if (!inserted.length) tx.rollback();
    const roundId = inserted[0].id;

    await tx.update(ideas).set({ usedAt: now }).where(eq(ideas.id, idea.id));

    const members = await tx.select({ id: user.id }).from(user).where(eq(user.status, "active"));
    if (members.length) {
      await tx.insert(roundTargets).values(members.map((m) => ({ roundId, userId: m.id })));
    }
    return { status: "created", roundId, ideaId: idea.id };
  });
}

/**
 * The automatic daily tier list of today, due from 08:00 Europe/Paris.
 * Idempotent: the worker (08:00 + catch-up ticks), a worker restart and a new
 * idea after an empty bank may all call it; only one daily per day exists.
 * Before 08:00 nothing is due: a day whose daily was never drawn (empty bank
 * all day) is skipped rather than drawn in the early morning, which would make
 * it overlap the 08:00 one a few hours later.
 */
export function drawDaily(now = new Date()): Promise<DrawResult> {
  const date = dueDailyKey(now);
  if (!date) return Promise.resolve({ status: "not_due" });
  return createRound({ kind: "daily", date, now, ttlHours: DEFAULT_TTL_HOURS });
}

/** Moderator button: an extra tier list with its own TTL, on top of the daily one. */
export function drawExtra(ttlHours: number, now = new Date()): Promise<DrawResult> {
  return createRound({ kind: "extra", date: dayKey(now), now, ttlHours });
}

/**
 * Moderator re-roll of an active tier list: only while nobody has played,
 * the drawn idea goes back to the bank and a new one is picked.
 */
export async function rerollRound(roundId: string, now = new Date()): Promise<{ ok: true; ideaId: string } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [round] = await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update").limit(1);
    if (!round) return { ok: false, error: "Tier list introuvable" } as const;
    if (round.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "Cette tier list est archivée" } as const;

    const [played] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.roundId, roundId)).limit(1);
    if (played) return { ok: false, error: "Impossible : des membres ont déjà joué" } as const;

    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from ${ideas}
      where ${availableIdea()} and id <> ${round.ideaId}
      order by random()
      limit 1
      for update skip locked
    `);
    const next = rows[0];
    if (!next) return { ok: false, error: "Aucune autre idée disponible dans la banque" } as const;

    await tx.update(ideas).set({ usedAt: null }).where(eq(ideas.id, round.ideaId));
    await tx.update(ideas).set({ usedAt: now }).where(and(eq(ideas.id, next.id), isNull(ideas.usedAt)));
    await tx.update(rounds).set({ ideaId: next.id }).where(eq(rounds.id, roundId));
    return { ok: true, ideaId: next.id } as const;
  });
}
