import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
 * Status after an edit:
 * - a refused idea goes back to the queue only when its author fixes it
 *   (a moderator author's idea skips the queue, as when they propose one);
 *   anyone else's edit (a moderator's) leaves it refused;
 * - otherwise a member's edit goes back through validation while it's on
 *   (editing an approved idea must not bypass it), and a moderator's edit
 *   keeps the status.
 */
async function statusAfterEdit(actor: Actor, idea: { authorId: string | null; status: IdeaStatus }, tx: Tx): Promise<IdeaStatus> {
  if (idea.status === "rejected") {
    if (idea.authorId !== actor.id) return "rejected";
    return actor.isModerator ? "approved" : "pending";
  }
  return actor.isModerator ? idea.status : newIdeaStatus(actor, tx);
}

/** Returns the status before and after, so callers know whether the idea just entered the bank. */
export async function editIdea(actor: Actor, ideaId: string, input: IdeaInput): Promise<{ status: IdeaStatus; previous: IdeaStatus }> {
  await editableIdea(actor, ideaId, "modifiée");
  return db.transaction(async (tx) => {
    const [idea] = await tx
      .select({ authorId: schema.ideas.authorId, status: schema.ideas.status })
      .from(schema.ideas)
      .where(stillEditable(actor, ideaId))
      .for("update")
      .limit(1);
    // drawn (or deleted) between the check and the update
    if (!idea) throw badRequest("Cette idée a déjà été jouée, elle ne peut plus être modifiée");
    const status = await statusAfterEdit(actor, idea, tx);
    await tx.update(schema.ideas).set({ title: input.title, description: input.description, status }).where(eq(schema.ideas.id, ideaId));
    return { status, previous: idea.status };
  });
}

/**
 * Moderator decision on an idea waiting for validation. A refused idea can
 * still be put back in the bank later (moderator changing their mind).
 * `seen` is the text the moderator reviewed: if the author edited the idea
 * since, nothing happens (otherwise unseen wording could be approved).
 */
export async function reviewIdea(ideaId: string, decision: "approved" | "rejected", seen: IdeaInput) {
  const from: IdeaStatus[] = decision === "approved" ? ["pending", "rejected"] : ["pending"];
  const res = await db
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
  if (res.length) return res[0];
  const [idea] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, ideaId)).limit(1);
  if (!idea) throw notFound("Idée introuvable");
  if (from.includes(idea.status) && !idea.usedAt) throw badRequest("Cette idée vient d'être modifiée : relis-la avant de décider");
  throw badRequest("Cette idée a déjà été traitée");
}

export async function removeIdea(actor: Actor, ideaId: string) {
  await editableIdea(actor, ideaId, "supprimée");
  const res = await db.delete(schema.ideas).where(stillEditable(actor, ideaId)).returning({ title: schema.ideas.title });
  if (!res.length) throw badRequest("Cette idée a déjà été jouée, elle ne peut plus être supprimée");
  return res[0];
}
