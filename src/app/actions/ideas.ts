"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { isModerator, requireActiveUser } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, runAction } from "@/lib/errors";
import { drawDaily } from "@/server/rounds/draw";
import { editIdea, removeIdea } from "@/server/ideas";

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
    await db.insert(schema.ideas).values({
      title: parsed.data.title,
      description: parsed.data.description || null,
      authorId: u.id,
    });
    revalidatePath("/ideas");
    // The bank was empty at 08:00? This idea triggers the missing daily draw.
    // Idempotent: nothing happens when today's daily already exists.
    try {
      const res = await drawDaily();
      if (res.status === "created") {
        await audit(u.id, "round.draw", "round", res.roundId, { trigger: "idea" });
        revalidatePath("/", "layout");
      }
    } catch (err) {
      // the idea is saved either way; the worker's catch-up tick will retry
      console.error("[draw] catch-up after new idea failed", err);
    }
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
    await editIdea(actor, ideaId.data, { title: parsed.data.title, description: parsed.data.description || null });
    await audit(actor.id, "idea.update", "idea", ideaId.data, parsed.data);
    revalidateIdeas();
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
