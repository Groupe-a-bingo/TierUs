import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

/** "TIERUS" with each letter on a tier-coloured key. */
const LETTERS = [
  { c: "T", cls: "bg-tier-s" },
  { c: "I", cls: "bg-tier-a" },
  { c: "E", cls: "bg-tier-b" },
  { c: "R", cls: "bg-tier-c" },
  { c: "U", cls: "bg-tier-d" },
  { c: "S", cls: "bg-tier-f" },
] as const;

const KEY = "flex size-8 items-center justify-center rounded-lg border-2 border-ink font-display text-lg font-extrabold text-tier-foreground shadow-pop-sm";

export function Wordmark() {
  return (
    <div className="flex gap-1" aria-label="TierUs">
      {LETTERS.map((l, i) => (
        <span key={i} className={cn(KEY, l.cls)} aria-hidden>
          {l.c}
        </span>
      ))}
    </div>
  );
}

export function StreakChip({ streak }: { streak: number }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full border-2 border-ink bg-card px-3 py-1 font-display text-lg font-extrabold text-streak shadow-pop-sm"
      title="Jours de suite"
    >
      <Flame className="size-5" /> {streak}
    </span>
  );
}
