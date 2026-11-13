import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TIERS, type Tier } from "@/lib/tiers";
import { badRequest, forbidden, notFound, HttpError } from "@/lib/errors";
import { getTargets } from "./queries";
import { missingTargetsFor } from "./targets";
import { lockMembershipShared } from "./lock";

const { rounds, submissions, placements } = schema;

const submissionSchema = z.object({
  roundId: z.string().uuid(),
  /** the idea the member was shown (refused if the tier list was re-rolled since) */
  ideaId: z.string().uuid().optional(),
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
type SubmissionInput = z.infer<typeof submissionSchema>;

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

/** Positions renumbered 0..n per tier, in tier order then the order given. */
function normalise(input: SubmissionInput["placements"], start: Partial<Record<Tier, number>> = {}) {
  const next = { ...start };
  return [...input]
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.position - b.position)
    .map((p) => ({ targetId: p.targetId, tier: p.tier, position: (next[p.tier] = (next[p.tier] ?? -1) + 1) }));
}

/**
 * Save a member's tier list. Voting stays open forever: an answer after the
 * TTL is accepted (flagged late) and only misses the personal counter, which
 * is derived from `submitted_at < expires_at` of the first answer.
 *
 * Only the tier list's members answer it: someone who joined after it was
 * archived isn't in it (their vote would change a past result).
 *
 * One transaction, holding:
 * - a share lock on the round (a re-roll locks it FOR UPDATE): the idea can't
 *   switch under the answer; `ideaId` (the idea the member saw) is checked too;
 * - the shared membership lock: no validation / ban changes the targets
 *   between the check and the insert.
 */
export async function submitTierList(voterId: string, raw: unknown, now = new Date()) {
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Tier list invalide");
  const input = parsed.data;

  return db.transaction(async (tx) => {
    await lockMembershipShared(tx);
    const [round] = await tx.select().from(rounds).where(eq(rounds.id, input.roundId)).for("share").limit(1);
    if (!round) throw notFound("Tier list introuvable");
    if (input.ideaId && input.ideaId !== round.ideaId) throw new HttpError(409, "L'idée de cette tier list vient de changer : recharge la page");

    const targets = await getTargets(round.id, tx);
    if (!targets.some((t) => t.id === voterId)) throw forbidden("Tu ne fais pas partie de cette tier list");

    // locked: a double click can't complete the same answer twice at once
    const [existing] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.roundId, round.id), eq(submissions.voterId, voterId)))
      .for("update")
      .limit(1);

    // Already played: only accept the members added since (complement), keep the rest.
    // The submission (and its date) is unchanged, so the counter can't count it twice.
    if (existing) {
      const missing = await missingTargetsFor(round.id, voterId, tx);
      if (!missing.length) throw new HttpError(409, "Tu as déjà joué cette tier list");
      validatePlacements(input.placements, missing);
      const { rows } = await tx.execute<{ tier: Tier; last: number }>(sql`
        select tier, max(position) as last from ${placements} where submission_id = ${existing.id} group by tier
      `);
      const start = Object.fromEntries(rows.map((r) => [r.tier, Number(r.last)]));
      await tx.insert(placements).values(normalise(input.placements, start).map((r) => ({ ...r, submissionId: existing.id })));
      return { roundId: round.id };
    }

    validatePlacements(input.placements, targets.map((t) => t.id));
    const inserted = await tx
      .insert(submissions)
      .values({ roundId: round.id, voterId, submittedAt: now, isLate: now.getTime() >= round.expiresAt.getTime() })
      .onConflictDoNothing()
      .returning({ id: submissions.id });
    if (!inserted.length) throw new HttpError(409, "Tu as déjà joué cette tier list");
    const submissionId = inserted[0].id;
    await tx.insert(placements).values(normalise(input.placements).map((r) => ({ ...r, submissionId })));
    return { roundId: round.id };
  });
}
