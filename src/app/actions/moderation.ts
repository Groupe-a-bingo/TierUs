"use server";

import { z } from "zod";
import { eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAdmin, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound, runAction } from "@/lib/errors";
import { syncTodayTargets } from "@/server/rounds/targets";
import { revealIfAllPlayed } from "@/server/rounds/reveal";

const { user, session } = schema;
const userId = z.string().min(1).max(64);

async function loadTarget(id: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId.parse(id))).limit(1);
  if (!u) throw notFound("Utilisateur introuvable");
  return u;
}

export async function setUserStatus(id: string, status: "active" | "rejected") {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    if (!["active", "rejected"].includes(status)) throw badRequest();
    const target = await loadTarget(id);
    if (target.id === mod.id) throw badRequest("Tu ne peux pas changer ton propre statut");
    if (target.role === "admin") throw forbidden("Impossible de modifier un admin");
    if (target.role === "moderator" && mod.role !== "admin") throw forbidden("Seul un admin peut gérer un modérateur");

    await db.transaction(async (tx) => {
      await tx.update(user).set({ status, ...(status === "rejected" ? { role: "member" as const } : {}) }).where(eq(user.id, target.id));
      if (status === "rejected") {
        // Refused / banned: kill all sessions right away…
        await tx.delete(session).where(eq(session.userId, target.id));
        // …and drop them from rounds still open, so they don't block the reveal
        await tx.execute(sql`
          delete from ${schema.roundTargets} rt using ${schema.rounds} r
          where rt.round_id = r.id and r.revealed_at is null and rt.user_id = ${target.id}
        `);
      }
      await audit(mod.id, status === "active" ? "user.approve" : "user.reject", "user", target.id, { previous: target.status }, tx);
    });
    // New member joins today's tier list right away (existing answers are kept)
    if (status === "active") await syncTodayTargets();
    // A removed member may have been the last one everybody was waiting for
    if (status === "rejected") {
      const open = await db.select({ id: schema.rounds.id }).from(schema.rounds).where(isNull(schema.rounds.revealedAt));
      for (const r of open) await revealIfAllPlayed(r.id);
    }
    revalidatePath("/mod");
    revalidatePath("/", "layout");
  });
}

export async function setUserRole(id: string, role: "member" | "moderator") {
  return runAction(async () => {
    const admin = await requireAdmin();
    await rateLimit("modAction", admin.id);
    if (!["member", "moderator"].includes(role)) throw badRequest();
    const target = await loadTarget(id);
    if (target.role === "admin") throw forbidden("Impossible de modifier un admin");
    if (target.status !== "active") throw badRequest("Le membre doit être validé");
    await db.update(user).set({ role }).where(eq(user.id, target.id));
    await audit(admin.id, "user.role", "user", target.id, { from: target.role, to: role });
    revalidatePath("/mod");
  });
}
