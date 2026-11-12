import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { badRequest, forbidden, notFound } from "@/lib/errors";

type Actor = { id: string; isModerator: boolean };
export type IdeaInput = { title: string; description: string | null };

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

export async function editIdea(actor: Actor, ideaId: string, input: IdeaInput) {
  await editableIdea(actor, ideaId, "modifiée");
  const res = await db
    .update(schema.ideas)
    .set({ title: input.title, description: input.description })
    .where(stillEditable(actor, ideaId))
    .returning({ id: schema.ideas.id });
  // drawn between the check and the update
  if (!res.length) throw badRequest("Cette idée a déjà été jouée, elle ne peut plus être modifiée");
}

export async function removeIdea(actor: Actor, ideaId: string) {
  await editableIdea(actor, ideaId, "supprimée");
  const res = await db.delete(schema.ideas).where(stillEditable(actor, ideaId)).returning({ title: schema.ideas.title });
  if (!res.length) throw badRequest("Cette idée a déjà été jouée, elle ne peut plus être supprimée");
  return res[0];
}
