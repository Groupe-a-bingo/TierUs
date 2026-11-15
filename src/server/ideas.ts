import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { IdeaStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { getIdeaValidation } from "@/server/settings";
import { newIdeaStatus, statusAfterEdit, type IdeaActor } from "@/lib/idea-rules";

type Actor = IdeaActor;
export type IdeaInput = { title: string; description: string | null };

/** In the bank: approved and never played. The only definition of "drawable" (draws, re-rolls, bank counters). */
export const availableIdea = () => and(isNull(schema.ideas.usedAt), eq(schema.ideas.status, "approved"));

/** Ideas matching `where` (the bank by default). */
export async function countIdeas(where = availableIdea()): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.ideas).where(where);
  return r?.n ?? 0;
}
export const countBank = () => countIdeas();

/**
 * Lock order, everywhere an idea is written: the idea_validation setting
 * first (share lock, see getIdeaValidation), then the idea row. Turning
 * validation off takes the setting FOR UPDATE and then updates ideas: same
 * order, so the two can't deadlock.
 */
async function lockValidation(actor: Actor, tx: Tx): Promise<boolean> {
  // moderators skip the queue: no need to wait for the setting
  return actor.isModerator ? false : getIdeaValidation(tx, { lock: true });
}

export async function createIdea(actor: Actor, input: IdeaInput): Promise<IdeaStatus> {
  return db.transaction(async (tx) => {
    const status = newIdeaStatus(actor, await lockValidation(actor, tx));
    await tx.insert(schema.ideas).values({ title: input.title, description: input.description, authorId: actor.id, status });
    return status;
  });
}

/**
 * Who may change an idea: its author or a moderator, and only while it has
 * never been played (a played idea belongs to the tier list's history; every
 * tier list's idea has used_at set). Locks the row for the rest of the transaction.
 */
async function lockEditableIdea(tx: Tx, actor: Actor, ideaId: string, verb: "modifiée" | "supprimée") {
  const [idea] = await tx
    .select({ authorId: schema.ideas.authorId, status: schema.ideas.status, usedAt: schema.ideas.usedAt, title: schema.ideas.title })
    .from(schema.ideas)
    .where(eq(schema.ideas.id, ideaId))
    .for("update")
    .limit(1);
  if (!idea) throw notFound("Idée introuvable");
  if (!actor.isModerator && idea.authorId !== actor.id) throw forbidden("Ce n'est pas ton idée");
  if (idea.usedAt) throw badRequest(`Cette idée a déjà été jouée, elle ne peut plus être ${verb}`);
  return idea;
}

/** Returns the status before and after, so callers know whether the idea just entered the bank. */
export async function editIdea(actor: Actor, ideaId: string, input: IdeaInput): Promise<{ status: IdeaStatus; previous: IdeaStatus }> {
  return db.transaction(async (tx) => {
    const validation = await lockValidation(actor, tx);
    const idea = await lockEditableIdea(tx, actor, ideaId, "modifiée");
    const status = statusAfterEdit(actor, idea, validation);
    await tx.update(schema.ideas).set({ title: input.title, description: input.description, status }).where(eq(schema.ideas.id, ideaId));
    await audit(actor.id, "idea.update", "idea", ideaId, { ...input, from: idea.status, to: status }, tx);
    return { status, previous: idea.status };
  });
}

/**
 * Moderator decision on an idea waiting for validation. A refused idea can
 * still be put back in the bank later (moderator changing their mind).
 * `seen` is the text the moderator reviewed: if the author edited the idea
 * since, nothing happens (otherwise unseen wording could be approved).
 */
export async function reviewIdea(ideaId: string, decision: "approved" | "rejected", seen: IdeaInput, actorId: string | null = null) {
  const from: IdeaStatus[] = decision === "approved" ? ["pending", "rejected"] : ["pending"];
  return db.transaction(async (tx) => {
    const res = await tx
      .update(schema.ideas)
      .set({ status: decision })
      .where(
        and(
          eq(schema.ideas.id, ideaId),
          inArray(schema.ideas.status, from),
          isNull(schema.ideas.usedAt),
          eq(schema.ideas.title, seen.title),
          sql`${schema.ideas.description} is not distinct from ${seen.description}`,
        ),
      )
      .returning({ title: schema.ideas.title });
    if (res.length) {
      await audit(actorId, decision === "approved" ? "idea.approve" : "idea.reject", "idea", ideaId, { title: res[0].title }, tx);
      return res[0];
    }
    const [idea] = await tx.select().from(schema.ideas).where(eq(schema.ideas.id, ideaId)).limit(1);
    if (!idea) throw notFound("Idée introuvable");
    if (from.includes(idea.status) && !idea.usedAt) throw badRequest("Cette idée vient d'être modifiée : relis-la avant de décider");
    throw badRequest("Cette idée a déjà été traitée");
  });
}

/**
 * Moderator sends a bank or refused idea back to the ones waiting for
 * validation (a bank idea leaves the draw). Returns the previous status.
 */
export async function requeueIdea(ideaId: string, actorId: string): Promise<{ title: string; previous: IdeaStatus }> {
  return db.transaction(async (tx) => {
    const [idea] = await tx
      .select({ title: schema.ideas.title, status: schema.ideas.status, usedAt: schema.ideas.usedAt })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId))
      .for("update");
    if (!idea) throw notFound("Idée introuvable");
    if (idea.usedAt) throw badRequest("Cette idée a déjà été jouée");
    if (idea.status === "pending") throw badRequest("Cette idée est déjà en validation");
    await tx.update(schema.ideas).set({ status: "pending" }).where(eq(schema.ideas.id, ideaId));
    await audit(actorId, "idea.requeue", "idea", ideaId, { title: idea.title, from: idea.status }, tx);
    return { title: idea.title, previous: idea.status };
  });
}

/** Returns the removed idea's previous status (did the bank shrink?). */
export async function removeIdea(actor: Actor, ideaId: string): Promise<{ title: string; status: IdeaStatus }> {
  return db.transaction(async (tx) => {
    const idea = await lockEditableIdea(tx, actor, ideaId, "supprimée");
    await tx.delete(schema.ideas).where(eq(schema.ideas.id, ideaId));
    await audit(actor.id, "idea.delete", "idea", ideaId, { title: idea.title }, tx);
    return { title: idea.title, status: idea.status };
  });
}
