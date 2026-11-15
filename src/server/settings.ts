import "server-only";
import { eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { DAILY_DRAW_HOUR } from "@/lib/dates";

const IDEA_VALIDATION = "idea_validation";
const DRAW_HOUR = "daily_draw_hour";

/** Local hour (APP_TZ) of the automatic daily draw, 0–23. DAILY_DRAW_HOUR until an admin changes it. */
export async function getDrawHour(tx: Tx | typeof db = db): Promise<number> {
  const [row] = await tx.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, DRAW_HOUR)).limit(1);
  const h = row?.value;
  return typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23 ? h : DAILY_DRAW_HOUR;
}

/** Admins: move the daily draw. Rejects a no-op (the admin's page was stale). */
export async function setDrawHour(hour: number, actorId: string): Promise<void> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw badRequest("Heure invalide");
  await db.transaction(async (tx) => {
    await tx.insert(schema.appSettings).values({ key: DRAW_HOUR, value: DAILY_DRAW_HOUR }).onConflictDoNothing();
    const [row] = await tx.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, DRAW_HOUR)).for("update").limit(1);
    if (row?.value === hour) throw badRequest(`Le tirage est déjà à ${hour} h`);
    await tx.update(schema.appSettings).set({ value: hour, updatedAt: new Date() }).where(eq(schema.appSettings.key, DRAW_HOUR));
    await audit(actorId, "settings.draw_hour", "settings", DRAW_HOUR, { from: row?.value ?? DAILY_DRAW_HOUR, to: hour }, tx);
  });
}

/**
 * Idea validation: new ideas from members wait for a moderator before entering the bank. Off by default.
 * `lock` (inside a transaction that writes an idea) takes a share lock on the
 * setting: turning validation off waits for that write, then releases it with
 * the other pending ideas, so no idea can be left pending once it's off.
 */
export async function getIdeaValidation(tx: Tx | typeof db = db, { lock = false } = {}): Promise<boolean> {
  const q = tx.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, IDEA_VALIDATION)).limit(1);
  const [row] = lock ? await q.for("share") : await q;
  return row?.value === true;
}

/**
 * Turning validation off approves every idea still waiting: nobody would
 * review them anymore, so they'd stay stuck out of the bank forever.
 * Rejects a no-op (the admin's page was stale: someone already changed it).
 * Returns how many pending ideas were approved.
 */
export async function setIdeaValidation(enabled: boolean, actorId: string): Promise<{ approved: number }> {
  return db.transaction(async (tx) => {
    // make sure the row exists so FOR UPDATE has something to lock: two admins
    // switching it for the first time at once then run one after the other
    await tx.insert(schema.appSettings).values({ key: IDEA_VALIDATION, value: false }).onConflictDoNothing();
    const [row] = await tx
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, IDEA_VALIDATION))
      .for("update")
      .limit(1);
    if ((row?.value === true) === enabled) throw badRequest(`La validation est déjà ${enabled ? "activée" : "désactivée"}`);

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
