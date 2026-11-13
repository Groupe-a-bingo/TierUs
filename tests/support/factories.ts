import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tier } from "@/lib/tiers";
import { drawExtra } from "@/server/rounds/draw";

/**
 * Wipe every table of the schema (integration DB only, see integration-setup.ts).
 * Listed from the database itself: a new table can't be forgotten.
 */
export async function resetDb() {
  const { rows } = await db.execute<{ name: string }>(sql`
    select quote_ident(tablename) as name from pg_tables
    where schemaname = 'public' and tablename <> '__drizzle_migrations'
  `);
  await db.execute(sql.raw(`truncate table ${rows.map((r) => r.name).join(", ")} restart identity cascade`));
}

/** Resolves once some other connection is waiting on a lock (proves a test really blocks). */
export async function waitUntilBlockedOnLock(timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { rows } = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
    `);
    if (rows[0]?.n) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("No transaction ended up waiting on a lock");
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
      avatarFileId: null,
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

/**
 * A tier list active right now, whatever the time the suite runs (the daily
 * one is only due from 08:00 Paris, so tests using the real clock use this).
 */
export const drawActive = (ttlHours = 24) => drawExtra(ttlHours);

/** Submit a full tier list for `voter` with tier picked by `pick(targetIndex)`. */
export function placementsFor(targets: { id: string }[], pick: (i: number) => Tier) {
  return targets.map((t, i) => ({ targetId: t.id, tier: pick(i), position: i }));
}
