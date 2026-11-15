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

const emptyDistribution = () => Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;

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

  // ties by member id in code point order: the same order as the board's SQL podium (collate "C")
  results.sort((a, b) => b.mean - a.mean || (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));

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

/* ---------------- statistics ---------------- */

export type VoterStats = {
  voterId: string;
  /** E[score] this voter gave (generosity) */
  mean: number;
  /** root-mean-square distance between this voter's scores and the group means */
  rmse: number;
  /** self score − mean of what the others gave them (null if they didn't rate themselves / nobody else did) */
  selfBias: number | null;
};

export type BoardStats = {
  votes: number;
  /** E[X] over every single vote */
  mean: number;
  /** Var[X] and σ over every single vote */
  variance: number;
  stddev: number;
  /** average per-member σ: how much people disagree on a given member */
  avgSpread: number;
  /** 0–100: 100 = everyone placed everyone identically */
  consensus: number;
  voters: VoterStats[];
  generous: VoterStats | null;
  harsh: VoterStats | null;
  aligned: VoterStats | null;
  contrarian: VoterStats | null;
  ego: VoterStats | null;
  modest: VoterStats | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Expectation / variance style stats on a round. Scores: S=5 … F=0.
 * - board: E[X], Var[X], σ over all votes, plus how consensual the round was
 * - voters: generosity (mean given), distance to the consensus, self-bias
 */
export function computeStats(votes: Vote[]): BoardStats {
  const scores = votes.map((v) => TIER_SCORE[v.tier]);
  const mean = avg(scores);
  const variance = avg(scores.map((s) => (s - mean) ** 2));

  const byTarget = new Map<string, number[]>();
  for (const v of votes) {
    const xs = byTarget.get(v.targetId);
    if (xs) xs.push(TIER_SCORE[v.tier]);
    else byTarget.set(v.targetId, [TIER_SCORE[v.tier]]);
  }
  const targetMean = new Map([...byTarget].map(([id, xs]) => [id, avg(xs)]));
  const spreads = [...byTarget.values()].filter((xs) => xs.length >= 2).map((xs) => {
    const m = avg(xs);
    return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
  });
  const avgSpread = avg(spreads);
  // max possible σ on a 0–5 scale is 2.5 (half at S, half at F)
  const consensus = spreads.length ? Math.round((1 - avgSpread / 2.5) * 100) : 100;

  const byVoter = new Map<string, Vote[]>();
  // what the others gave each member (self-bias)
  const fromOthers = new Map<string, number[]>();
  for (const v of votes) {
    const mine = byVoter.get(v.voterId);
    if (mine) mine.push(v);
    else byVoter.set(v.voterId, [v]);
    if (v.voterId !== v.targetId) {
      const got = fromOthers.get(v.targetId);
      if (got) got.push(TIER_SCORE[v.tier]);
      else fromOthers.set(v.targetId, [TIER_SCORE[v.tier]]);
    }
  }
  const voters: VoterStats[] = [...byVoter].map(([voterId, vs]) => {
    const given = vs.map((v) => TIER_SCORE[v.tier]);
    const rmse = Math.sqrt(avg(vs.map((v) => (TIER_SCORE[v.tier] - (targetMean.get(v.targetId) ?? 0)) ** 2)));
    const self = vs.find((v) => v.targetId === voterId);
    const others = fromOthers.get(voterId) ?? [];
    const selfBias = self && others.length ? TIER_SCORE[self.tier] - avg(others) : null;
    return { voterId, mean: round2(avg(given)), rmse: round2(rmse), selfBias: selfBias === null ? null : round2(selfBias) };
  });

  const pick = (xs: VoterStats[], score: (v: VoterStats) => number) =>
    xs.length >= 2 ? xs.reduce((best, v) => (score(v) > score(best) ? v : best)) : null;
  const withSelf = voters.filter((v) => v.selfBias !== null);

  return {
    votes: scores.length,
    mean: round2(mean),
    variance: round2(variance),
    stddev: round2(Math.sqrt(variance)),
    avgSpread: round2(avgSpread),
    consensus,
    voters,
    generous: pick(voters, (v) => v.mean),
    harsh: pick(voters, (v) => -v.mean),
    aligned: pick(voters, (v) => -v.rmse),
    contrarian: pick(voters, (v) => v.rmse),
    ego: withSelf.length ? withSelf.reduce((b, v) => (v.selfBias! > b.selfBias! ? v : b)) : null,
    modest: withSelf.length ? withSelf.reduce((b, v) => (v.selfBias! < b.selfBias! ? v : b)) : null,
  };
}
