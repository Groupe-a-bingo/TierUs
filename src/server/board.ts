import { and, desc, eq, gt, ilike, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { aggregate, type Vote } from "./rounds/aggregate";
import { canSeeResults } from "./rounds/visibility";

const { rounds, ideas, comments, reactions, submissions, placements, roundTargets } = schema;

export type BoardPost = {
  id: string;
  kind: "daily" | "extra";
  date: string;
  title: string;
  startsAt: Date;
  expiresAt: Date;
  active: boolean;
  played: number;
  total: number;
  comments: number;
  reactions: { emoji: string; count: number }[];
  top3: string[]; // member ids (only filled once the viewer has answered)
  mine: boolean; // viewer has submitted
};

/**
 * Board posts, newest first (creation time).
 * - "active": every tier list with starts_at <= now < expires_at (no search, no limit)
 * - "archived": expires_at <= now, searchable
 */
export async function listBoard(
  viewerId: string,
  opts: { scope?: "active" | "archived"; q?: string; limit?: number; now?: Date } = {},
): Promise<BoardPost[]> {
  const now = opts.now ?? new Date();
  const scope = opts.scope ?? "archived";
  const search = opts.q ? ilike(ideas.title, `%${opts.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined;
  const where =
    scope === "active"
      ? and(gt(rounds.expiresAt, now), lte(rounds.startsAt, now))
      : and(lte(rounds.expiresAt, now), search);

  const query = db
    .select({ id: rounds.id, kind: rounds.kind, date: rounds.date, title: ideas.title, startsAt: rounds.startsAt, expiresAt: rounds.expiresAt })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(where)
    .orderBy(desc(rounds.createdAt), desc(rounds.id));
  const base = scope === "active" ? await query : await query.limit(opts.limit ?? 60);
  if (!base.length) return [];
  const ids = base.map((r) => r.id);

  const [commentCounts, reactionCounts, progress, mine] = await Promise.all([
    db
      .select({ roundId: comments.roundId, n: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(inArray(comments.roundId, ids), isNull(comments.deletedAt)))
      .groupBy(comments.roundId),
    db
      .select({ roundId: reactions.roundId, emoji: reactions.emoji, n: sql<number>`count(*)::int` })
      .from(reactions)
      .where(and(inArray(reactions.roundId, ids), isNull(reactions.commentId)))
      .groupBy(reactions.roundId, reactions.emoji),
    // explicit aliases: an unqualified column inside the subquery resolved to
    // `s` itself (s.round_id = s.round_id), counting every target as played
    db
      .execute<{ roundId: string; total: number; played: number }>(sql`
        select rt.round_id as "roundId",
               count(*)::int as total,
               count(*) filter (
                 where exists (select 1 from ${submissions} s where s.round_id = rt.round_id and s.voter_id = rt.user_id)
               )::int as played
        from ${roundTargets} rt
        where rt.round_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        group by rt.round_id
      `)
      .then((r) => r.rows),
    db
      .select({ roundId: submissions.roundId })
      .from(submissions)
      .where(and(inArray(submissions.roundId, ids), eq(submissions.voterId, viewerId))),
  ]);

  const mineSet = new Set(mine.map((m) => m.roundId));
  // podiums only for the tier lists the viewer answered: never load the others' votes
  const visibleIds = ids.filter((id) => canSeeResults({ hasSubmitted: mineSet.has(id) }));
  const votes = visibleIds.length
    ? await db
        .select({ roundId: submissions.roundId, voterId: submissions.voterId, targetId: placements.targetId, tier: placements.tier })
        .from(placements)
        .innerJoin(submissions, eq(submissions.id, placements.submissionId))
        .where(inArray(submissions.roundId, visibleIds))
    : [];
  const votesByRound = new Map<string, Vote[]>();
  for (const v of votes) {
    const arr = votesByRound.get(v.roundId) ?? [];
    arr.push(v as Vote);
    votesByRound.set(v.roundId, arr);
  }

  return base.map((r) => {
    const isMine = mineSet.has(r.id);
    const p = progress.find((x) => x.roundId === r.id);
    return {
      id: r.id,
      kind: r.kind,
      date: r.date,
      title: r.title,
      startsAt: r.startsAt,
      expiresAt: r.expiresAt,
      active: r.startsAt.getTime() <= now.getTime() && now.getTime() < r.expiresAt.getTime(),
      played: p?.played ?? 0,
      total: p?.total ?? 0,
      comments: commentCounts.find((c) => c.roundId === r.id)?.n ?? 0,
      reactions: reactionCounts.filter((x) => x.roundId === r.id).map((x) => ({ emoji: x.emoji, count: x.n })),
      top3: isMine ? aggregate(votesByRound.get(r.id) ?? []).results.slice(0, 3).map((x) => x.targetId) : [],
      mine: isMine,
    };
  });
}

export async function membersById(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; name: string; avatarFileId: string | null }>();
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name, avatarFileId: schema.user.avatarFileId })
    .from(schema.user)
    .where(inArray(schema.user.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
