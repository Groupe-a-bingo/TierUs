import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CommentView, ReactionSummary } from "@/lib/types";

/** The discussion shows the latest messages (older ones aren't paginated yet). */
export const COMMENTS_LIMIT = 500;

const { comments, reactions, user } = schema;

function summarize(rows: { emoji: string; userId: string }[], viewerId: string): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>();
  for (const r of rows) {
    const s = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    s.count++;
    if (r.userId === viewerId) s.mine = true;
    map.set(r.emoji, s);
  }
  return [...map.values()];
}

export async function getPostReactions(roundId: string, viewerId: string) {
  const rows = await db
    .select({ emoji: reactions.emoji, userId: reactions.userId, commentId: reactions.commentId })
    .from(reactions)
    .where(eq(reactions.roundId, roundId));
  return summarize(rows.filter((r) => !r.commentId), viewerId);
}

const commentCols = {
  id: comments.id,
  body: comments.body,
  createdAt: comments.createdAt,
  deletedAt: comments.deletedAt,
  replyToId: comments.replyToId,
  authorId: user.id,
  authorName: user.name,
  authorAvatar: user.avatarFileId,
};

export async function getComments(roundId: string, viewerId: string, viewerIsMod: boolean): Promise<CommentView[]> {
  // the newest messages, shown oldest first
  const rows = (
    await db
      .select(commentCols)
      .from(comments)
      .innerJoin(user, eq(user.id, comments.userId))
      .where(eq(comments.roundId, roundId))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(COMMENTS_LIMIT)
  ).reverse();

  const ids = rows.map((r) => r.id);
  // messages quoted by a reply but older than the window: only for the quote
  const missingParents = [...new Set(rows.map((r) => r.replyToId).filter((id): id is string => !!id && !ids.includes(id)))];
  const parents = missingParents.length
    ? await db
        .select(commentCols)
        .from(comments)
        .innerJoin(user, eq(user.id, comments.userId))
        .where(inArray(comments.id, missingParents))
    : [];
  const reacts = ids.length
    ? await db
        .select({ emoji: reactions.emoji, userId: reactions.userId, commentId: reactions.commentId })
        .from(reactions)
        .where(and(inArray(reactions.commentId, ids), isNotNull(reactions.commentId)))
    : [];
  const byId = new Map([...rows, ...parents].map((r) => [r.id, r]));

  // a deleted message is only kept as a placeholder if someone replied to it
  const repliedTo = new Set(rows.filter((r) => !r.deletedAt && r.replyToId).map((r) => r.replyToId));
  const visible = rows.filter((r) => !r.deletedAt || repliedTo.has(r.id));

  return visible.map((r) => {
    const parent = r.replyToId ? byId.get(r.replyToId) : undefined;
    return {
      id: r.id,
      body: r.deletedAt ? "" : r.body, // never send deleted content to clients
      createdAt: r.createdAt.toISOString(),
      deleted: !!r.deletedAt,
      replyTo: parent
        ? { id: parent.id, author: parent.authorName, body: parent.deletedAt ? "Message supprimé" : parent.body.slice(0, 80) }
        : null,
      author: { id: r.authorId, name: r.authorName, avatarFileId: r.authorAvatar },
      reactions: summarize(reacts.filter((x) => x.commentId === r.id), viewerId),
      canDelete: !r.deletedAt && (r.authorId === viewerId || viewerIsMod),
    };
  });
}
