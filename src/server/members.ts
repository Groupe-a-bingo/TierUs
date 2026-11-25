import "server-only";
import { eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { deleteStored } from "@/lib/storage";
import { addMemberToActiveRounds, removeMemberFromActiveRounds } from "@/server/rounds/targets";
import { lockMembership } from "@/server/rounds/lock";

const { user, session } = schema;

/** Who changes a member: a moderator / admin from /mod, or null for scripts and tests (no permission checks). */
export type MemberActor = { id: string; role: "member" | "moderator" | "admin" } | null;

/** The target row, locked until the end of the transaction: checks and update see the same state. */
async function lockTarget(tx: Tx, targetId: string) {
  const [u] = await tx.select().from(user).where(eq(user.id, targetId)).for("update").limit(1);
  if (!u) throw notFound("Utilisateur introuvable");
  return u;
}

/**
 * Validate (or re-admit) / reject (or ban) a member, in one transaction:
 * - active: the member joins every tier list that is still active, so an
 *   account is never active while missing from the current tier lists.
 *   A profile photo is optional: members without one get a coloured tile;
 * - rejected: sessions are killed and the member leaves the active tier lists
 *   (their votes stop counting everywhere, see notBanned).
 * Moderators can't change themselves, an admin, or another moderator (admins can).
 */
export async function setMemberStatus(
  targetId: string,
  status: "active" | "rejected",
  actor: MemberActor,
  now?: Date,
): Promise<{ addedTo: string[] }> {
  return db.transaction(async (tx) => {
    // same lock as the draws: no tier list is created / snapshotted meanwhile
    await lockMembership(tx);
    // read the clock after waiting for the lock: a tier list that expired
    // meanwhile must not receive the newcomer
    const at = now ?? new Date();
    const target = await lockTarget(tx, targetId);
    if (actor) {
      if (target.id === actor.id) throw badRequest("Tu ne peux pas changer ton propre statut");
      if (target.role === "admin") throw forbidden("Impossible de modifier un admin");
      if (target.role === "moderator" && actor.role !== "admin") throw forbidden("Seul un admin peut gérer un modérateur");
    }
    if (target.status === status) throw badRequest(status === "active" ? "Ce membre est déjà validé" : "Ce membre est déjà refusé");

    await tx
      .update(user)
      // updated_at moves the board's live version: other members see the change
      .set({ status, updatedAt: at, ...(status === "rejected" ? { role: "member" as const } : {}) })
      .where(eq(user.id, targetId));
    let addedTo: string[] = [];
    if (status === "active") {
      addedTo = await addMemberToActiveRounds(targetId, tx, at);
    } else {
      await tx.delete(session).where(eq(session.userId, targetId));
      await removeMemberFromActiveRounds(targetId, tx, at);
    }
    await audit(actor?.id ?? null, status === "active" ? "user.approve" : "user.reject", "user", targetId, { previous: target.status }, tx);
    return { addedTo };
  });
}

/** Admin only (checked by the caller): promote a validated member to moderator, or back. */
export async function setMemberRole(targetId: string, role: "member" | "moderator", actorId: string) {
  await db.transaction(async (tx) => {
    const target = await lockTarget(tx, targetId);
    if (target.role === "admin") throw forbidden("Impossible de modifier un admin");
    if (target.status !== "active") throw badRequest("Le membre doit être validé");
    if (target.role === role) return;
    await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, targetId));
    await audit(actorId, "user.role", "user", targetId, { from: target.role, to: role }, tx);
  });
}

/**
 * Rename a member from /mod. Same rules as the status: not yourself (that's
 * the profile page), never an admin, a moderator only by an admin.
 */
export async function renameMember(targetId: string, name: string, actor: NonNullable<MemberActor>) {
  await db.transaction(async (tx) => {
    const target = await lockTarget(tx, targetId);
    if (target.id === actor.id) throw badRequest("Change ton pseudo depuis ton profil");
    if (target.role === "admin") throw forbidden("Impossible de modifier un admin");
    if (target.role === "moderator" && actor.role !== "admin") throw forbidden("Seul un admin peut gérer un modérateur");
    if (target.name === name) return;
    // updated_at moves the board's live version: other members see the new name
    await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, targetId));
    await audit(actor.id, "user.rename", "user", targetId, { from: target.name, to: name }, tx);
  });
}

/** Remove a member's profile photo from /mod, under the same rules as renaming. */
export async function removeMemberAvatar(targetId: string, actor: NonNullable<MemberActor>) {
  const path = await db.transaction(async (tx) => {
    const target = await lockTarget(tx, targetId);
    if (target.id === actor.id) throw badRequest("Change ta photo depuis ton profil");
    if (target.role === "admin") throw forbidden("Impossible de modifier un admin");
    if (target.role === "moderator" && actor.role !== "admin") throw forbidden("Seul un admin peut gérer un modérateur");
    if (!target.avatarFileId) throw badRequest("Ce membre n'a pas de photo");

    await tx.update(user).set({ avatarFileId: null, updatedAt: new Date() }).where(eq(user.id, targetId));
    const [file] = await tx.delete(schema.files).where(eq(schema.files.id, target.avatarFileId)).returning({ path: schema.files.path });
    await audit(actor.id, "user.remove_avatar", "user", targetId, { fileId: target.avatarFileId }, tx);
    return file?.path;
  });
  if (path) await deleteStored(path).catch(() => {});
}
