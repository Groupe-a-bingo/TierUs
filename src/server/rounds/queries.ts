import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tier } from "@/lib/tiers";
import { aggregate, type Vote } from "./aggregate";

const { rounds, ideas, roundTargets, submissions, placements, user } = schema;

export type RoundRow = typeof rounds.$inferSelect;

/** Every tier list still active at `now`, newest first (uses the expires_at index). */
export async function getActiveRounds(now = new Date()) {
  return db
    .select({ round: rounds, idea: { id: ideas.id, title: ideas.title } })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(and(gt(rounds.expiresAt, now), lte(rounds.startsAt, now)))
    .orderBy(desc(rounds.createdAt), desc(rounds.id));
}

/** Has the daily tier list of this day been drawn already? */
export async function getDailyRound(date: string) {
  const [r] = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.kind, "daily"), eq(rounds.date, date)))
    .limit(1);
  return r ?? null;
}

/** Old `/r/YYYY-MM-DD` links: that day's daily tier list, else the first one created that day. */
export async function getRoundIdByDate(date: string): Promise<string | null> {
  const [r] = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(eq(rounds.date, date))
    .orderBy(sql`case when ${rounds.kind} = 'daily' then 0 else 1 end`, asc(rounds.createdAt))
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

export async function getTargets(roundId: string) {
  return db
    .select({ id: user.id, name: user.name, avatarFileId: user.avatarFileId })
    .from(roundTargets)
    .innerJoin(user, eq(user.id, roundTargets.userId))
    .where(eq(roundTargets.roundId, roundId))
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

export async function getProgress(roundId: string) {
  const [row] = await db.execute<{ played: number; total: number }>(sql`
    select
      (select count(*)::int from ${roundTargets} rt
         where rt.round_id = ${roundId}
           and exists (select 1 from ${submissions} s where s.round_id = rt.round_id and s.voter_id = rt.user_id)) as played,
      (select count(*)::int from ${roundTargets} where round_id = ${roundId}) as total
  `).then((r) => r.rows);
  return row ?? { played: 0, total: 0 };
}

export async function getVotes(roundId: string): Promise<Vote[]> {
  const rows = await db
    .select({ voterId: submissions.voterId, targetId: placements.targetId, tier: placements.tier })
    .from(placements)
    .innerJoin(submissions, eq(submissions.id, placements.submissionId))
    .where(eq(submissions.roundId, roundId));
  return rows as Vote[];
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
    .where(eq(submissions.roundId, roundId))
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

export async function getAggregate(roundId: string) {
  return aggregate(await getVotes(roundId));
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
