"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import type { Tier } from "@/lib/tiers";
import { TierResult } from "./tier-result";
import { AvatarTile } from "./avatar-tile";
import type { Member } from "./types";

export type ResultsData = {
  average: Record<Tier, string[]>;
  means: Record<string, number>;
  controversial: { targetId: string; stddev: number } | null;
  unanimous: { targetId: string; tier: Tier }[];
  voters: { voterId: string; isLate: boolean; rows: Record<Tier, string[]> }[];
  myId: string;
};

type View = "avg" | "mine" | "members";

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

const statCard = "flex items-center gap-3 rounded-2xl border-2 border-board-edge bg-card p-3";

export function ResultsTabs({ data, members }: { data: ResultsData; members: Member[] }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const mine = data.voters.find((v) => v.voterId === data.myId);
  const others = data.voters.filter((v) => v.voterId !== data.myId);
  const [view, setView] = useState<View>("avg");
  const [voter, setVoter] = useState<string | null>(others[0]?.voterId ?? null);
  const selected = data.voters.find((v) => v.voterId === voter);
  const captions = new Map(Object.entries(data.means).map(([id, m]) => [id, `moyenne ${m.toFixed(2)}`]));
  const spicy = data.controversial ? byId.get(data.controversial.targetId) : undefined;

  const tabs: { id: View; label: string }[] = [
    { id: "avg", label: "Moyenne" },
    ...(mine ? [{ id: "mine" as const, label: "La mienne" }] : []),
    { id: "members", label: "Par membre" },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-2xl border-2 border-board-edge bg-board p-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} className={segment({ active: view === t.id })} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {view === "avg" && (
        <div className="flex flex-col gap-3">
          <TierResult rows={data.average} members={byId} captions={captions} />
          {spicy && data.controversial && (
            <div className={statCard}>
              <AvatarTile name={spicy.name} fileId={spicy.avatarFileId} size="sm" />
              <p className="text-sm">
                🌶️ <strong>{spicy.name}</strong> divise le plus <span className="text-muted-foreground">(écart {data.controversial.stddev})</span>
              </p>
            </div>
          )}
          {data.unanimous.map((u) => {
            const m = byId.get(u.targetId);
            return m ? (
              <div key={u.targetId} className={statCard}>
                <AvatarTile name={m.name} fileId={m.avatarFileId} size="sm" />
                <p className="text-sm">
                  🤝 Unanimité : <strong>{m.name}</strong> en <strong>{u.tier}</strong>
                </p>
              </div>
            ) : null;
          })}
          <p className="text-center text-xs text-muted-foreground">{data.voters.length} tier list(s) dans la moyenne</p>
        </div>
      )}

      {view === "mine" && mine && <TierResult rows={mine.rows} members={byId} />}

      {view === "members" &&
        (others.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">Personne d&apos;autre n&apos;a encore joué.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {others.map((v) => {
                const m = byId.get(v.voterId);
                if (!m) return null;
                return (
                  <button key={v.voterId} type="button" onClick={() => setVoter(v.voterId)} aria-pressed={voter === v.voterId} className="flex shrink-0 flex-col items-center gap-1 active:scale-95">
                    <AvatarTile name={m.name} fileId={m.avatarFileId} size="md" shape="round" state={voter === v.voterId ? "selected" : "idle"} />
                    <span className="max-w-16 truncate text-xs">{m.name}</span>
                  </button>
                );
              })}
            </div>
            {selected && (
              <>
                <p className="text-sm">
                  La tier list de <strong>{byId.get(selected.voterId)?.name}</strong>
                  {selected.isLate && <span className="text-muted-foreground"> · en retard</span>}
                </p>
                <TierResult key={selected.voterId} rows={selected.rows} members={byId} />
              </>
            )}
          </div>
        ))}
    </section>
  );
}
