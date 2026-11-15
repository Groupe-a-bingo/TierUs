import "server-only";
import { db, schema, type Tx } from "@/db";
import type { AuditAction } from "@/lib/audit-actions";

/** Pass the transaction of the change itself: the change and its log line commit (or fail) together. */
export async function audit(
  actorId: string | null,
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  meta?: Record<string, unknown>,
  tx: Tx | typeof db = db,
) {
  await tx.insert(schema.auditLog).values({ actorId, action, targetType, targetId, meta });
}
