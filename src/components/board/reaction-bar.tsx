"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { SmilePlus } from "lucide-react";
import { cva } from "class-variance-authority";
import { toast } from "sonner";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/reactions";
import { toggleReaction } from "@/app/actions/social";

const chip = cva(
  "flex h-9 items-center gap-1 rounded-full border-2 px-3 text-base transition-transform duration-75 select-none active:scale-90",
  {
    variants: {
      mine: { true: "border-ink bg-primary text-primary-foreground", false: "border-board-edge bg-card" },
    },
  },
);

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

/** Optimistic reactions for one post or comment, shared by its chips and its picker. */
export function useReactions(roundId: string, commentId: string | undefined, reactions: ReactionSummary[]) {
  const [, startTransition] = useTransition();
  const [list, apply] = useOptimistic(reactions, (state, emoji: string) => {
    const existing = state.find((r) => r.emoji === emoji);
    if (!existing) return [...state, { emoji, count: 1, mine: true }];
    return state
      .map((r) => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r))
      .filter((r) => r.count > 0);
  });

  const toggle = (emoji: ReactionEmoji) =>
    startTransition(async () => {
      apply(emoji);
      // the action revalidates the post, so real counts arrive in the same response
      const res = await toggleReaction({ roundId, commentId, emoji });
      if (!res.ok) toast.error(res.error);
    });

  // the picker only offers emojis nobody has used yet: existing ones are chips
  // (tap a chip to add / remove yours)
  const available = REACTION_EMOJIS.filter((e) => !list.some((r) => r.emoji === e));
  return { list, toggle, available };
}

export function ReactionChips({ list, toggle }: { list: ReactionSummary[]; toggle: (e: ReactionEmoji) => void }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((r) => (
        <button key={r.emoji} type="button" className={chip({ mine: r.mine })} onClick={() => toggle(r.emoji as ReactionEmoji)}>
          <span>{r.emoji}</span>
          <span className="font-display text-sm font-bold">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

const pickerButton = cva(
  "flex items-center justify-center text-muted-foreground transition-transform duration-75 hover:text-foreground active:scale-90",
  {
    variants: {
      size: { chip: "h-9 rounded-full border-2 border-board-edge bg-card px-3", icon: "size-8 rounded-lg hover:bg-secondary" },
    },
  },
);

const popover = cva("absolute z-30 grid w-max animate-pop-in grid-cols-4 gap-1 rounded-2xl border-2 border-ink bg-popover p-1.5 shadow-pop", {
  // "up": opens above the button so the last message's picker is never cut off
  variants: { placement: { down: "top-full left-0 mt-2", up: "bottom-full left-0 mb-2" } },
});

export function ReactionPicker({
  available,
  toggle,
  size = "chip",
  placement = "down",
}: {
  available: ReactionEmoji[];
  toggle: (e: ReactionEmoji) => void;
  size?: "chip" | "icon";
  placement?: "down" | "up" | "auto";
}) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<"down" | "up">(placement === "up" ? "up" : "down");
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // close on any click / tap outside, and on Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!available.length) return null;

  const toggleOpen = () => {
    if (!open && placement === "auto" && btn.current) {
      // open towards the side with room inside the scroll box, so it's never cut off
      const box = btn.current.closest("[data-scroll-box]") ?? document.documentElement;
      const b = btn.current.getBoundingClientRect();
      const c = box.getBoundingClientRect();
      setDir(b.top - Math.max(c.top, 0) > 120 ? "up" : "down");
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={wrap} className="relative">
      <button ref={btn} type="button" aria-label="Réagir" aria-expanded={open} className={pickerButton({ size })} onClick={toggleOpen}>
        <SmilePlus className="size-4" />
      </button>
      {open && (
        <div className={popover({ placement: dir })}>
          {available.map((e) => (
            <button
              key={e}
              type="button"
              className="flex size-10 items-center justify-center rounded-xl text-xl hover:bg-secondary active:scale-90"
              onClick={() => {
                setOpen(false);
                toggle(e);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Post-level bar: used emojis as chips + the picker at the end. */
export function ReactionBar({ roundId, commentId, reactions }: { roundId: string; commentId?: string; reactions: ReactionSummary[] }) {
  const r = useReactions(roundId, commentId, reactions);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ReactionChips list={r.list} toggle={r.toggle} />
      <ReactionPicker available={r.available} toggle={r.toggle} />
    </div>
  );
}
