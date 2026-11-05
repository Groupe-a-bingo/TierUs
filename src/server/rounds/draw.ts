import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayKey } from "@/lib/dates";
import { revealAllOpenBefore } from "./reveal";

const { ideas, rounds, roundTargets, submissions, user } = schema;

export type DrawResult =
  | { status: "created"; roundId: string; ideaId: string }
  | { status: "exists"; roundId: string }
  | { status: "empty_bank" };

/**
 * Create today's round: pick a random never-used idea (no duplicates ever),
 * mark it used, and snapshot the active members as targets.
 * Safe to run concurrently / repeatedly (unique date + SKIP LOCKED).
 */
export async function drawRound(date = dayKey(), now = new Date()): Promise<DrawResult> {
  await revealAllOpenBefore(date);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: rounds.id }).from(rounds).where(eq(rounds.date, date)).limit(1);
    if (existing) return { status: "exists", roundId: existing.id } as const;

    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from ${ideas}
      where used_at is null
      order by random()
      limit 1
      for update skip locked
    `);
    const idea = rows[0];
    if (!idea) return { status: "empty_bank" } as const;

    const inserted = await tx
      .insert(rounds)
      .values({ ideaId: idea.id, date, startsAt: now })
      .onConflictDoNothing({ target: rounds.date })
      .returning({ id: rounds.id });
    if (!inserted.length) {
      tx.rollback(); // someone else created it concurrently
    }
    const roundId = inserted[0].id;

    await tx.update(ideas).set({ usedAt: now }).where(eq(ideas.id, idea.id));

    const members = await tx.select({ id: user.id }).from(user).where(eq(user.status, "active"));
    if (members.length) {
      await tx.insert(roundTargets).values(members.map((m) => ({ roundId, userId: m.id })));
    }
    return { status: "created", roundId, ideaId: idea.id } as const;
  }).catch(async (err) => {
    // rollback from a concurrent insert: report the winner
    const [r] = await db.select({ id: rounds.id }).from(rounds).where(eq(rounds.date, date)).limit(1);
    if (r) return { status: "exists", roundId: r.id } as const;
    throw err;
  });
  return result;
}

/**
 * Moderator re-roll of the current round: only while nobody has played,
 * the drawn idea goes back to the bank and a new one is picked.
 */
export async function rerollRound(roundId: string): Promise<{ ok: true; ideaId: string } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [round] = await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update").limit(1);
    if (!round) return { ok: false, error: "Round introuvable" } as const;
    if (round.revealedAt) return { ok: false, error: "Le round est déjà révélé" } as const;

    const [played] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.roundId, roundId)).limit(1);
    if (played) return { ok: false, error: "Impossible : des membres ont déjà joué" } as const;

    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from ${ideas}
      where used_at is null and id <> ${round.ideaId}
      order by random()
      limit 1
      for update skip locked
    `);
    const next = rows[0];
    if (!next) return { ok: false, error: "Aucune autre idée disponible dans la banque" } as const;

    await tx.update(ideas).set({ usedAt: null }).where(eq(ideas.id, round.ideaId));
    await tx.update(ideas).set({ usedAt: new Date() }).where(and(eq(ideas.id, next.id), isNull(ideas.usedAt)));
    await tx.update(rounds).set({ ideaId: next.id }).where(eq(rounds.id, roundId));
    return { ok: true, ideaId: next.id } as const;
  });
}
