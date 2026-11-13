/**
 * Dev-only integration check of the daily flow against the local DB.
 *   npx tsx --conditions react-server scripts/flow-check.ts <step>
 * step = "partial" (alice+bob play) | "finish" (admin plays) | "bad" (invalid submissions)
 * Plays the most recent active tier list.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { getActiveRounds, getTargets, getVotes } from "@/server/rounds/queries";
import { aggregate } from "@/server/rounds/aggregate";
import { submitTierList } from "@/server/rounds/submit";
import { TIERS } from "@/lib/tiers";

// writes answers as fixed accounts: never against a real database
const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
  console.error(`flow-check only runs against a local dev database (DATABASE_URL host: "${dbHost}")`);
  process.exit(1);
}

async function uid(name: string) {
  const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.name, name));
  if (!u) throw new Error(`No account named "${name}" (run npm run db:seed and create it first)`);
  return u.id;
}

/** The most recent active tier list. */
async function getCurrentRound() {
  const [active] = await getActiveRounds();
  if (!active) throw new Error("No active tier list");
  return active.round;
}

async function play(name: string, pick: (i: number) => (typeof TIERS)[number]) {
  const round = await getCurrentRound();
  const targets = await getTargets(round.id);
  await submitTierList(await uid(name), {
    roundId: round.id,
    placements: targets.map((t, i) => ({ targetId: t.id, tier: pick(i), position: i })),
  });
  console.log(`${name} played`);
}

async function main() {
  const step = process.argv[2];
  const round = await getCurrentRound();
  if (step === "partial") {
    await play("alice", (i) => TIERS[i % 6]);
    await play("bob", (i) => TIERS[(i + 1) % 6]);
  } else if (step === "bad") {
    const targets = await getTargets(round.id);
    const a = await uid("admin");
    for (const [label, placements] of [
      ["stranger", [...targets.slice(1).map((t) => ({ targetId: t.id, tier: "S", position: 0 })), { targetId: "nope", tier: "S", position: 0 }]],
      ["duplicate", [...targets.slice(1), targets[1]].map((t) => ({ targetId: t.id, tier: "S", position: 0 }))],
      ["bad tier", targets.map((t) => ({ targetId: t.id, tier: "Z", position: 0 }))],
    ] as const) {
      try {
        await submitTierList(a, { roundId: round.id, placements });
        console.log(label, "ACCEPTED (bug!)");
      } catch (e) {
        console.log(label, "rejected:", (e as Error).message);
      }
    }
    try {
      await play("alice", () => "S");
    } catch (e) {
      console.log("double submit rejected:", (e as Error).message);
    }
  } else if (step === "finish") {
    await play("admin", () => "B");
  }
  const [r] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, round.id));
  console.log("expires:", r.expiresAt.toISOString());
  const agg = aggregate(await getVotes(round.id));
  console.log("average:", agg.results.map((x) => `${x.targetId.slice(0, 6)}=${x.tier}(${x.mean})`).join(" "));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
