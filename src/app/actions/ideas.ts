"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isModerator, requireActiveUser, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, runAction } from "@/lib/errors";
import { catchUpDaily } from "@/server/rounds/catch-up";
import { createIdea, editIdea, removeIdea, reviewIdea } from "@/server/ideas";

const reviewDecision = z.enum(["approved", "rejected"]);
/** the exact text the moderator saw (not trimmed: compared as stored) */
const reviewedText = z.object({ title: z.string().max(120), description: z.string().max(500).nullable() });

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
    const status = await createIdea({ id: u.id, isModerator: isModerator(u) }, { title: parsed.data.title, description: parsed.data.description || null });
    revalidatePath("/ideas");
    if (status === "pending") revalidatePath("/mod");
    else {
      revalidatePath("/"); // bank counter
      await catchUpDaily(u.id, "idea");
    }
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
    const { status, previous } = await editIdea(actor, ideaId.data, { title: parsed.data.title, description: parsed.data.description || null });
    await audit(actor.id, "idea.update", "idea", ideaId.data, { ...parsed.data, from: previous, to: status });
    revalidateIdeas();
    // the idea entered or left the bank: board counter (and maybe the missing daily)
    if (status !== previous && (status === "approved" || previous === "approved")) revalidatePath("/");
    if (status === "approved" && previous !== "approved") await catchUpDaily(actor.id, "idea");
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
export async function reviewIdeaAction(id: string, decision: "approved" | "rejected", seen: { title: string; description: string | null }) {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const ideaId = z.string().uuid().safeParse(id);
    const parsed = reviewDecision.safeParse(decision);
    const text = reviewedText.safeParse(seen);
    if (!ideaId.success || !parsed.success || !text.success) throw badRequest();
    const idea = await reviewIdea(ideaId.data, parsed.data, text.data);
    await audit(mod.id, parsed.data === "approved" ? "idea.approve" : "idea.reject", "idea", ideaId.data, { title: idea.title });
    revalidateIdeas();
    if (parsed.data === "approved") {
      revalidatePath("/");
      await catchUpDaily(mod.id, "review");
    }
  });
}
