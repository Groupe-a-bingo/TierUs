import { TIERS, emptyRows, type Tier } from "@/lib/tiers";
import { aggregate, computeStats, type BoardStats, type TargetResult, type Vote } from "./aggregate";

export type TargetStat = Pick<TargetResult, "targetId" | "mean" | "stddev" | "tier" | "distribution">;

/** Everything the results tabs show, built once on the server. */
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

type VoterDetail = { voterId: string; isLate: boolean; placements: { targetId: string; tier: Tier; position: number }[] };

export function buildResults(votes: Vote[], detail: VoterDetail[], myId: string): ResultsData {
  const agg = aggregate(votes);
  const average = emptyRows();
  for (const t of TIERS) average[t] = agg.rows[t].map((r) => r.targetId);
  return {
    average,
    means: Object.fromEntries(agg.results.map((r) => [r.targetId, r.mean])),
    controversial: agg.controversial ? { targetId: agg.controversial.targetId, stddev: agg.controversial.stddev } : null,
    unanimous: agg.unanimous.map((r) => ({ targetId: r.targetId, tier: r.tier })),
    voters: detail.map((d) => {
      const rows = emptyRows();
      for (const p of [...d.placements].sort((a, b) => a.position - b.position)) rows[p.tier].push(p.targetId);
      return { voterId: d.voterId, isLate: d.isLate, rows };
    }),
    myId,
    stats: computeStats(votes),
    targets: agg.results.map(({ targetId, mean, stddev, tier, distribution }) => ({ targetId, mean, stddev, tier, distribution })),
  };
}
