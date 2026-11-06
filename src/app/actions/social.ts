"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { isModerator, requireActiveUser } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound, runAction } from "@/lib/errors";
import { REACTION_EMOJIS } from "@/lib/reactions";
import { hasSubmitted } from "@/server/rounds/queries";

const { comments, reactions, rounds } = schema;

async function getRoundOrThrow(roundId: string) {
  const [r] = await db.select({ id: rounds.id }).from(rounds).where(eq(rounds.id, roundId)).limit(1);
  if (!r) throw notFound("Tier list introuvable");
  return r;
}

/** The discussion is part of the results: only members who answered take part. */
async function assertAnswered(roundId: string, userId: string) {
  if (!(await hasSubmitted(roundId, userId))) throw forbidden("Réponds d'abord à la tier list");
}

const commentSchema = z.object({
  roundId: z.string().uuid(),
  body: z.string().trim().min(1, "Message vide").max(1000, "1000 caractères max"),
  replyToId: z.string().uuid().optional(),
});

export async function addComment(input: z.input<typeof commentSchema>) {
  return runAction(async () => {
    const u = await requireActiveUser();
    await rateLimit("comment", u.id);
    const parsed = commentSchema.safeParse(input);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message);
    const round = await getRoundOrThrow(parsed.data.roundId);
    await assertAnswered(round.id, u.id);
    if (parsed.data.replyToId) {
      const [parent] = await db
        .select({ id: comments.id })
        .from(comments)
        .where(and(eq(comments.id, parsed.data.replyToId), eq(comments.roundId, round.id)))
        .limit(1);
      if (!parent) throw badRequest("Message d'origine introuvable");
    }
    await db.insert(comments).values({ roundId: round.id, userId: u.id, body: parsed.data.body, replyToId: parsed.data.replyToId ?? null });
    revalidatePath(`/r/${round.id}`);
  });
}

export async function deleteComment(commentId: string) {
  return runAction(async () => {
    const u = await requireActiveUser();
    const id = z.string().uuid().parse(commentId);
    const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    if (!c || c.deletedAt) throw notFound();
    const mod = isModerator(u);
    if (c.userId !== u.id && !mod) throw forbidden();
    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, id));
    if (mod && c.userId !== u.id) await audit(u.id, "comment.delete", "comment", id, { authorId: c.userId });
    revalidatePath(`/r/${c.roundId}`);
  });
}

const reactionSchema = z.object({
  roundId: z.string().uuid(),
  commentId: z.string().uuid().optional(),
  emoji: z.enum(REACTION_EMOJIS),
});

/** Toggle a reaction on a post (round) or a comment. */
export async function toggleReaction(input: z.input<typeof reactionSchema>) {
  return runAction(async () => {
    const u = await requireActiveUser();
    await rateLimit("reaction", u.id);
    const parsed = reactionSchema.safeParse(input);
    if (!parsed.success) throw badRequest("Réaction invalide");
    const { roundId, commentId, emoji } = parsed.data;
    const round = await getRoundOrThrow(roundId);
    await assertAnswered(round.id, u.id);
    if (commentId) {
      const [c] = await db
        .select({ id: comments.id })
        .from(comments)
        .where(and(eq(comments.id, commentId), eq(comments.roundId, roundId), isNull(comments.deletedAt)))
        .limit(1);
      if (!c) throw notFound();
    }
    const where = and(
      eq(reactions.roundId, roundId),
      commentId ? eq(reactions.commentId, commentId) : isNull(reactions.commentId),
      eq(reactions.userId, u.id),
      eq(reactions.emoji, emoji),
    );
    const removed = await db.delete(reactions).where(where).returning({ id: reactions.id });
    if (!removed.length) {
      await db
        .insert(reactions)
        .values({ roundId, commentId: commentId ?? null, userId: u.id, emoji })
        .onConflictDoNothing();
    }
    // fresh counts come back in the same response (no extra refresh round-trip)
    revalidatePath(`/r/${round.id}`);
  });
}
