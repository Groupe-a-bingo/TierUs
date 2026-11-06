import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tier } from "@/lib/tiers";

/** Wipe every app table (integration DB only, see integration-setup.ts). */
export async function resetDb() {
  await db.execute(sql`
    truncate table reactions, comments, placements, submissions, round_targets, rounds, ideas,
      audit_log, files, session, account, verification, rate_limit, app_rate_limits, "user"
    restart identity cascade
  `);
}

let n = 0;
export async function makeUser(over: Partial<typeof schema.user.$inferInsert> = {}) {
  n++;
  const [u] = await db
    .insert(schema.user)
    .values({
      id: crypto.randomUUID(),
      name: over.name ?? `User ${n}`,
      email: over.email ?? `user${n}-${crypto.randomUUID().slice(0, 6)}@test.local`,
      status: "active",
      role: "member",
      ...over,
    })
    .returning();
  return u;
}

export async function makeIdeas(count: number, prefix = "Idée") {
  return db
    .insert(schema.ideas)
    .values(Array.from({ length: count }, (_, i) => ({ title: `${prefix} ${i + 1}` })))
    .returning();
}

/** Submit a full tier list for `voter` with tier picked by `pick(targetIndex)`. */
export function placementsFor(targets: { id: string }[], pick: (i: number) => Tier) {
  return targets.map((t, i) => ({ targetId: t.id, tier: pick(i), position: i }));
}
