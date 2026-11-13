import { cva } from "class-variance-authority";
import { TIERS, formatScore, scoreToTier } from "@/lib/tiers";
import type { BoardStats, VoterStats } from "@/server/rounds/aggregate";
import type { TargetStat } from "@/server/rounds/results";
import { AvatarTile } from "./avatar-tile";
import { tierBg } from "./tier-row";
import type { Member } from "@/lib/types";


const tierChip = cva("inline-flex size-6 items-center justify-center rounded-md border-2 border-ink font-display text-xs font-extrabold text-tier-foreground", {
  variants: { tier: tierBg },
});
const dot = cva("size-2.5 rounded-sm", { variants: { tier: tierBg } });
const segment = cva("h-2 flex-1 rounded-full", { variants: { on: { true: "bg-tier-d", false: "bg-board-edge" } } });

const fmt = formatScore;
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;

function Metric({ label, value, hint, children }: { label: string; value: React.ReactNode; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border-2 border-board-edge bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 font-display text-2xl font-extrabold">{value}</p>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Fact({ emoji, label, voter, value, members }: { emoji: string; label: string; voter: VoterStats | null; value: (v: VoterStats) => string; members: Map<string, Member> }) {
  const m = voter ? members.get(voter.voterId) : undefined;
  if (!voter || !m) return null;
  return (
    <li className="flex items-center gap-3 rounded-2xl border-2 border-board-edge bg-card p-2.5">
      <AvatarTile name={m.name} fileId={m.avatarFileId} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {emoji} {label}
        </p>
        <p className="truncate font-display font-bold">{m.name}</p>
      </div>
      <span className="font-display text-sm font-extrabold">{value(voter)}</span>
    </li>
  );
}

/** Expectation / variance view of a round (scores S=5 … F=0). */
export function StatsView({ stats, targets, members }: { stats: BoardStats; targets: TargetStat[]; members: Map<string, Member> }) {
  const consensusSegments = Math.round(stats.consensus / 10);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Metric label="Espérance E[X]" value={<>{fmt(stats.mean)} <span className={tierChip({ tier: scoreToTier(stats.mean) })}>{scoreToTier(stats.mean)}</span></>} hint={`Note moyenne sur ${stats.votes} placements (S=5 … F=0)`} />
        <Metric label="Variance Var[X]" value={fmt(stats.variance)} hint={`Écart-type σ = ${fmt(stats.stddev)} : l'étalement des notes`} />
        <Metric label="Consensus" value={`${stats.consensus} %`} hint={`σ moyen par membre : ${fmt(stats.avgSpread)} (0 = tout le monde d'accord)`}>
          <div className="flex gap-0.5" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={segment({ on: i < consensusSegments })} />
            ))}
          </div>
        </Metric>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-extrabold">Par membre</h3>
        <ul className="flex flex-col gap-1.5">
          {targets.map((t) => {
            const m = members.get(t.targetId);
            if (!m) return null;
            return (
              <li key={t.targetId} className="flex items-center gap-3 rounded-xl bg-card px-2.5 py-2">
                <AvatarTile name={m.name} fileId={m.avatarFileId} size="sm" />
                <p className="w-24 shrink-0 truncate font-display font-bold">{m.name}</p>
                {/* every vote as a coloured dot, S → F */}
                <div className="flex min-w-0 flex-1 flex-wrap gap-0.5" title="Répartition des votes">
                  {TIERS.flatMap((tier) => Array.from({ length: t.distribution[tier] }, (_, i) => <span key={`${tier}${i}`} className={dot({ tier })} />))}
                </div>
                <span className="text-right text-xs text-muted-foreground">
                  <span className="font-display text-sm font-extrabold text-foreground">E {fmt(t.mean)}</span>
                  <br />σ {fmt(t.stddev)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-extrabold">Les votants</h3>
        <ul className="grid gap-2 lg:grid-cols-2">
          <Fact emoji="🎁" label="Le plus généreux" voter={stats.generous} value={(v) => `E ${fmt(v.mean)}`} members={members} />
          <Fact emoji="🧊" label="Le plus sévère" voter={stats.harsh} value={(v) => `E ${fmt(v.mean)}`} members={members} />
          <Fact emoji="🎯" label="Le plus proche du consensus" voter={stats.aligned} value={(v) => `écart ${fmt(v.rmse)}`} members={members} />
          <Fact emoji="🌀" label="Le plus à contre-courant" voter={stats.contrarian} value={(v) => `écart ${fmt(v.rmse)}`} members={members} />
          <Fact emoji="👑" label="Le plus d'ego" voter={stats.ego && stats.ego.selfBias! > 0 ? stats.ego : null} value={(v) => signed(v.selfBias!)} members={members} />
          <Fact emoji="🙈" label="Le plus modeste" voter={stats.modest && stats.modest.selfBias! < 0 ? stats.modest : null} value={(v) => signed(v.selfBias!)} members={members} />
        </ul>
        <p className="text-xs text-muted-foreground">
          Écart = distance moyenne (RMS) entre ses notes et la moyenne du groupe. Ego = sa note pour lui-même moins la moyenne des autres pour lui.
        </p>
      </section>
    </div>
  );
}
