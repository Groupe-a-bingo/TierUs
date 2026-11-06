"use client";

import { useEffect } from "react";
import { Copy, Reply, Trash2 } from "lucide-react";
import { cva } from "class-variance-authority";
import { toast } from "sonner";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/reactions";
import type { ReactionSummary } from "./reaction-bar";
import { cn } from "@/lib/utils";

const emojiBtn = cva("flex size-12 items-center justify-center rounded-2xl text-2xl transition-transform active:scale-90", {
  variants: { mine: { true: "bg-primary", false: "bg-secondary" } },
});
const row = "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left font-display font-semibold active:bg-secondary";

/** Long-press menu (phone): bottom sheet with reactions and message actions. */
export function MessageSheet({
  open,
  onClose,
  body,
  reactions,
  onReact,
  onReply,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  body: string;
  reactions: ReactionSummary[];
  onReact: (e: ReactionEmoji) => void;
  onReply: () => void;
  onDelete?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal aria-label="Actions du message">
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex animate-rise flex-col gap-3 rounded-t-3xl border-t-2 border-ink bg-card p-4 pb-safe shadow-pop-lg">
        <span className="mx-auto h-1 w-10 rounded-full bg-board-edge" aria-hidden />
        <p className="line-clamp-2 px-1 text-sm text-muted-foreground">{body}</p>
        <div className="grid grid-cols-4 gap-2">
          {REACTION_EMOJIS.map((e) => (
            <button key={e} type="button" className={emojiBtn({ mine: reactions.some((r) => r.emoji === e && r.mine) })} onClick={run(() => onReact(e))}>
              {e}
            </button>
          ))}
        </div>
        <div className="flex flex-col">
          <button type="button" className={row} onClick={run(onReply)}>
            <Reply className="size-5" /> Répondre
          </button>
          <button
            type="button"
            className={row}
            onClick={run(() => {
              navigator.clipboard?.writeText(body).then(
                () => toast.success("Copié"),
                () => toast.error("Copie impossible"),
              );
            })}
          >
            <Copy className="size-5" /> Copier le texte
          </button>
          {onDelete && (
            <button type="button" className={cn(row, "text-destructive")} onClick={run(onDelete)}>
              <Trash2 className="size-5" /> Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
