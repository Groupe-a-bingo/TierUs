import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CommentView } from "@/components/board/comments";
import type { ReactionSummary } from "@/components/board/reaction-bar";

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

export async function getComments(roundId: string, viewerId: string, viewerIsMod: boolean): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      deletedAt: comments.deletedAt,
      replyToId: comments.replyToId,
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatarFileId,
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.userId))
    .where(eq(comments.roundId, roundId))
    .orderBy(asc(comments.createdAt))
    .limit(500);

  const ids = rows.map((r) => r.id);
  const reacts = ids.length
    ? await db
        .select({ emoji: reactions.emoji, userId: reactions.userId, commentId: reactions.commentId })
        .from(reactions)
        .where(and(inArray(reactions.commentId, ids), isNotNull(reactions.commentId)))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  return rows.map((r) => {
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
