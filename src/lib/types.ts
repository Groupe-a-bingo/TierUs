/**
 * View types shared by the server (which builds them) and the components
 * (which render them). Plain data only: everything here crosses the
 * server → client boundary.
 */

/** A member as shown on a tier list: name + photo. */
export type Member = { id: string; name: string; avatarFileId: string | null };

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  replyTo: { id: string; author: string; body: string } | null;
  author: Member;
  reactions: ReactionSummary[];
  canDelete: boolean;
  pending?: boolean;
};
