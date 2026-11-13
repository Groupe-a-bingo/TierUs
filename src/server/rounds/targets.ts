import { sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";

const { rounds, roundTargets, submissions, placements } = schema;

/**
 * Add a member to every tier list not yet expired at `now` (e.g. they just got
 * validated). Call it in the transaction that activates the account, after
 * `lockMembership(tx)`, so both happen or neither does and no draw can
 * snapshot members in between. No `starts_at <= now` filter: a round drawn
 * while this transaction waited for the lock starts after `now` and must be
 * included too (tier lists never start in the future otherwise).
 * Existing submissions are kept untouched: their authors are asked to place
 * the newcomer. Returns the ids of the tier lists the member was added to.
 */
export async function addMemberToActiveRounds(userId: string, exec: Tx | typeof db = db, now = new Date()): Promise<string[]> {
  const { rows } = await exec.execute<{ round_id: string }>(sql`
    insert into ${roundTargets} (round_id, user_id)
    select r.id, ${userId}
    from ${rounds} r
    where r.expires_at > ${now.toISOString()}::timestamptz
    on conflict do nothing
    returning round_id
  `);
  return rows.map((r) => r.round_id);
}

/** A banned member leaves the tier lists that are still active (archives keep history). */
export async function removeMemberFromActiveRounds(userId: string, exec: Tx | typeof db = db, now = new Date()): Promise<void> {
  await exec.execute(sql`
    delete from ${roundTargets} rt using ${rounds} r
    where rt.round_id = r.id
      and rt.user_id = ${userId}
      and r.expires_at > ${now.toISOString()}::timestamptz
  `);
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
