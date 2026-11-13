"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { isModerator, requireActiveUser, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, runAction } from "@/lib/errors";
import { catchUpDaily } from "@/server/rounds/catch-up";
import { editIdea, newIdeaStatus, removeIdea, reviewIdea } from "@/server/ideas";

const ideaSchema = z.object({
  title: z.string().trim().min(3, "Titre trop court").max(120, "120 caractères max"),
  description: z.string().trim().max(500, "500 caractères max").optional().default(""),
});

export async function addIdea(input: { title: string; description?: string }) {
  return runAction(async () => {
    const u = await requireActiveUser();
    await rateLimit("idea", u.id);
    const parsed = ideaSchema.safeParse(input);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message);
    const status = await newIdeaStatus({ id: u.id, isModerator: isModerator(u) });
    await db.insert(schema.ideas).values({
      title: parsed.data.title,
      description: parsed.data.description || null,
      authorId: u.id,
      status,
    });
    revalidatePath("/ideas");
    if (status === "pending") revalidatePath("/mod");
    else await catchUpDaily(u.id, "idea");
    return { status };
  });
}

/** Author or moderator, while the idea has never been played. */
async function ideaActor() {
  const u = await requireActiveUser();
  const mod = isModerator(u);
  await rateLimit(mod ? "modAction" : "ideaEdit", u.id);
  return { id: u.id, isModerator: mod };
}

function revalidateIdeas() {
  revalidatePath("/ideas");
  revalidatePath("/mod");
}

export async function updateIdea(id: string, input: { title: string; description?: string }) {
  return runAction(async () => {
    const actor = await ideaActor();
    const parsed = ideaSchema.safeParse(input);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message);
    const ideaId = z.string().uuid().safeParse(id);
    if (!ideaId.success) throw badRequest();
    const status = await editIdea(actor, ideaId.data, { title: parsed.data.title, description: parsed.data.description || null });
    await audit(actor.id, "idea.update", "idea", ideaId.data, { ...parsed.data, status });
    revalidateIdeas();
    return { status };
  });
}

export async function deleteIdea(id: string) {
  return runAction(async () => {
    const actor = await ideaActor();
    const ideaId = z.string().uuid().safeParse(id);
    if (!ideaId.success) throw badRequest();
    const removed = await removeIdea(actor, ideaId.data);
    await audit(actor.id, "idea.delete", "idea", ideaId.data, { title: removed.title });
    revalidateIdeas();
  });
}

/** Moderators approve or refuse an idea waiting for validation. */
export async function reviewIdeaAction(id: string, decision: "approved" | "rejected") {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const ideaId = z.string().uuid().safeParse(id);
    if (!ideaId.success || !["approved", "rejected"].includes(decision)) throw badRequest();
    const idea = await reviewIdea(ideaId.data, decision);
    await audit(mod.id, decision === "approved" ? "idea.approve" : "idea.reject", "idea", ideaId.data, { title: idea.title });
    revalidateIdeas();
    if (decision === "approved") await catchUpDaily(mod.id, "review");
  });
}
