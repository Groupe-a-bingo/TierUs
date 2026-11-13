import { and, desc, eq, gt, inArray, lte, ne, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { Tier } from "@/lib/tiers";
import type { Vote } from "./aggregate";

const { rounds, ideas, roundTargets, submissions, placements, user } = schema;

/**
 * The only definitions of "active" and "archived" (TTL): active while
 * starts_at <= now < expires_at, archived from expires_at on.
 */
export const activeRound = (now: Date) => and(gt(rounds.expiresAt, now), lte(rounds.startsAt, now))!;
export const archivedRound = (now: Date) => lte(rounds.expiresAt, now);

/**
 * A banned (rejected) member disappears from every tier list: not listed,
 * not counted, and neither their votes nor the votes about them count.
 * Re-admitting them brings everything back (nothing is deleted).
 */
export const notBanned = (col: AnyColumn | SQL): SQL => sql`${col} not in (select id from ${user} where status = 'rejected')`;

/** Every tier list still active at `now`, newest first (uses the expires_at index). */
export async function getActiveRounds(now = new Date()) {
  return db
    .select({ round: rounds, idea: { id: ideas.id, title: ideas.title } })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(activeRound(now))
    .orderBy(desc(rounds.createdAt), desc(rounds.id));
}

/** Old `/r/YYYY-MM-DD` links, and "has today's daily been drawn?": that day's daily tier list (extras have their own links). */
export async function getDailyRoundId(date: string): Promise<string | null> {
  const [r] = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.kind, "daily"), eq(rounds.date, date)))
    .limit(1);
  return r?.id ?? null;
}

export async function getRoundWithIdea(id: string) {
  const [r] = await db
    .select({ round: rounds, idea: { id: ideas.id, title: ideas.title, description: ideas.description } })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(eq(rounds.id, id))
    .limit(1);
  return r ?? null;
}

export async function getRoundById(id: string) {
  const [r] = await db.select().from(rounds).where(eq(rounds.id, id)).limit(1);
  return r ?? null;
}

export async function getTargets(roundId: string, exec: Tx | typeof db = db) {
  return exec
    .select({ id: user.id, name: user.name, avatarFileId: user.avatarFileId })
    .from(roundTargets)
    .innerJoin(user, eq(user.id, roundTargets.userId))
    .where(and(eq(roundTargets.roundId, roundId), ne(user.status, "rejected")))
    .orderBy(user.name);
}

export async function hasSubmitted(roundId: string, userId: string) {
  const [s] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.roundId, roundId), eq(submissions.voterId, userId)))
    .limit(1);
  return !!s;
}

/**
 * "played / total" of tier lists: their (non-banned) members, and how many of
 * them answered. Explicit aliases: an unqualified column inside the subquery
 * once resolved to `s` itself (s.round_id = s.round_id), counting every
 * target as played.
 */
export async function getProgressMany(roundIds: string[]): Promise<Map<string, { played: number; total: number }>> {
  if (!roundIds.length) return new Map();
  const { rows } = await db.execute<{ roundId: string; total: number; played: number }>(sql`
    select rt.round_id as "roundId",
           count(*)::int as total,
           count(*) filter (
             where exists (select 1 from ${submissions} s where s.round_id = rt.round_id and s.voter_id = rt.user_id)
           )::int as played
    from ${roundTargets} rt
    where rt.round_id in (${sql.join(roundIds.map((id) => sql`${id}`), sql`, `)})
      and ${notBanned(sql`rt.user_id`)}
    group by rt.round_id
  `);
  return new Map(rows.map((r) => [r.roundId, { played: r.played, total: r.total }]));
}

export async function getProgress(roundId: string) {
  return (await getProgressMany([roundId])).get(roundId) ?? { played: 0, total: 0 };
}

/** Every vote of these tier lists (banned members excluded, as voters and as targets). */
export async function getVotesMany(roundIds: string[]): Promise<(Vote & { roundId: string })[]> {
  if (!roundIds.length) return [];
  const rows = await db
    .select({ roundId: submissions.roundId, voterId: submissions.voterId, targetId: placements.targetId, tier: placements.tier })
    .from(placements)
    .innerJoin(submissions, eq(submissions.id, placements.submissionId))
    .where(and(inArray(submissions.roundId, roundIds), notBanned(submissions.voterId), notBanned(placements.targetId)));
  return rows as (Vote & { roundId: string })[];
}

export async function getVotes(roundId: string): Promise<Vote[]> {
  return getVotesMany([roundId]);
}

/** Per-voter tier lists (ordered), for "Ma tier list" / "Par membre". */
export async function getSubmissionsDetail(roundId: string) {
  const rows = await db
    .select({
      voterId: submissions.voterId,
      voterName: user.name,
      voterAvatar: user.avatarFileId,
      isLate: submissions.isLate,
      submittedAt: submissions.submittedAt,
      targetId: placements.targetId,
      tier: placements.tier,
      position: placements.position,
    })
    .from(submissions)
    .innerJoin(user, eq(user.id, submissions.voterId))
    .innerJoin(placements, eq(placements.submissionId, submissions.id))
    .where(and(eq(submissions.roundId, roundId), ne(user.status, "rejected"), notBanned(placements.targetId)))
    .orderBy(submissions.submittedAt, placements.tier, placements.position);

  const byVoter = new Map<
    string,
    { voterId: string; voterName: string; voterAvatar: string | null; isLate: boolean; placements: { targetId: string; tier: Tier; position: number }[] }
  >();
  for (const r of rows) {
    let v = byVoter.get(r.voterId);
    if (!v) {
      v = { voterId: r.voterId, voterName: r.voterName, voterAvatar: r.voterAvatar, isLate: r.isLate, placements: [] };
      byVoter.set(r.voterId, v);
    }
    v.placements.push({ targetId: r.targetId, tier: r.tier as Tier, position: r.position });
  }
  return [...byVoter.values()];
}

/** The viewer's own placements for a round (always visible to them), in board order. */
export async function getMyPlacements(roundId: string, voterId: string) {
  const rows = await db
    .select({ targetId: placements.targetId, tier: placements.tier, position: placements.position })
    .from(placements)
    .innerJoin(submissions, eq(submissions.id, placements.submissionId))
    .where(and(eq(submissions.roundId, roundId), eq(submissions.voterId, voterId)))
    .orderBy(placements.position);
  return rows as { targetId: string; tier: Tier; position: number }[];
}
