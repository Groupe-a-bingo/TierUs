import { desc, eq, ilike, inArray, sql, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { aggregate, type Vote } from "./rounds/aggregate";
import { dayKey } from "@/lib/dates";

const { rounds, ideas, comments, reactions, submissions, placements, roundTargets } = schema;

export type BoardPost = {
  id: string;
  date: string;
  title: string;
  revealed: boolean;
  played: number;
  total: number;
  comments: number;
  reactions: { emoji: string; count: number }[];
  top3: string[]; // member ids (only filled when the viewer may see results)
  mine: boolean; // viewer has submitted
};

export async function listBoard(viewerId: string, opts: { q?: string; limit?: number } = {}): Promise<BoardPost[]> {
  const where = opts.q ? ilike(ideas.title, `%${opts.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined;
  const base = await db
    .select({ id: rounds.id, date: rounds.date, title: ideas.title, revealedAt: rounds.revealedAt })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(where)
    .orderBy(desc(rounds.date))
    .limit(opts.limit ?? 60);
  if (!base.length) return [];
  const ids = base.map((r) => r.id);

  const [commentCounts, reactionCounts, progress, mine, votes] = await Promise.all([
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
    db
      .select({ roundId: submissions.roundId, voterId: submissions.voterId, targetId: placements.targetId, tier: placements.tier })
      .from(placements)
      .innerJoin(submissions, eq(submissions.id, placements.submissionId))
      .where(inArray(submissions.roundId, ids)),
  ]);

  const mineSet = new Set(mine.map((m) => m.roundId));
  const today = dayKey(); // results of today's round stay hidden until you play
  const votesByRound = new Map<string, Vote[]>();
  for (const v of votes) {
    const arr = votesByRound.get(v.roundId) ?? [];
    arr.push(v as Vote);
    votesByRound.set(v.roundId, arr);
  }

  return base.map((r) => {
    const revealed = !!r.revealedAt;
    const isMine = mineSet.has(r.id);
    const visible = revealed && (r.date !== today || isMine);
    const p = progress.find((x) => x.roundId === r.id);
    return {
      id: r.id,
      date: r.date,
      title: r.title,
      revealed,
      played: p?.played ?? 0,
      total: p?.total ?? 0,
      comments: commentCounts.find((c) => c.roundId === r.id)?.n ?? 0,
      reactions: reactionCounts.filter((x) => x.roundId === r.id).map((x) => ({ emoji: x.emoji, count: x.n })),
      top3: visible ? aggregate(votesByRound.get(r.id) ?? []).results.slice(0, 3).map((x) => x.targetId) : [],
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
