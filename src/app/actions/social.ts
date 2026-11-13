"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { isModerator } from "@/lib/permissions";
import { guard } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound, parseInput, runAction } from "@/lib/errors";
import { COMMENT_MAX } from "@/lib/limits";
import { REACTION_EMOJIS } from "@/lib/reactions";
import { getRoundById, hasSubmitted } from "@/server/rounds/queries";

const { comments, reactions } = schema;

/** The discussion is part of the results: only members who answered take part. */
async function assertAnswered(roundId: string, userId: string) {
  if (!(await getRoundById(roundId))) throw notFound("Tier list introuvable");
  if (!(await hasSubmitted(roundId, userId))) throw forbidden("Réponds d'abord à la tier list");
}

/** A live (not deleted) message of this tier list. */
async function liveComment(id: string, roundId: string) {
  const [c] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.id, id), eq(comments.roundId, roundId), isNull(comments.deletedAt)))
    .limit(1);
  return c ?? null;
}

const commentSchema = z.object({
  roundId: z.string().uuid(),
  body: z.string().trim().min(1, "Message vide").max(COMMENT_MAX, `${COMMENT_MAX} caractères max`),
  replyToId: z.string().uuid().optional(),
});

export async function addComment(input: z.input<typeof commentSchema>) {
  return runAction(async () => {
    const u = await guard("active", "comment");
    const { roundId, body, replyToId } = parseInput(commentSchema, input);
    await assertAnswered(roundId, u.id);
    if (replyToId && !(await liveComment(replyToId, roundId))) throw badRequest("Message d'origine introuvable");
    await db.insert(comments).values({ roundId, userId: u.id, body, replyToId: replyToId ?? null });
    revalidatePath(`/r/${roundId}`);
  });
}

/**
 * Soft delete: the text is never sent to clients again, but kept in the
 * database as moderation evidence (a moderator removing an insult).
 */
export async function deleteComment(commentId: string) {
  return runAction(async () => {
    const u = await guard("active", "commentDelete");
    const id = parseInput(z.string().uuid(), commentId);
    const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    if (!c || c.deletedAt) throw notFound();
    const mod = isModerator(u);
    if (c.userId !== u.id && !mod) throw forbidden();
    await db.transaction(async (tx) => {
      await tx.update(comments).set({ deletedAt: new Date() }).where(and(eq(comments.id, id), isNull(comments.deletedAt)));
      if (c.userId !== u.id) await audit(u.id, "comment.delete", "comment", id, { authorId: c.userId }, tx);
    });
    revalidatePath(`/r/${c.roundId}`);
  });
}

const reactionSchema = z.object({
  roundId: z.string().uuid(),
  commentId: z.string().uuid().optional(),
  emoji: z.enum(REACTION_EMOJIS),
  /** the state the member wants (not a toggle): repeating a click, or a stale tab, can't flip it back */
  on: z.boolean(),
});

/** Add or remove one's reaction on a post (round) or a comment. Idempotent. */
export async function setReaction(input: z.input<typeof reactionSchema>) {
  return runAction(async () => {
    const u = await guard("active", "reaction");
    const { roundId, commentId, emoji, on } = parseInput(reactionSchema, input);
    await assertAnswered(roundId, u.id);
    if (commentId && !(await liveComment(commentId, roundId))) throw notFound();
    if (on) {
      await db
        .insert(reactions)
        .values({ roundId, commentId: commentId ?? null, userId: u.id, emoji })
        .onConflictDoNothing();
    } else {
      await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.roundId, roundId),
            commentId ? eq(reactions.commentId, commentId) : isNull(reactions.commentId),
            eq(reactions.userId, u.id),
            eq(reactions.emoji, emoji),
          ),
        );
    }
    revalidatePath(`/r/${roundId}`);
  });
}
