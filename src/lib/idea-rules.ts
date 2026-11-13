import type { IdeaStatus } from "@/db/schema";

/** Who writes an idea: a member, or a moderator (who skips the validation queue). */
export type IdeaActor = { id: string; isModerator: boolean };

/** Status of a new idea: members go through the moderators' queue while validation is on. */
export const newIdeaStatus = (actor: IdeaActor, validation: boolean): IdeaStatus => (!actor.isModerator && validation ? "pending" : "approved");

/**
 * Status after an edit (shared by the server and the edit form's notice):
 * - a refused idea goes back to the queue only when its author fixes it
 *   (a moderator author's idea skips the queue, as when they propose one);
 *   anyone else's edit (a moderator's) leaves it refused;
 * - otherwise a member's edit goes back through validation while it's on
 *   (editing an approved idea must not bypass it), and a moderator's edit
 *   keeps the status.
 */
export function statusAfterEdit(actor: IdeaActor, idea: { authorId: string | null; status: IdeaStatus }, validation: boolean): IdeaStatus {
  if (idea.status === "rejected") {
    if (idea.authorId !== actor.id) return "rejected";
    return actor.isModerator ? "approved" : "pending";
  }
  return actor.isModerator ? idea.status : newIdeaStatus(actor, validation);
}
