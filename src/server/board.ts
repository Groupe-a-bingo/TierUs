import { and, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Member } from "@/lib/types";
import { isActive } from "@/lib/dates";
import { activeRound, archivedRound, getProgressMany, notBanned } from "./rounds/queries";
import { canSeeResults } from "./rounds/visibility";

const { rounds, ideas, comments, reactions, submissions, placements } = schema;

/** Archives per page (the active tier lists are never paginated). */
export const ARCHIVE_PAGE = 30;

export type BoardPost = {
  id: string;
  kind: "daily" | "extra";
  date: string;
  title: string;
  startsAt: Date;
  expiresAt: Date;
  createdAt: Date;
  active: boolean;
  played: number;
  total: number;
  comments: number;
  reactions: { emoji: string; count: number }[];
  top3: string[]; // member ids (only filled once the viewer has answered)
  mine: boolean; // viewer has submitted
};

/** Archive pages: "<created_at ISO>~<id>" of the last post shown (stable under inserts). */
export type Cursor = { createdAt: Date; id: string };
export const encodeCursor = (c: Cursor) => `${c.createdAt.toISOString()}~${c.id}`;
export function decodeCursor(raw: string | undefined): Cursor | undefined {
  const [at, id] = raw?.split("~") ?? [];
  const createdAt = new Date(at ?? "");
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : undefined;
}

const createdMs = sql`date_trunc('milliseconds', ${rounds.createdAt})`;

const titleSearch = (q?: string) => (q ? ilike(ideas.title, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined);

/** How many archived tier lists match (the page only shows ARCHIVE_PAGE of them). */
export async function countArchived(q?: string, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(and(archivedRound(now), titleSearch(q)));
  return r?.n ?? 0;
}

/**
 * Top 3 of each tier list, computed in SQL (the same ranking as aggregate():
 * mean score rounded to 2 decimals desc, then member id in code point order).
 */
async function podiums(roundIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!roundIds.length) return out;
  const { rows } = await db.execute<{ round_id: string; target_id: string }>(sql`
    select round_id, target_id from (
      select s.round_id, p.target_id,
             row_number() over (
               partition by s.round_id
               order by round(avg(6 - array_position(enum_range(null::tier), p.tier)), 2) desc, p.target_id collate "C"
             ) as rk
      from ${placements} p
      join ${submissions} s on s.id = p.submission_id
      where s.round_id in (${sql.join(roundIds.map((id) => sql`${id}`), sql`, `)})
        and ${notBanned(sql`s.voter_id`)} and ${notBanned(sql`p.target_id`)}
      group by s.round_id, p.target_id
    ) ranked
    where rk <= 3
    order by round_id, rk
  `);
  for (const r of rows) out.set(r.round_id, [...(out.get(r.round_id) ?? []), r.target_id]);
  return out;
}

/**
 * Board posts, newest first (creation time).
 * - "active": every active tier list (no search, no limit)
 * - "archived": searchable, ARCHIVE_PAGE per page, `before` = the previous page's last post
 */
export async function listBoard(
  viewerId: string,
  opts: { scope?: "active" | "archived"; q?: string; before?: Cursor; limit?: number; now?: Date } = {},
): Promise<BoardPost[]> {
  const now = opts.now ?? new Date();
  const scope = opts.scope ?? "archived";
  // created_at has microseconds, JS dates (the cursor) milliseconds: sort and
  // compare on the millisecond, then the id, so no row is skipped or repeated
  const before = opts.before ? sql`(${createdMs}, ${rounds.id}) < (${opts.before.createdAt.toISOString()}::timestamptz, ${opts.before.id})` : undefined;
  const where = scope === "active" ? activeRound(now) : and(archivedRound(now), titleSearch(opts.q), before);

  const query = db
    .select({ id: rounds.id, kind: rounds.kind, date: rounds.date, title: ideas.title, startsAt: rounds.startsAt, expiresAt: rounds.expiresAt, createdAt: rounds.createdAt })
    .from(rounds)
    .innerJoin(ideas, eq(ideas.id, rounds.ideaId))
    .where(where)
    .orderBy(desc(createdMs), desc(rounds.id));
  const base = scope === "active" ? await query : await query.limit(opts.limit ?? ARCHIVE_PAGE);
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
    getProgressMany(ids),
    db
      .select({ roundId: submissions.roundId })
      .from(submissions)
      .where(and(inArray(submissions.roundId, ids), eq(submissions.voterId, viewerId))),
  ]);

  const mineSet = new Set(mine.map((m) => m.roundId));
  // podiums only for the tier lists the viewer answered: never load the others' votes
  const top3 = await podiums(ids.filter((id) => canSeeResults({ hasSubmitted: mineSet.has(id) })));

  return base.map((r) => {
    const isMine = mineSet.has(r.id);
    const p = progress.get(r.id);
    return {
      id: r.id,
      kind: r.kind,
      date: r.date,
      title: r.title,
      startsAt: r.startsAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      active: isActive(r, now),
      played: p?.played ?? 0,
      total: p?.total ?? 0,
      comments: commentCounts.find((c) => c.roundId === r.id)?.n ?? 0,
      reactions: reactionCounts.filter((x) => x.roundId === r.id).map((x) => ({ emoji: x.emoji, count: x.n })),
      top3: isMine ? (top3.get(r.id) ?? []) : [],
      mine: isMine,
    };
  });
}

export async function membersById(ids: string[]): Promise<Map<string, Member>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name, avatarFileId: schema.user.avatarFileId })
    .from(schema.user)
    .where(inArray(schema.user.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
