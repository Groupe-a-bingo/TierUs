"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cva } from "class-variance-authority";
import type { Tier } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { TierResult } from "./tier-result";
import { AvatarTile } from "./avatar-tile";
import type { Member } from "./types";
import type { BoardStats } from "@/server/rounds/aggregate";
import { StatsView, type TargetStat } from "./stats-view";
import { EmptyState } from "@/components/board/empty-state";

export type ResultsData = {
  average: Record<Tier, string[]>;
  means: Record<string, number>;
  controversial: { targetId: string; stddev: number } | null;
  unanimous: { targetId: string; tier: Tier }[];
  voters: { voterId: string; isLate: boolean; rows: Record<Tier, string[]> }[];
  myId: string;
  stats: BoardStats;
  targets: TargetStat[];
};

type View = "avg" | "lists" | "stats";

const segment = cva(
  "flex-1 rounded-xl border-2 py-2.5 font-display text-sm font-bold transition-colors duration-100 active:scale-95",
  {
    variants: {
      active: {
        true: "border-ink bg-primary text-primary-foreground shadow-pop-sm",
        false: "border-transparent text-muted-foreground",
      },
    },
  },
);

const ring = cva("rounded-2xl p-1", {
  variants: {
    seen: { true: "story-ring-seen", false: "story-ring" },
  },
});

const storyLabel = cva("max-w-18 truncate border-b-2 pb-0.5 text-xs", {
  variants: {
    selected: { true: "border-primary font-display font-bold text-foreground", false: "border-transparent text-muted-foreground" },
  },
});

const progressBar = cva("h-1 flex-1 rounded-full", {
  variants: {
    state: { done: "bg-foreground", current: "bg-primary", todo: "bg-board-edge" },
  },
});

const statChip = "flex items-center gap-2 rounded-full border-2 border-board-edge bg-card py-1 pr-3 pl-1 text-sm";

function Story({ member, label, seen, selected, onClick }: { member: Member; label: string; seen: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="flex w-20 shrink-0 snap-start flex-col items-center gap-1.5 active:scale-95">
      <span className={ring({ seen: seen && !selected })}>
        <span className="block rounded-xl bg-background p-0.5">
          <AvatarTile name={member.name} fileId={member.avatarFileId} size="story" />
        </span>
      </span>
      <span className={storyLabel({ selected })}>{label}</span>
    </button>
  );
}

/** Horizontal carousel with scroll arrows on desktop (touch just swipes). */
function Carousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // new stories arriving (live refresh) change the scroll width, not the box
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="relative min-w-0 flex-1">
      <div ref={ref} onScroll={update} className="no-scrollbar flex snap-x gap-2 overflow-x-auto">
        {children}
      </div>
      {edges.left && (
        <button type="button" aria-label="Défiler à gauche" onClick={() => scroll(-1)} className={arrow({ side: "left" })}>
          <ChevronLeft className="size-5" />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Défiler à droite" onClick={() => scroll(1)} className={arrow({ side: "right" })}>
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}

const arrow = cva(
  "absolute top-10 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-card shadow-pop-sm hover:bg-secondary active:scale-90 lg:flex",
  { variants: { side: { left: "left-0", right: "right-0" } } },
);

export function ResultsTabs({ data, members }: { data: ResultsData; members: Member[] }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const mine = data.voters.find((v) => v.voterId === data.myId);
  const others = data.voters.filter((v) => v.voterId !== data.myId && byId.has(v.voterId));
  // Stories order: me first (anchored left), then everyone else
  const order = [...(mine ? [mine] : []), ...others];

  const [view, setView] = useState<View>("avg");
  // track the selected person, not a position: a late answer can reorder the list
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const found = order.findIndex((v) => v.voterId === selectedId);
  const idx = found >= 0 ? found : 0;

  const current = order[idx];
  const go = (i: number) => {
    if (i < 0 || i >= order.length) return;
    setSelectedId(order[i].voterId);
    setSeen((s) => new Set(s).add(order[i].voterId));
  };
  const open = () => {
    setView("lists");
    if (order[idx]) setSeen((s) => new Set(s).add(order[idx].voterId));
  };

  const captions = new Map(Object.entries(data.means).map(([id, m]) => [id, `moyenne ${m.toFixed(2)}`]));
  const spicy = data.controversial ? byId.get(data.controversial.targetId) : undefined;
  const currentMember = current ? byId.get(current.voterId) : undefined;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-2xl border-2 border-board-edge bg-board p-1" role="tablist">
        <button type="button" role="tab" aria-selected={view === "avg"} className={segment({ active: view === "avg" })} onClick={() => setView("avg")}>
          Moyenne
        </button>
        <button type="button" role="tab" aria-selected={view === "lists"} className={segment({ active: view === "lists" })} onClick={open}>
          Tier lists · {order.length}
        </button>
        <button type="button" role="tab" aria-selected={view === "stats"} className={segment({ active: view === "stats" })} onClick={() => setView("stats")}>
          Stats
        </button>
      </div>

      {view === "avg" && (
        <div className="flex flex-col gap-3">
          <TierResult rows={data.average} members={byId} captions={captions} />
          {/* fun facts as compact chips (one line instead of stacked cards) */}
          {(spicy || data.unanimous.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {spicy && (
                <span className={statChip}>
                  <AvatarTile name={spicy.name} fileId={spicy.avatarFileId} size="sm" />
                  🌶️ <strong>{spicy.name}</strong> divise
                </span>
              )}
              {data.unanimous.map((u) => {
                const m = byId.get(u.targetId);
                return m ? (
                  <span key={u.targetId} className={statChip}>
                    <AvatarTile name={m.name} fileId={m.avatarFileId} size="sm" />
                    🤝 <strong>{m.name}</strong> en {u.tier} pour tous
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}

      {view === "lists" &&
        (order.length === 0 ? (
          <EmptyState>Personne n&apos;a encore joué.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {/* stories bar: me anchored left │ others in a carousel */}
            <div className="flex items-start gap-3">
              {mine && byId.get(mine.voterId) && (
                <>
                  <Story member={byId.get(mine.voterId)!} label="Moi" seen={seen.has(mine.voterId)} selected={idx === 0} onClick={() => go(0)} />
                  <div className="h-19 w-0.5 shrink-0 rounded-full bg-board-edge" aria-hidden />
                </>
              )}
              {others.length === 0 ? (
                // centred on the avatar row (the bar), not on avatar + name
                <div className="flex h-19 min-w-0 flex-1 items-center">
                  <EmptyState inline>Les autres n&apos;ont pas encore joué.</EmptyState>
                </div>
              ) : (
                <Carousel>
                  {others.map((v, i) => {
                    const at = i + (mine ? 1 : 0);
                    return <Story key={v.voterId} member={byId.get(v.voterId)!} label={byId.get(v.voterId)!.name} seen={seen.has(v.voterId)} selected={idx === at} onClick={() => go(at)} />;
                  })}
                </Carousel>
              )}
            </div>

            {current && currentMember && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-1" aria-hidden>
                  {order.map((v, i) => (
                    <span key={v.voterId} className={progressBar({ state: i < idx ? "done" : i === idx ? "current" : "todo" })} />
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate">
                    <span className="font-display font-bold">{current.voterId === data.myId ? "Ma tier list" : currentMember.name}</span>
                    {current.isLate && <span className="text-sm text-muted-foreground"> · en retard</span>}
                  </p>
                  <button type="button" aria-label="Précédente" disabled={idx === 0} onClick={() => go(idx - 1)} className="flex size-9 items-center justify-center rounded-full border-2 border-board-edge active:scale-90 disabled:opacity-30">
                    <ChevronLeft className="size-5" />
                  </button>
                  <button type="button" aria-label="Suivante" disabled={idx === order.length - 1} onClick={() => go(idx + 1)} className="flex size-9 items-center justify-center rounded-full border-2 border-board-edge active:scale-90 disabled:opacity-30">
                    <ChevronRight className="size-5" />
                  </button>
                </div>

                {/* tap left / right half to go back / forward, like stories */}
                <div className="relative">
                  <TierResult key={current.voterId} rows={current.rows} members={byId} />
                  <button type="button" tabIndex={-1} aria-hidden className={cn("absolute inset-y-0 left-0 w-1/3", idx === 0 && "pointer-events-none")} onClick={() => go(idx - 1)} />
                  <button type="button" tabIndex={-1} aria-hidden className={cn("absolute inset-y-0 right-0 w-2/3", idx === order.length - 1 && "pointer-events-none")} onClick={() => go(idx + 1)} />
                </div>
              </div>
            )}
          </div>
        ))}
      {view === "stats" && <StatsView stats={data.stats} targets={data.targets} members={byId} />}
    </section>
  );
}
