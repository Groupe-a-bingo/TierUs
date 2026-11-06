import { cva } from "class-variance-authority";
import type { Tier } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export const tierBg = {
  S: "bg-tier-s",
  A: "bg-tier-a",
  B: "bg-tier-b",
  C: "bg-tier-c",
  D: "bg-tier-d",
  F: "bg-tier-f",
} as const satisfies Record<Tier, string>;

const labelVariants = cva(
  "flex w-16 shrink-0 items-center justify-center border-r-2 border-ink font-display text-3xl font-extrabold text-tier-foreground",
  { variants: { tier: tierBg } },
);

/** Staggered entrance per row (static classes for the linter). */
const rowDelay = {
  S: "delay-0",
  A: "delay-75",
  B: "delay-150",
  C: "delay-200",
  D: "delay-300",
  F: "delay-500",
} as const satisfies Record<Tier, string>;

const rowVariants = cva("flex min-h-16 border-b-2 border-board last:border-b-0", {
  variants: {
    reveal: { true: "animate-rise", false: "" },
  },
  defaultVariants: { reveal: false },
});

const dropZone = cva("flex flex-1 flex-wrap content-start transition-colors duration-75", {
  variants: {
    over: { true: "bg-secondary ring-4 ring-primary ring-inset", false: "bg-board-row" },
  },
  defaultVariants: { over: false },
});

export type RowDropHandlers = {
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
};

export function TierRow({
  tier,
  children,
  reveal,
  over,
  drop,
}: {
  tier: Tier;
  children?: React.ReactNode;
  reveal?: boolean;
  over?: boolean;
  drop?: RowDropHandlers;
}) {
  return (
    <div className={cn(rowVariants({ reveal }), reveal && rowDelay[tier])}>
      <div className={labelVariants({ tier })}>{tier}</div>
      <div className={dropZone({ over })} {...drop}>
        {children}
      </div>
    </div>
  );
}

export function TierBoardFrame({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border-2 border-ink bg-board shadow-pop">{children}</div>;
}
