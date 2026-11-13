import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
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

/** Who asked for a draw, written to the audit log with the new tier list. */
export type DrawSource = { actorId: string | null; trigger: "worker" | "manual" | "extra" | "idea" | "review" | "settings" };

type NewRound = { kind: "daily" | "extra"; date: string; now: Date; ttlHours: number; by: DrawSource };

/**
 * A random drawable idea, row-locked until the end of the transaction.
 * Plain FOR UPDATE (no SKIP LOCKED): draws are already serialised by the
 * membership lock, and skipping an idea that's being edited could report an
 * empty bank while it isn't. A row that stops matching while we wait for its
 * lock (just refused, deleted) is re-checked and skipped by Postgres.
 */
async function pickRandomIdea(tx: Tx, exclude?: string): Promise<string | null> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from ${ideas}
    where ${availableIdea()} ${exclude ? sql`and id <> ${exclude}` : sql``}
    order by random()
    limit 1
    for update
  `);
  return rows[0]?.id ?? null;
}

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
async function createRound({ kind, date, now, ttlHours, by }: NewRound): Promise<DrawResult> {
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

    const ideaId = await pickRandomIdea(tx);
    if (!ideaId) return { status: "empty_bank" };

    // the unique indexes (one daily per day, one tier list per idea) can't
    // conflict under the lock: a violation is a real bug and must surface
    const [{ id: roundId }] = await tx
      .insert(rounds)
      .values({ ideaId, kind, date, startsAt: now, expiresAt: new Date(now.getTime() + ttlHours * HOUR_MS) })
      .returning({ id: rounds.id });

    await tx.update(ideas).set({ usedAt: now }).where(eq(ideas.id, ideaId));

    const members = await tx.select({ id: user.id }).from(user).where(eq(user.status, "active"));
    if (members.length) {
      await tx.insert(roundTargets).values(members.map((m) => ({ roundId, userId: m.id })));
    }
    await audit(by.actorId, kind === "daily" ? "round.draw" : "round.extra", "round", roundId, { trigger: by.trigger, ttlHours }, tx);
    return { status: "created", roundId, ideaId };
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
export function drawDaily(now = new Date(), by: DrawSource = { actorId: null, trigger: "worker" }): Promise<DrawResult> {
  const date = dueDailyKey(now);
  if (!date) return Promise.resolve({ status: "not_due" });
  return createRound({ kind: "daily", date, now, ttlHours: DEFAULT_TTL_HOURS, by });
}

/** Moderator button: an extra tier list with its own TTL, on top of the daily one. */
export function drawExtra(ttlHours: number, now = new Date(), actorId: string | null = null): Promise<DrawResult> {
  return createRound({ kind: "extra", date: dayKey(now), now, ttlHours, by: { actorId, trigger: "extra" } });
}

/**
 * Moderator re-roll of an active tier list: only while nobody has played,
 * the drawn idea goes back to the bank and a new one is picked.
 * The round row is locked FOR UPDATE; an answer share-locks it (see
 * submitTierList), so no answer can slip in between the check and the switch.
 */
export async function rerollRound(roundId: string, actorId: string | null = null, now = new Date()): Promise<{ ideaId: string }> {
  return db.transaction(async (tx) => {
    const [round] = await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update").limit(1);
    if (!round) throw notFound("Tier list introuvable");
    if (round.expiresAt.getTime() <= now.getTime()) throw badRequest("Cette tier list est archivée");

    const [played] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.roundId, roundId)).limit(1);
    if (played) throw badRequest("Impossible : des membres ont déjà joué");

    const next = await pickRandomIdea(tx, round.ideaId);
    if (!next) throw badRequest("Aucune autre idée disponible dans la banque");

    await tx.update(ideas).set({ usedAt: null }).where(eq(ideas.id, round.ideaId));
    await tx.update(ideas).set({ usedAt: now }).where(and(eq(ideas.id, next), isNull(ideas.usedAt)));
    await tx.update(rounds).set({ ideaId: next }).where(eq(rounds.id, roundId));
    await audit(actorId, "round.reroll", "round", roundId, { from: round.ideaId, to: next }, tx);
    return { ideaId: next };
  });
}
