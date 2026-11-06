import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { addMemberToActiveRounds, removeMemberFromActiveRounds } from "@/server/rounds/targets";
import { lockMembership } from "@/server/rounds/lock";

const { user, session } = schema;

/**
 * Validate (or re-admit) / reject (or ban) a member, in one transaction:
 * - active: the member joins every tier list that is still active, so an
 *   account is never active while missing from the current tier lists;
 * - rejected: sessions are killed and the member leaves the active tier lists.
 */
export async function setMemberStatus(
  targetId: string,
  status: "active" | "rejected",
  actorId: string | null,
  previous: string,
  now = new Date(),
): Promise<{ addedTo: string[] }> {
  return db.transaction(async (tx) => {
    // same lock as the draws: no tier list is created / snapshotted meanwhile
    await lockMembership(tx);
    await tx
      .update(user)
      .set({ status, ...(status === "rejected" ? { role: "member" as const } : {}) })
      .where(eq(user.id, targetId));
    let addedTo: string[] = [];
    if (status === "active") {
      addedTo = await addMemberToActiveRounds(targetId, tx, now);
    } else {
      await tx.delete(session).where(eq(session.userId, targetId));
      await removeMemberFromActiveRounds(targetId, tx, now);
    }
    await audit(actorId, status === "active" ? "user.approve" : "user.reject", "user", targetId, { previous }, tx);
    return { addedTo };
  });
}
