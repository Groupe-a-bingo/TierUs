/**
 * Instant placeholders shown while a page renders on the server. Each one
 * reuses its page's layout classes (grid, widths, paddings) so the content
 * lands where the skeleton was, on phone and desktop.
 */
import { cn } from "cn";

export type SkeletonVariant = "board" | "post" | "ideas" | "mod" | "profile";

const TIER_KEYS = ["bg-tier-s", "bg-tier-a", "bg-tier-b", "bg-tier-c", "bg-tier-d", "bg-tier-f"];

function Bar({ className }: { className: string }) {
  return <div className={cn("rounded-lg bg-secondary", className)} />;
}

/** A shadcn Card's frame (same border, radius, padding). */
function CardShell({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-4 rounded-2xl border-2 border-board-edge bg-card p-5", className)}>{children}</div>;
}

function Board() {
  return (
    <div className="flex flex-col gap-6">
      <div className="hidden flex-col gap-2 lg:flex">
        <Bar className="h-4 w-36" />
        <Bar className="h-12 w-64" />
      </div>
      {/* the pinned tier list */}
      <div className="flex flex-col gap-4 rounded-3xl border-2 border-board-edge bg-primary/15 p-5 lg:gap-6 lg:p-10">
        <div className="flex justify-between">
          <Bar className="h-4 w-32" />
          <Bar className="h-5 w-20 rounded-full" />
        </div>
        <Bar className="h-8 w-3/4 lg:h-14" />
        <Bar className="h-8 w-1/2 lg:h-14" />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="size-10 rounded-xl" />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Bar className="h-4 w-40" />
          <Bar className="h-10 w-28 rounded-xl lg:h-12" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Bar className="h-7 w-32" />
          <Bar className="h-4 w-6" />
        </div>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 2xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border-2 border-board-edge bg-card p-4 lg:p-5">
              <div className="flex justify-between">
                <Bar className="h-3 w-24" />
                <Bar className="h-5 w-16 rounded-full" />
              </div>
              <Bar className="h-6 w-4/5" />
              <div className="flex gap-2">
                {[0, 1, 2].map((j) => (
                  <Bar key={j} className="size-8 rounded-xl" />
                ))}
              </div>
              <Bar className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Post() {
  return (
    <div className="flex flex-col gap-6 xl:grid xl:h-post xl:grid-cols-12 xl:gap-10">
      <div className="flex flex-col gap-6 xl:col-span-7">
        <div className="flex flex-col gap-3">
          <Bar className="h-4 w-16 lg:hidden" />
          <Bar className="h-4 w-64" />
          <Bar className="h-9 w-3/4 lg:h-12" />
          <Bar className="h-9 w-1/2 lg:h-12" />
        </div>
        {/* Moyenne · Tier lists · Stats */}
        <Bar className="h-12 w-full rounded-2xl" />
        <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-board-edge">
          {TIER_KEYS.map((c) => (
            <div key={c} className="flex h-16 border-b-2 border-board last:border-b-0">
              <div className={cn("w-16 opacity-40", c)} />
              <div className="flex-1 bg-board-row" />
            </div>
          ))}
        </div>
      </div>
      {/* the discussion panel (desktop) */}
      <div className="hidden flex-col gap-4 rounded-3xl border-2 border-board-edge bg-board p-6 xl:col-span-5 xl:flex">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-8 w-14 rounded-full" />
          ))}
        </div>
        {["w-3/4", "w-1/2", "w-2/3", "w-2/5"].map((w, i) => (
          <div key={w} className={i % 2 ? "flex justify-end" : "flex gap-2"}>
            {i % 2 === 0 && <Bar className="size-8 shrink-0 rounded-xl" />}
            <Bar className={cn("h-12 rounded-2xl", w)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Ideas() {
  return (
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start xl:gap-10">
      <Bar className="hidden h-12 w-80 lg:block xl:col-span-2" />
      <CardShell>
        <Bar className="h-6 w-48" />
        <Bar className="h-4 w-full" />
        <Bar className="h-10 w-full" />
        <Bar className="h-20 w-full" />
        <Bar className="h-10 w-28" />
      </CardShell>
      <div className="flex flex-col gap-2">
        <Bar className="h-4 w-28" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Bar className="h-5 w-2/3" />
            <div className="flex gap-2">
              <Bar className="h-8 w-20" />
              <Bar className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mod() {
  return (
    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-6">
      <Bar className="h-8 w-40 lg:h-12 lg:w-72 xl:col-span-2" />
      <CardShell>
        <Bar className="h-6 w-56" />
        <Bar className="h-4 w-full" />
        <Bar className="h-24 w-full" />
      </CardShell>
      <CardShell className="xl:row-span-3">
        <Bar className="h-6 w-24" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-8 w-24" />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} className="h-16 w-full" />
        ))}
      </CardShell>
      {[0, 1].map((i) => (
        <CardShell key={i}>
          <Bar className="h-6 w-40" />
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-3">
              <Bar className="size-10 rounded-xl" />
              <Bar className="h-4 flex-1" />
            </div>
          ))}
        </CardShell>
      ))}
    </div>
  );
}

function Profile() {
  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:max-w-xl lg:pt-6">
      <CardShell>
        <Bar className="h-6 w-40" />
        <div className="flex items-center gap-4">
          <Bar className="size-20 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <Bar className="h-9 w-40" />
            <Bar className="h-3 w-48" />
          </div>
        </div>
        <Bar className="h-10 w-full" />
        <Bar className="h-6 w-56" />
      </CardShell>
      <Bar className="h-10 w-full rounded-xl" />
    </div>
  );
}

const VARIANTS: Record<SkeletonVariant, () => React.ReactNode> = { board: Board, post: Post, ideas: Ideas, mod: Mod, profile: Profile };

export function PageSkeleton({ variant }: { variant: SkeletonVariant }) {
  const Body = VARIANTS[variant];
  return (
    <div className="animate-pulse" role="status" aria-busy="true" aria-label="Chargement">
      <Body />
    </div>
  );
}
