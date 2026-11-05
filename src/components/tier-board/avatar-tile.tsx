import Image from "next/image";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tileVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden bg-secondary font-display font-extrabold text-muted-foreground select-none",
  {
    variants: {
      size: {
        sm: "size-8 rounded-lg text-xs",
        md: "size-14 text-lg",
        lg: "size-20 rounded-2xl text-2xl",
        xl: "size-36 rounded-3xl border-4 border-ink text-5xl shadow-pop-lg",
      },
      shape: {
        square: "",
        round: "rounded-full",
      },
      state: {
        idle: "",
        selected: "ring-4 ring-primary ring-inset",
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
    <div className={cn(tileVariants({ size, shape, state, motion }))} title={title ?? name}>
      {fileId ? (
        <Image
          src={`/api/files/${fileId}`}
          alt={name}
          fill
          sizes="144px"
          unoptimized
          priority={priority}
          className="object-cover"
          draggable={false}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
