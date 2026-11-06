import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { submissions, rounds } = schema;

/**
 * Personal counter: how many tier lists this member answered before they
 * were archived. Cumulative, never reset by a missed day. At most once per
 * tier list (one submission per member and tier list; completing it for a
 * newcomer doesn't create a second one), extra tier lists included. An
 * answer sent after archiving counts for nothing.
 * Derived from the submissions themselves, so it can't drift.
 */
export async function answeredOnTimeCount(userId: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from ${submissions} s
    join ${rounds} r on r.id = s.round_id
    where s.voter_id = ${userId}
      and s.submitted_at < r.expires_at
  `);
  return rows[0]?.n ?? 0;
}

/** Pure rule, shared with the tests: does a first answer at `submittedAt` count? */
export const countsForCounter = (submittedAt: Date, expiresAt: Date) => submittedAt.getTime() < expiresAt.getTime();
