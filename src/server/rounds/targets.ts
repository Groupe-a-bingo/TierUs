import { and, eq, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayKey } from "@/lib/dates";
import { getCurrentRound } from "./queries";

const { user, roundTargets, submissions, placements } = schema;

/**
 * Add every active member missing from today's round (e.g. someone just got
 * validated). Existing submissions are kept untouched: their authors will be
 * asked to place the newcomer, and the average simply has one vote less for
 * them until then. Returns the ids that were added.
 */
export async function syncTodayTargets(): Promise<string[]> {
  const round = await getCurrentRound();
  if (!round || round.date !== dayKey()) return [];

  const added = await db
    .insert(roundTargets)
    .select(
      db
        .select({ roundId: sql<string>`${round.id}`.as("round_id"), userId: user.id })
        .from(user)
        .where(
          and(
            eq(user.status, "active"),
            notExists(
              db
                .select({ one: sql`1` })
                .from(roundTargets)
                .where(and(eq(roundTargets.roundId, round.id), eq(roundTargets.userId, user.id))),
            ),
          ),
        ),
    )
    .onConflictDoNothing()
    .returning({ userId: roundTargets.userId });
  return added.map((a) => a.userId);
}

/** Targets this voter hasn't placed yet in their existing submission. */
export async function missingTargetsFor(roundId: string, voterId: string): Promise<string[]> {
  const { rows } = await db.execute<{ user_id: string }>(sql`
    select rt.user_id
    from ${roundTargets} rt
    join ${submissions} s on s.round_id = rt.round_id and s.voter_id = ${voterId}
    where rt.round_id = ${roundId}
      and not exists (
        select 1 from ${placements} p where p.submission_id = s.id and p.target_id = rt.user_id
      )
  `);
  return rows.map((r) => r.user_id);
}
