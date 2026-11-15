export const TIERS = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_SCORE: Record<Tier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

export function scoreToTier(score: number): Tier {
  const r = Math.min(5, Math.max(0, Math.round(score)));
  return TIERS[5 - r];
}

export const isTier = (v: unknown): v is Tier => typeof v === "string" && (TIERS as readonly string[]).includes(v);

export const emptyRows = (): Record<Tier, string[]> =>
  Object.fromEntries(TIERS.map((t) => [t, [] as string[]])) as Record<Tier, string[]>;

/** A score or mean as shown to members: French decimals, at most 2 ("3,45"). */
export const formatScore = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
