"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isModerator } from "@/lib/permissions";
import { guard } from "@/lib/guard";
import { parseInput, runAction } from "@/lib/errors";
import { IDEA_DESCRIPTION_MAX, IDEA_TITLE_MAX, IDEA_TITLE_MIN } from "@/lib/limits";
import { catchUpDaily } from "@/server/rounds/catch-up";
import { createIdea, editIdea, removeIdea, reviewIdea, requeueIdea } from "@/server/ideas";

const ideaId = z.string().uuid();
const ideaSchema = z.object({
  title: z.string().trim().min(IDEA_TITLE_MIN, "Titre trop court").max(IDEA_TITLE_MAX, `${IDEA_TITLE_MAX} caractères max`),
  description: z
    .string()
    .trim()
    .max(IDEA_DESCRIPTION_MAX, `${IDEA_DESCRIPTION_MAX} caractères max`)
    .optional()
    .transform((d) => d || null),
});
const reviewSchema = z.object({
  id: ideaId,
  decision: z.enum(["approved", "rejected"]),
  /** the exact text the moderator saw (not trimmed: compared as stored) */
  seen: z.object({ title: z.string().max(IDEA_TITLE_MAX), description: z.string().max(IDEA_DESCRIPTION_MAX).nullable() }),
});

/** An idea entered the bank: home counter, and maybe the daily that was missing. */
async function bankGrew(actorId: string, trigger: "idea" | "review") {
  revalidatePath("/");
  await catchUpDaily(actorId, trigger);
}

function revalidateIdeas() {
  revalidatePath("/ideas");
  revalidatePath("/mod");
}

export async function addIdea(input: { title: string; description?: string }) {
  return runAction(async () => {
    const u = await guard("active", "idea");
    const idea = parseInput(ideaSchema, input);
    const status = await createIdea({ id: u.id, isModerator: isModerator(u) }, idea);
    revalidateIdeas();
    if (status === "approved") await bankGrew(u.id, "idea");
    return { status };
  });
}

/** Author or moderator, while the idea has never been played (moderators on the moderator quota, e.g. cleaning the bank). */
async function ideaActor() {
  const u = await guard("active", (u) => (isModerator(u) ? "modAction" : "ideaEdit"));
  return { id: u.id, isModerator: isModerator(u) };
}

export async function updateIdea(id: string, input: { title: string; description?: string }) {
  return runAction(async () => {
    const actor = await ideaActor();
    const idea = parseInput(ideaSchema, input);
    const { status, previous } = await editIdea(actor, parseInput(ideaId, id), idea);
    revalidateIdeas();
    if (status === "approved" && previous !== "approved") await bankGrew(actor.id, "idea");
    else if (previous === "approved" && status !== "approved") revalidatePath("/");
    return { status };
  });
}

export async function deleteIdea(id: string) {
  return runAction(async () => {
    const actor = await ideaActor();
    const removed = await removeIdea(actor, parseInput(ideaId, id));
    revalidateIdeas();
    if (removed.status === "approved") revalidatePath("/"); // bank counter
  });
}

/** Moderators approve or refuse an idea waiting for validation. */
export async function reviewIdeaAction(id: string, decision: "approved" | "rejected", seen: { title: string; description: string | null }) {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    const input = parseInput(reviewSchema, { id, decision, seen });
    await reviewIdea(input.id, input.decision, input.seen, mod.id);
    revalidateIdeas();
    if (input.decision === "approved") await bankGrew(mod.id, "review");
  });
}

/** Moderators send a bank or refused idea back to validation (a bank one leaves the draw until approved again). */
export async function requeueIdeaAction(id: string) {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    const { previous } = await requeueIdea(parseInput(ideaId, id), mod.id);
    revalidateIdeas();
    if (previous === "approved") revalidatePath("/"); // bank counter
  });
}
