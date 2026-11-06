import Image from "next/image";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Member avatar as a TierUs "sticker": ink outline, rounded corners, photo
 * slightly punched up. Members without a photo get a tier-coloured tile.
 */
const tileVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden bg-secondary font-display font-extrabold select-none",
  {
    variants: {
      size: {
        sm: "size-8 rounded-lg border-2 border-ink text-xs",
        // tier rows: the whole photo, flush square like TierMaker
        md: "size-16 text-lg",
        lg: "size-20 rounded-2xl border-2 border-ink text-2xl",
        story: "size-16 rounded-xl border-2 border-ink text-xl",
        xl: "size-36 rounded-3xl border-4 border-ink text-5xl shadow-pop-lg",
      },
      shape: {
        square: "",
        round: "rounded-full",
      },
      state: {
        idle: "",
        selected: "ring-4 ring-primary",
        dim: "opacity-30 grayscale",
      },
      motion: {
        none: "",
        slam: "animate-slam",
        pop: "animate-pop-in",
      },
    },
    defaultVariants: { size: "md", shape: "square", state: "idle", motion: "none" },
  },
);

/** Deterministic tier colour for photo-less members (static classes for the linter). */
const FALLBACK = [
  "bg-tier-s text-tier-foreground",
  "bg-tier-a text-tier-foreground",
  "bg-tier-b text-tier-foreground",
  "bg-tier-c text-tier-foreground",
  "bg-tier-d text-tier-foreground",
  "bg-tier-f text-tier-foreground",
] as const;

function fallbackColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export type AvatarTileProps = {
  name: string;
  fileId: string | null;
  title?: string;
  priority?: boolean;
} & VariantProps<typeof tileVariants>;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function AvatarTile({ name, fileId, size, shape, state, motion, title, priority }: AvatarTileProps) {
  return (
    <div className={cn(tileVariants({ size, shape, state, motion }), !fileId && fallbackColor(name))} title={title ?? name}>
      {fileId ? (
        <Image
          src={`/api/files/${fileId}`}
          alt={name}
          fill
          sizes="144px"
          unoptimized
          priority={priority}
          className="object-cover contrast-105 saturate-110"
          draggable={false}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
