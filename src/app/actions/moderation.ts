"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAdmin, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound, runAction } from "@/lib/errors";
import { syncTodayTargets } from "@/server/rounds/targets";

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
    if (status === "active" && !target.avatarFileId) throw badRequest("Ce membre n'a pas encore de photo de profil");

    await db.transaction(async (tx) => {
      await tx.update(user).set({ status, ...(status === "rejected" ? { role: "member" as const } : {}) }).where(eq(user.id, target.id));
      // Refused / banned: kill all sessions right away
      if (status === "rejected") await tx.delete(session).where(eq(session.userId, target.id));
      await audit(mod.id, status === "active" ? "user.approve" : "user.reject", "user", target.id, { previous: target.status }, tx);
    });
    // New member joins today's tier list right away (existing answers are kept)
    if (status === "active") await syncTodayTargets();
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
