import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const IDEA_VALIDATION = "idea_validation";

/** Idea validation: new ideas from members wait for a moderator before entering the bank. Off by default. */
export async function getIdeaValidation(tx: Tx | typeof db = db): Promise<boolean> {
  const [row] = await tx.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, IDEA_VALIDATION)).limit(1);
  return row?.value === true;
}

/**
 * Turning validation off approves every idea still waiting: nobody would
 * review them anymore, so they'd stay stuck out of the bank forever.
 * Returns how many pending ideas were approved.
 */
export async function setIdeaValidation(enabled: boolean, actorId: string): Promise<{ approved: number }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(schema.appSettings)
      .values({ key: IDEA_VALIDATION, value: enabled })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: enabled, updatedAt: new Date() } });
    let approved = 0;
    if (!enabled) {
      const rows = await tx
        .update(schema.ideas)
        .set({ status: "approved" })
        .where(eq(schema.ideas.status, "pending"))
        .returning({ id: schema.ideas.id });
      approved = rows.length;
    }
    await audit(actorId, "settings.idea_validation", "settings", IDEA_VALIDATION, { enabled, approved }, tx);
    return { approved };
  });
}
