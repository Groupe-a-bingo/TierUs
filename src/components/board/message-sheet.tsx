"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Copy, Reply, Trash2 } from "lucide-react";
import { cva } from "class-variance-authority";
import { toast } from "sonner";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/reactions";
import type { ReactionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const emojiBtn = cva("flex size-12 items-center justify-center rounded-2xl text-2xl transition-transform active:scale-90", {
  variants: { mine: { true: "bg-primary", false: "bg-secondary" } },
});
const row = "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left font-display font-semibold active:bg-secondary";

const FOCUSABLE = 'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Long-press menu (phone): bottom sheet with reactions and message actions.
 * Modal dialog: focus moves into the sheet on open, Tab / Shift+Tab stay
 * inside it, Escape closes it and focus returns to where it was.
 */
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
  const panel = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    // the sheet is rendered when `open` is true, so its panel exists when this effect runs
    const el = panel.current;
    if (!open || !el) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    // first action (a reaction) gets the focus
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = el.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // back to the element that opened the sheet, unless an action already moved
      // the focus on purpose (e.g. "Répondre" focuses the message field)
      const lost = !document.activeElement || document.activeElement === document.body || el.contains(document.activeElement);
      if (lost && previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="message-sheet-title">
      {/* backdrop: pointer only, the keyboard closes with Escape. Only a press that starts on it
          closes the sheet: the long press that opened it ends here, and that release can come with a click */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onPointerDown={() => (pressedBackdrop.current = true)}
        onClick={() => {
          if (pressedBackdrop.current) onClose();
          pressedBackdrop.current = false;
        }}
      />
      <div ref={panel} className="relative flex animate-rise flex-col gap-3 rounded-t-3xl border-t-2 border-ink bg-card p-4 pb-safe shadow-pop-lg">
        <span className="mx-auto h-1 w-10 rounded-full bg-board-edge" aria-hidden />
        <h2 id="message-sheet-title" className="sr-only">
          Actions du message
        </h2>
        <p className="line-clamp-2 px-1 text-sm text-muted-foreground">{body}</p>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Réactions">
          {REACTION_EMOJIS.map((e) => {
            const mine = reactions.some((r) => r.emoji === e && r.mine);
            return (
              <button key={e} type="button" aria-pressed={mine} className={emojiBtn({ mine })} onClick={run(() => onReact(e))}>
                {e}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col">
          <button type="button" className={row} onClick={run(onReply)}>
            <Reply className="size-5" /> Répondre
          </button>
          <button
            type="button"
            className={row}
            onClick={run(() => {
              // no clipboard API outside a secure context (plain http)
              if (!navigator.clipboard) return void toast.error("Copie impossible sur cette page");
              navigator.clipboard.writeText(body).then(
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
          <button type="button" className={cn(row, "text-muted-foreground")} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
