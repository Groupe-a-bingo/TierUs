import { and, isNull, lte, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ROUND_DURATION_MS } from "@/lib/dates";

const { rounds, roundTargets, submissions } = schema;

type RevealReason = "all_played" | "moderator" | "timeout";

/** Idempotent: only reveals if not already revealed. Returns true if it did. */
export async function revealRound(roundId: string, reason: RevealReason): Promise<boolean> {
  const updated = await db
    .update(rounds)
    .set({ revealedAt: new Date(), revealReason: reason })
    .where(and(eq(rounds.id, roundId), isNull(rounds.revealedAt)))
    .returning({ id: rounds.id });
  return updated.length > 0;
}

/** Reveal when every snapshotted member has submitted. */
export async function revealIfAllPlayed(roundId: string): Promise<boolean> {
  const { rows } = await db.execute<{ missing: number }>(sql`
    select count(*)::int as missing
    from ${roundTargets} rt
    where rt.round_id = ${roundId}
      and not exists (select 1 from ${submissions} s where s.round_id = rt.round_id and s.voter_id = rt.user_id)
  `);
  if ((rows[0]?.missing ?? 1) > 0) return false;
  return revealRound(roundId, "all_played");
}

/** Reveal every round open for 24h or more. */
export async function revealTimedOut(now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ROUND_DURATION_MS);
  const due = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(isNull(rounds.revealedAt), lte(rounds.startsAt, cutoff)));
  const done: string[] = [];
  for (const r of due) if (await revealRound(r.id, "timeout")) done.push(r.id);
  return done;
}

/** Before a new round starts, any older unrevealed round is closed. */
export async function revealAllOpenBefore(date: string): Promise<void> {
  const open = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(isNull(rounds.revealedAt), sql`${rounds.date} < ${date}`));
  for (const r of open) await revealRound(r.id, "timeout");
}
