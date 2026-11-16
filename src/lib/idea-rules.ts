import type { IdeaStatus } from "@/db/schema";

/** Who writes an idea: a member, or a moderator (who may edit anyone's idea). */
export type IdeaActor = { id: string; isModerator: boolean };

/** Status of a new idea, whoever writes it (moderators too): the moderators' queue while validation is on. */
export const newIdeaStatus = (validation: boolean): IdeaStatus => (validation ? "pending" : "approved");

/**
 * Status after an edit (shared by the server and the edit form's notice):
 * - a refused idea leaves the refused list only when its author fixes it,
 *   then follows the same rule as a new idea (queue while validation is on,
 *   bank otherwise: nothing may wait for a validation that is off);
 *   anyone else's edit (a moderator's) leaves it refused;
 * - otherwise a member's edit goes back through validation while it's on
 *   (editing an approved idea must not bypass it), and a moderator's edit
 *   keeps the status.
 */
export function statusAfterEdit(actor: IdeaActor, idea: { authorId: string | null; status: IdeaStatus }, validation: boolean): IdeaStatus {
  if (idea.status === "rejected") {
    if (idea.authorId !== actor.id) return "rejected";
    return newIdeaStatus(validation);
  }
  return actor.isModerator ? idea.status : newIdeaStatus(validation);
}
