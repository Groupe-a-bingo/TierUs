"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { CornerDownRight, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { addComment, deleteComment } from "@/app/actions/social";
import { ReactionBar, hoverOnly, type ReactionSummary } from "./reaction-bar";
import { EmptyState } from "@/components/board/empty-state";

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  replyTo: { id: string; author: string; body: string } | null;
  author: { id: string; name: string; avatarFileId: string | null };
  reactions: ReactionSummary[];
  canDelete: boolean;
  pending?: boolean;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const hourFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** "5 nov 22:58" — no abbreviation dot, no comma */
const time = (iso: string) => {
  const d = new Date(iso);
  return `${dateFmt.format(d).replace(".", "")} ${hourFmt.format(d)}`;
};

type Op = { kind: "add"; comment: CommentView } | { kind: "delete"; id: string };

export function Comments({
  roundId,
  comments,
  me,
}: {
  roundId: string;
  comments: CommentView[];
  me: { id: string; name: string; avatarFileId: string | null };
}) {
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const [list, apply] = useOptimistic(comments, (state, op: Op) =>
    op.kind === "add" ? [...state, op.comment] : state.map((c) => (c.id === op.id ? { ...c, deleted: true, body: "" } : c)),
  );

  const send = () => {
    const text = body.trim();
    if (!text) return;
    const reply = replyTo;
    setBody("");
    setReplyTo(null);
    startTransition(async () => {
      // shows up instantly; the action's revalidation swaps in the real one
      apply({
        kind: "add",
        comment: {
          id: `tmp-${Date.now()}`,
          body: text,
          createdAt: new Date().toISOString(),
          deleted: false,
          replyTo: reply ? { id: reply.id, author: reply.author.name, body: reply.body.slice(0, 80) } : null,
          author: me,
          reactions: [],
          canDelete: false,
          pending: true,
        },
      });
      const res = await addComment({ roundId, body: text, replyToId: reply?.id });
      if (!res.ok) {
        toast.error(res.error);
        setBody(text);
      }
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      apply({ kind: "delete", id });
      const res = await deleteComment(id);
      if (!res.ok) toast.error(res.error);
    });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-extrabold">
        Discussion <span className="text-muted-foreground">{list.filter((c) => !c.deleted).length}</span>
      </h2>

      {list.length === 0 && <EmptyState>Lance le débat 👇</EmptyState>}

      <ul className="flex flex-col gap-4">
        {list.map((c) => (
          <li key={c.id} className={c.pending ? "group flex animate-rise gap-3 opacity-60" : "group flex gap-3"}>
            <AvatarTile name={c.author.name} fileId={c.author.avatarFileId} size="sm" shape="round" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {c.replyTo && (
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <CornerDownRight className="size-3 shrink-0" />
                  <span className="font-semibold">{c.replyTo.author}</span>
                  <span className="truncate">{c.replyTo.body}</span>
                </p>
              )}
              <p className="text-sm">
                <span className="font-display font-bold">{c.author.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{time(c.createdAt)}</span>
              </p>
              {/* Plain text only: React escapes it, no HTML/markdown rendering */}
              <p className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-base break-words whitespace-pre-wrap">
                {c.deleted ? <em className="text-muted-foreground">Message supprimé</em> : c.body}
              </p>
              {!c.deleted && !c.pending && (
                <div className="flex flex-wrap items-center gap-1">
                  <ReactionBar roundId={roundId} commentId={c.id} reactions={c.reactions} compact pickerOnHover />
                  <span className={hoverOnly}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReplyTo(c);
                      input.current?.focus();
                    }}
                  >
                    Répondre
                  </Button>
                  {c.canDelete && (
                    <Button variant="ghost" size="icon-sm" aria-label="Supprimer" onClick={() => remove(c.id)}>
                      <Trash2 />
                    </Button>
                  )}
                  </span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form
        className="sticky bottom-24 flex flex-col gap-2 rounded-2xl border-2 border-ink bg-card p-2 shadow-pop lg:bottom-0"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {replyTo && (
          <div className="flex items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
            <span className="truncate">
              ↪ {replyTo.author.name} : {replyTo.body}
            </span>
            <button type="button" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}>
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={1000}
            rows={1}
            placeholder="Ton avis…"
            className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!body.trim()} aria-label="Envoyer">
            <Send />
          </Button>
        </div>
      </form>
    </section>
  );
}
