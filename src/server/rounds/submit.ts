import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TIERS } from "@/lib/tiers";
import { badRequest, notFound, HttpError } from "@/lib/errors";
import { nextStreak } from "@/server/streaks";
import { getPreviousRoundDate, getRoundById, getTargets } from "./queries";
import { dayKey } from "@/lib/dates";
import { revealIfAllPlayed } from "./reveal";
import { missingTargetsFor } from "./targets";

const { submissions, placements, user } = schema;

export const submissionSchema = z.object({
  roundId: z.string().uuid(),
  placements: z
    .array(
      z.object({
        targetId: z.string().min(1).max(64),
        tier: z.enum(TIERS),
        position: z.number().int().min(0).max(999),
      }),
    )
    .min(1)
    .max(500),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

/** Placements must cover exactly the round's snapshotted members, once each. */
export function validatePlacements(input: SubmissionInput["placements"], targetIds: string[]) {
  const expected = new Set(targetIds);
  const seen = new Set<string>();
  for (const p of input) {
    if (!expected.has(p.targetId)) throw badRequest("Membre inconnu dans cette tier list");
    if (seen.has(p.targetId)) throw badRequest("Un membre est placé deux fois");
    seen.add(p.targetId);
  }
  if (seen.size !== expected.size) throw badRequest("Place tous les membres avant de valider");
}

export async function submitTierList(voterId: string, raw: unknown) {
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Tier list invalide");
  const input = parsed.data;

  const round = await getRoundById(input.roundId);
  if (!round) throw notFound("Round introuvable");

  const [existing] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.roundId, round.id), eq(submissions.voterId, voterId)))
    .limit(1);

  // Already played: only accept the members added since (complement), keep the rest.
  if (existing) {
    const missing = await missingTargetsFor(round.id, voterId);
    if (!missing.length) throw new HttpError(409, "Tu as déjà joué cette tier list");
    validatePlacements(input.placements, missing);
    await db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ tier: string; next: number }>(sql`
        select tier, coalesce(max(position), -1) + 1 as next
        from ${placements} where submission_id = ${existing.id} group by tier
      `);
      const next: Record<string, number> = Object.fromEntries(rows.map((r) => [r.tier, Number(r.next)]));
      const ordered = [...input.placements].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.position - b.position);
      await tx
        .insert(placements)
        .values(ordered.map((p) => ({ submissionId: existing.id, targetId: p.targetId, tier: p.tier, position: (next[p.tier] = (next[p.tier] ?? 0) + 1) - 1 })))
        .onConflictDoNothing();
    });
    return { roundDate: round.date };
  }

  const targets = await getTargets(round.id);
  validatePlacements(input.placements, targets.map((t) => t.id));

  // streak only for today's round (late answers on archives never count)
  const isCurrent = round.date === dayKey();
  const isLate = !!round.revealedAt;

  // normalise positions per tier (0..n) in the order given
  const counters: Record<string, number> = {};
  const rows = [...input.placements]
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.position - b.position)
    .map((p) => ({ targetId: p.targetId, tier: p.tier, position: (counters[p.tier] = (counters[p.tier] ?? -1) + 1) }));

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(submissions)
      .values({ roundId: round.id, voterId, isLate })
      .onConflictDoNothing()
      .returning({ id: submissions.id });
    if (!inserted.length) throw new HttpError(409, "Tu as déjà joué cette tier list");
    const submissionId = inserted[0].id;
    await tx.insert(placements).values(rows.map((r) => ({ ...r, submissionId })));

    // Streak: only for the current round (late answers on archives don't count)
    if (isCurrent) {
      const [u] = await tx
        .select({ streak: user.streak, last: user.lastPlayedRoundDate })
        .from(user)
        .where(eq(user.id, voterId))
        .for("update");
      const prev = await getPreviousRoundDate(round.date);
      const streak = nextStreak({ current: u.streak, lastPlayed: u.last, roundDate: round.date, previousRoundDate: prev });
      await tx.update(user).set({ streak, lastPlayedRoundDate: round.date }).where(eq(user.id, voterId));
    }
  });
  if (!round.revealedAt) await revealIfAllPlayed(round.id);
  return { roundDate: round.date };
}
