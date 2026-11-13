"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { guard } from "@/lib/guard";
import { parseInput, runAction } from "@/lib/errors";
import { nameSchema } from "@/lib/names";

export async function updateName(name: string) {
  return runAction(async () => {
    const u = await guard("user", "profile"); // pending users can fix their name too
    await db.update(schema.user).set({ name: parseInput(nameSchema, name), updatedAt: new Date() }).where(eq(schema.user.id, u.id));
    revalidatePath("/", "layout");
  });
}
