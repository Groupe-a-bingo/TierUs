"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireActiveUser, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, notFound, runAction } from "@/lib/errors";

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
  });
}

export async function updateIdea(id: string, input: { title: string; description?: string }) {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const parsed = ideaSchema.safeParse(input);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message);
    const res = await db
      .update(schema.ideas)
      .set({ title: parsed.data.title, description: parsed.data.description || null })
      .where(eq(schema.ideas.id, z.string().uuid().parse(id)))
      .returning({ id: schema.ideas.id });
    if (!res.length) throw notFound();
    await audit(mod.id, "idea.update", "idea", id, parsed.data);
    revalidatePath("/mod");
  });
}

export async function deleteIdea(id: string) {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const ideaId = z.string().uuid().parse(id);
    const [used] = await db.select({ id: schema.rounds.id }).from(schema.rounds).where(eq(schema.rounds.ideaId, ideaId)).limit(1);
    if (used) throw badRequest("Cette idée a déjà été jouée, impossible de la supprimer");
    const res = await db.delete(schema.ideas).where(eq(schema.ideas.id, ideaId)).returning({ title: schema.ideas.title });
    if (!res.length) throw notFound();
    await audit(mod.id, "idea.delete", "idea", ideaId, { title: res[0].title });
    revalidatePath("/mod");
  });
}
