import { TIERS, TIER_SCORE, scoreToTier, type Tier } from "@/lib/tiers";

export type Vote = { voterId: string; targetId: string; tier: Tier };

export type TargetResult = {
  targetId: string;
  mean: number;
  stddev: number;
  votes: number;
  tier: Tier;
  distribution: Record<Tier, number>;
};

export type Aggregate = {
  rows: Record<Tier, TargetResult[]>;
  results: TargetResult[];
  controversial: TargetResult | null;
  unanimous: TargetResult[];
  voters: number;
};

const emptyDistribution = (): Record<Tier, number> => ({ S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 });

/**
 * Average tier list. Every vote counts, including voting for yourself.
 * Mean score (S=5 … F=0) rounded to the nearest tier (.5 rounds up).
 */
export function aggregate(votes: Vote[]): Aggregate {
  const byTarget = new Map<string, Tier[]>();
  const voters = new Set<string>();
  for (const v of votes) {
    voters.add(v.voterId);
    const arr = byTarget.get(v.targetId) ?? [];
    arr.push(v.tier);
    byTarget.set(v.targetId, arr);
  }

  const results: TargetResult[] = [];
  for (const [targetId, tiers] of byTarget) {
    const scores = tiers.map((t) => TIER_SCORE[t]);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
    const distribution = emptyDistribution();
    for (const t of tiers) distribution[t]++;
    results.push({
      targetId,
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(Math.sqrt(variance) * 100) / 100,
      votes: tiers.length,
      tier: scoreToTier(mean),
      distribution,
    });
  }

  results.sort((a, b) => b.mean - a.mean || a.targetId.localeCompare(b.targetId));

  const rows = Object.fromEntries(TIERS.map((t) => [t, [] as TargetResult[]])) as Record<Tier, TargetResult[]>;
  for (const r of results) rows[r.tier].push(r);

  const multi = results.filter((r) => r.votes >= 2);
  const controversial = multi.reduce<TargetResult | null>(
    (best, r) => (r.stddev > 0 && (!best || r.stddev > best.stddev) ? r : best),
    null,
  );
  const unanimous = multi.filter((r) => r.stddev === 0);

  return { rows, results, controversial, unanimous, voters: voters.size };
}
