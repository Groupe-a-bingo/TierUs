"use client";

import { useOptimistic, useState, useTransition } from "react";
import { SmilePlus } from "lucide-react";
import { cva } from "class-variance-authority";
import { toast } from "sonner";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/reactions";
import { toggleReaction } from "@/app/actions/social";
import { cn } from "@/lib/utils";

const chip = cva(
  "flex h-9 items-center gap-1 rounded-full border-2 px-3 text-base transition-transform duration-75 select-none active:scale-90",
  {
    variants: {
      mine: { true: "border-ink bg-primary text-primary-foreground", false: "border-board-edge bg-card" },
    },
  },
);

/** desktop: only show on hover of the parent `group` (always visible on touch) */
export const hoverOnly = "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 lg:focus-visible:opacity-100";

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

export function ReactionBar({ roundId, commentId, reactions, compact, pickerOnHover }: { roundId: string; commentId?: string; reactions: ReactionSummary[]; compact?: boolean; pickerOnHover?: boolean }) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [optimistic, apply] = useOptimistic(reactions, (state, emoji: string) => {
    const existing = state.find((r) => r.emoji === emoji);
    if (!existing) return [...state, { emoji, count: 1, mine: true }];
    return state
      .map((r) => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r))
      .filter((r) => r.count > 0);
  });

  const toggle = (emoji: ReactionEmoji) => {
    setOpen(false);
    startTransition(async () => {
      apply(emoji);
      // the action revalidates the post, so real counts arrive in the same response
      const res = await toggleReaction({ roundId, commentId, emoji });
      if (!res.ok) toast.error(res.error);
    });
  };

  const shown = compact
    ? optimistic
    : REACTION_EMOJIS.map((e) => optimistic.find((r) => r.emoji === e) ?? { emoji: e, count: 0, mine: false });

  // the picker only offers emojis nobody has used yet: existing ones are already
  // chips on the bar (tap a chip to add / remove yours)
  const available = REACTION_EMOJIS.filter((e) => !optimistic.some((r) => r.emoji === e));

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {shown.map((r) => (
        <button key={r.emoji} type="button" className={chip({ mine: r.mine })} onClick={() => toggle(r.emoji as ReactionEmoji)}>
          <span>{r.emoji}</span>
          {r.count > 0 && <span className="font-display text-sm font-bold">{r.count}</span>}
        </button>
      ))}
      {compact && available.length > 0 && (
        <>
          <button type="button" aria-label="Réagir" className={cn(chip({ mine: false }), pickerOnHover && !open && hoverOnly)} onClick={() => setOpen((o) => !o)}>
            <SmilePlus className="size-4 text-muted-foreground" />
          </button>
          {open && (
            <div className="absolute top-full left-0 z-20 mt-2 flex animate-pop-in gap-1 rounded-2xl border-2 border-ink bg-popover p-1.5 shadow-pop">
              {available.map((e) => (
                <button key={e} type="button" className="flex size-10 items-center justify-center rounded-xl text-xl active:scale-90" onClick={() => toggle(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
