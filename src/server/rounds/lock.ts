import { sql } from "drizzle-orm";
import type { Tx } from "@/db";

/**
 * Arbitrary constant key of the "tier list membership" advisory lock.
 * Held (transaction-scoped) by every path that creates a tier list and
 * snapshots its members, or that changes who is an active member:
 * - drawing a tier list (daily or extra),
 * - validating / re-admitting / banning a member, promoting an admin.
 * Serialising them guarantees that a member validated while a draw runs is
 * either in the draw's snapshot or added to the new tier list afterwards,
 * and that two daily draws for the same day can't both start.
 */
const MEMBERSHIP_LOCK_KEY = 727_274_001;

/** Take the lock first in the transaction; it's released at commit / rollback. */
export async function lockMembership(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${sql.raw(String(MEMBERSHIP_LOCK_KEY))})`);
}
