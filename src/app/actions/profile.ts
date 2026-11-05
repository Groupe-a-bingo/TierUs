"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { badRequest, runAction } from "@/lib/errors";

const nameSchema = z.string().trim().min(2, "Pseudo trop court").max(32, "32 caractères max");

export async function updateName(name: string) {
  return runAction(async () => {
    const u = await requireUser(); // pending users can fix their name too
    await rateLimit("profile", u.id);
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message);
    await db.update(schema.user).set({ name: parsed.data, updatedAt: new Date() }).where(eq(schema.user.id, u.id));
    revalidatePath("/", "layout");
  });
}
