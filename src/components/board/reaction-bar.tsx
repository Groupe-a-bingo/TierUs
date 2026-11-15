"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { cva } from "class-variance-authority";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/reactions";
import type { ReactionSummary } from "@/lib/types";
import { setReaction } from "@/app/actions/social";
import { useServerAction } from "@/hooks/use-server-action";

const chip = cva(
  "flex h-9 items-center gap-1 rounded-full border-2 px-3 text-base transition-transform duration-75 select-none active:scale-90",
  {
    variants: {
      mine: { true: "border-ink bg-primary text-primary-foreground", false: "border-board-edge bg-card" },
    },
  },
);


/** Optimistic reactions for one post or comment, shared by its chips and its picker. */
export function useReactions(roundId: string, commentId: string | undefined, reactions: ReactionSummary[]) {
  const { run } = useServerAction();
  const [list, apply] = useOptimistic(reactions, (state, { emoji, on }: { emoji: string; on: boolean }) => {
    const existing = state.find((r) => r.emoji === emoji);
    if (!existing) return on ? [...state, { emoji, count: 1, mine: true }] : state;
    if (existing.mine === on) return state;
    return state.map((r) => (r.emoji === emoji ? { ...r, mine: on, count: r.count + (on ? 1 : -1) } : r)).filter((r) => r.count > 0);
  });

  // sends the state wanted, not "toggle": a double tap or a stale tab can't
  // end up the opposite of what the member sees
  const toggle = (emoji: ReactionEmoji) => {
    const on = !list.find((r) => r.emoji === emoji)?.mine;
    run(() => {
      apply({ emoji, on });
      // the action revalidates the post, so real counts arrive in the same response
      return setReaction({ roundId, commentId, emoji, on });
    });
  };

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
        <button
          key={r.emoji}
          type="button"
          className={chip({ mine: r.mine })}
          aria-pressed={r.mine}
          aria-label={`${r.emoji} ${r.count}`}
          onClick={() => toggle(r.emoji as ReactionEmoji)}
        >
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
  // align "end": grows leftwards from the button (the message actions sit at the right edge of the chat)
  variants: { placement: { down: "top-full mt-2", up: "bottom-full mb-2" }, align: { start: "left-0", end: "right-0" } },
});

export function ReactionPicker({
  available,
  toggle,
  size = "chip",
  placement = "down",
  align = "start",
}: {
  available: ReactionEmoji[];
  toggle: (e: ReactionEmoji) => void;
  size?: "chip" | "icon";
  placement?: "down" | "up" | "auto";
  align?: "start" | "end";
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus(); // back to the button that opened it
    };
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
        <div className={popover({ placement: dir, align })}>
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
