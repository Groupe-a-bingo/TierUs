import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { IdeaStatus } from "@/db/schema";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { getIdeaValidation } from "@/server/settings";

type Actor = { id: string; isModerator: boolean };
export type IdeaInput = { title: string; description: string | null };

/** In the bank: approved and never played. The only definition of "drawable" (draws, re-rolls, bank counters). */
export const availableIdea = () => and(isNull(schema.ideas.usedAt), eq(schema.ideas.status, "approved"));

/**
 * Status of a new (or member-edited) idea: members go through the moderators'
 * queue while validation is on. Called inside the transaction that writes the
 * idea, with the setting share-locked (see getIdeaValidation).
 */
async function newIdeaStatus(actor: Actor, tx: Tx): Promise<IdeaStatus> {
  if (actor.isModerator) return "approved";
  return (await getIdeaValidation(tx, { lock: true })) ? "pending" : "approved";
}

export async function createIdea(actor: Actor, input: IdeaInput): Promise<IdeaStatus> {
  return db.transaction(async (tx) => {
    const status = await newIdeaStatus(actor, tx);
    await tx.insert(schema.ideas).values({ title: input.title, description: input.description, authorId: actor.id, status });
    return status;
  });
}

/**
 * Who may change an idea: its author or a moderator, and only while it has
 * never been played (a played idea belongs to the tier list's history).
 */
async function editableIdea(actor: Actor, ideaId: string, verb: "modifiée" | "supprimée") {
  const [idea] = await db
    .select({ authorId: schema.ideas.authorId, usedAt: schema.ideas.usedAt })
    .from(schema.ideas)
    .where(eq(schema.ideas.id, ideaId))
    .limit(1);
  if (!idea) throw notFound();
  if (!actor.isModerator && idea.authorId !== actor.id) throw forbidden("Ce n'est pas ton idée");
  if (idea.usedAt) throw badRequest(`Cette idée a déjà été jouée, elle ne peut plus être ${verb}`);
  const [played] = await db.select({ id: schema.rounds.id }).from(schema.rounds).where(eq(schema.rounds.ideaId, ideaId)).limit(1);
  if (played) throw badRequest(`Cette idée a déjà été jouée, elle ne peut plus être ${verb}`);
}

/** Only touches an idea that is still unplayed (and still the actor's, for members). */
const stillEditable = (actor: Actor, ideaId: string) =>
  and(eq(schema.ideas.id, ideaId), isNull(schema.ideas.usedAt), actor.isModerator ? undefined : eq(schema.ideas.authorId, actor.id));

/**
 * A member's edit goes back through validation (otherwise editing an approved
 * idea would bypass it); a refused idea, once corrected, is reviewed again.
 * With validation off it lands straight in the bank. A moderator's edit keeps the status.
 */
export async function editIdea(actor: Actor, ideaId: string, input: IdeaInput): Promise<IdeaStatus> {
  await editableIdea(actor, ideaId, "modifiée");
  return db.transaction(async (tx) => {
    const status = actor.isModerator ? undefined : await newIdeaStatus(actor, tx);
    const res = await tx
      .update(schema.ideas)
      .set({ title: input.title, description: input.description, ...(status && { status }) })
      .where(stillEditable(actor, ideaId))
      .returning({ status: schema.ideas.status });
    // drawn between the check and the update
    if (!res.length) throw badRequest("Cette idée a déjà été jouée, elle ne peut plus être modifiée");
    return res[0].status;
  });
}

/**
 * Moderator decision on an idea waiting for validation. A refused idea can
 * still be put back in the bank later (moderator changing their mind).
 */
export async function reviewIdea(ideaId: string, decision: "approved" | "rejected") {
  const from: IdeaStatus[] = decision === "approved" ? ["pending", "rejected"] : ["pending"];
  const res = await db
    .update(schema.ideas)
    .set({ status: decision })
    .where(and(eq(schema.ideas.id, ideaId), inArray(schema.ideas.status, from), isNull(schema.ideas.usedAt)))
    .returning({ title: schema.ideas.title });
  if (res.length) return res[0];
  const [idea] = await db.select({ id: schema.ideas.id }).from(schema.ideas).where(eq(schema.ideas.id, ideaId)).limit(1);
  if (!idea) throw notFound("Idée introuvable");
  throw badRequest("Cette idée a déjà été traitée");
}

export async function removeIdea(actor: Actor, ideaId: string) {
  await editableIdea(actor, ideaId, "supprimée");
  const res = await db.delete(schema.ideas).where(stillEditable(actor, ideaId)).returning({ title: schema.ideas.title });
  if (!res.length) throw badRequest("Cette idée a déjà été jouée, elle ne peut plus être supprimée");
  return res[0];
}
