"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Undo2, Check } from "lucide-react";
import { cva } from "class-variance-authority";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TIERS, type Tier } from "@/lib/tiers";
import { submitTierListAction } from "@/app/actions/rounds";
import { AvatarTile } from "./avatar-tile";
import { TierBoardFrame, TierRow, tierBg } from "./tier-row";
import type { Member } from "./types";
import { cn } from "@/lib/utils";

const tierButton = cva(
  "flex h-16 items-center justify-center rounded-2xl border-2 border-ink font-display text-3xl font-extrabold text-tier-foreground shadow-pop transition-transform duration-75 select-none active:translate-y-1 active:shadow-none",
  { variants: { tier: tierBg } },
);

/** wide = full-width page on desktop: board left, spotlight right. Otherwise stacked. */
const shell = cva("flex flex-col gap-5", {
  variants: { wide: { true: "lg:grid lg:grid-cols-5 lg:items-start lg:gap-8", false: "" } },
});
const side = cva("", {
  variants: { wide: { true: "lg:sticky lg:top-10 lg:col-span-2 lg:col-start-4 lg:row-start-1", false: "" } },
});
const boardCol = cva("", { variants: { wide: { true: "lg:col-span-3 lg:row-start-1", false: "" } } });

const spotlightBox = cva("flex flex-col items-center gap-4 rounded-3xl border-2 bg-card p-5 shadow-pop transition-colors duration-75", {
  variants: { over: { true: "border-primary", false: "border-board-edge" } },
});

type Placement = { id: string; tier: Tier };
const DRAG_MIME = "text/x-tierus-member";

/** Mouse/trackpad devices get drag & drop; touch keeps tap-to-place. */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    // any mouse / trackpad present (also covers touchscreen laptops)
    const mq = window.matchMedia("(any-pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

/**
 * Placement editor.
 * - Phone: AskUs-style, one member in the spotlight + six big tier buttons.
 * - PC: same, plus drag & drop from the spotlight / queue / board into any row
 *   (drop on an avatar to insert before it, drop on the spotlight to take it back).
 * `locked` = placements you already sent (complement mode): shown greyed, not editable.
 * Everything is local state until "Valider", so every interaction is instant.
 */
export function TierEditor({
  roundId,
  members,
  archived,
  complement,
  locked = [],
  wide = true,
}: {
  roundId: string;
  members: Member[];
  /** archived tier list: answering still works, it just doesn't count for the counter */
  archived: boolean;
  complement?: boolean;
  locked?: { member: Member; tier: Tier }[];
  wide?: boolean;
}) {
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [placed, setPlaced] = useState<Placement[]>([]);
  const [current, setCurrent] = useState<string | null>(members[0]?.id ?? null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overTier, setOverTier] = useState<Tier | "spotlight" | null>(null);
  const [pending, startTransition] = useTransition();
  const canDrag = useFinePointer();

  const placedIds = new Set(placed.map((p) => p.id));
  const queue = members.filter((m) => !placedIds.has(m.id) && m.id !== current);
  const done = placed.length === members.length;
  const spotlight = current ? byId.get(current) : undefined;

  /** Put `id` in `tier` (before `beforeId` if given); advance the spotlight if needed. */
  const moveTo = (id: string, tier: Tier, beforeId?: string) => {
    if (!byId.has(id) || id === beforeId) return;
    const rest = placed.filter((p) => p.id !== id);
    const idx = beforeId ? rest.findIndex((p) => p.id === beforeId) : -1;
    const next = idx >= 0 ? [...rest.slice(0, idx), { id, tier }, ...rest.slice(idx)] : [...rest, { id, tier }];
    setPlaced(next);
    if (id === current || !current) {
      const taken = new Set(next.map((p) => p.id));
      setCurrent(members.find((m) => !taken.has(m.id))?.id ?? null);
    }
    navigator.vibrate?.(8);
  };

  const place = (tier: Tier) => current && moveTo(current, tier);

  const pick = (id: string) => {
    setPlaced((prev) => prev.filter((p) => p.id !== id));
    setCurrent(id);
  };

  const undo = () => {
    const last = placed.at(-1);
    if (last) pick(last.id);
  };

  const submit = () => {
    const placements = TIERS.flatMap((tier) =>
      placed.filter((p) => p.tier === tier).map((p, position) => ({ targetId: p.id, tier, position })),
    );
    startTransition(async () => {
      // The action revalidates the page: fresh results come back in this same response.
      const res = await submitTierListAction({ roundId, placements });
      if (!res.ok) toast.error(res.error);
      else toast.success(complement ? "Tier list complétée !" : "Tier list envoyée !");
    });
  };

  /* ---------- drag & drop (HTML5, desktop) ---------- */
  const dragProps = (id: string) =>
    canDrag
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData(DRAG_MIME, id);
            e.dataTransfer.effectAllowed = "move";
            setDragId(id);
          },
          onDragEnd: () => {
            setDragId(null);
            setOverTier(null);
          },
        }
      : {};

  const draggedId = (e: React.DragEvent) => e.dataTransfer.getData(DRAG_MIME) || dragId;

  const rowDrop = (tier: Tier) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overTier !== tier) setOverTier(tier);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverTier(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = draggedId(e);
      setOverTier(null);
      setDragId(null);
      if (id) moveTo(id, tier);
    },
  });

  /** Dropping on a placed avatar inserts before it. */
  const tileDrop = (tier: Tier, beforeId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = draggedId(e);
      setOverTier(null);
      setDragId(null);
      if (id) moveTo(id, tier, beforeId);
    },
  });

  /** Dropping back on the spotlight takes the member out of the board. */
  const spotlightDrop = canDrag
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!dragId || !placedIds.has(dragId)) return;
          e.preventDefault();
          if (overTier !== "spotlight") setOverTier("spotlight");
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverTier(null);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const id = draggedId(e);
          setOverTier(null);
          setDragId(null);
          if (id && placedIds.has(id)) pick(id);
        },
      }
    : {};

  const submitLabel = pending ? "Envoi…" : complement ? "Ajouter à ma tier list" : archived ? "Valider (hors délai)" : "Valider ma tier list";

  return (
    <div className={shell({ wide })}>
      {spotlight ? (
        <section className={cn(spotlightBox({ over: overTier === "spotlight" }), side({ wide }))} {...spotlightDrop}>
          <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
            <span className="font-display font-semibold">
              {placed.length + 1} / {members.length}
            </span>
            <Button variant="ghost" size="sm" onClick={undo} disabled={!placed.length}>
              <Undo2 /> Annuler
            </Button>
          </div>

          <div key={spotlight.id} className="flex animate-pop-in flex-col items-center gap-3">
            <div className={canDrag ? "cursor-grab active:cursor-grabbing" : ""} {...dragProps(spotlight.id)}>
              <AvatarTile name={spotlight.name} fileId={spotlight.avatarFileId} size="xl" state={dragId === spotlight.id ? "dim" : "idle"} priority />
            </div>
            <p className="font-display text-3xl font-extrabold tracking-tight">{spotlight.name}</p>
          </div>

          <div className="grid w-full grid-cols-6 gap-2">
            {TIERS.map((tier) => (
              <button key={tier} type="button" className={tierButton({ tier })} onClick={() => place(tier)}>
                {tier}
              </button>
            ))}
          </div>

          {queue.length > 0 && (
            <div className="flex w-full items-center gap-1 overflow-x-auto pt-1">
              <span className="mr-1 shrink-0 text-xs text-muted-foreground">Ensuite</span>
              {queue.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCurrent(m.id)}
                  aria-label={m.name}
                  className={canDrag ? "cursor-grab active:cursor-grabbing" : ""}
                  {...dragProps(m.id)}
                >
                  <AvatarTile name={m.name} fileId={m.avatarFileId} size="sm" state={dragId === m.id ? "dim" : "idle"} />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        done && (
          <div className={cn("flex animate-rise flex-col gap-2", side({ wide }))}>
            <Button size="xl" className="w-full" disabled={pending} onClick={submit}>
              <Check /> {submitLabel}
            </Button>
          </div>
        )
      )}

      <div className={boardCol({ wide })}>
        <TierBoardFrame>
          {TIERS.map((tier) => (
            <TierRow key={tier} tier={tier} over={overTier === tier} drop={canDrag ? rowDrop(tier) : undefined}>
              {/* already sent (complement mode): greyed, not editable */}
              {locked
                .filter((l) => l.tier === tier)
                .map((l) => (
                  <AvatarTile key={l.member.id} name={l.member.name} fileId={l.member.avatarFileId} state="dim" title={`${l.member.name} (déjà placé)`} />
                ))}
              {placed
                .filter((p) => p.tier === tier)
                .map((p) => {
                  const m = byId.get(p.id);
                  return m ? (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pick(p.id)}
                      aria-label={`Replacer ${m.name}`}
                      className={canDrag ? "cursor-grab active:cursor-grabbing" : ""}
                      {...dragProps(p.id)}
                      {...(canDrag ? tileDrop(tier, p.id) : {})}
                    >
                      <AvatarTile name={m.name} fileId={m.avatarFileId} motion="slam" state={dragId === p.id ? "dim" : "idle"} />
                    </button>
                  ) : null;
                })}
            </TierRow>
          ))}
        </TierBoardFrame>
      </div>
    </div>
  );
}
