import "server-only";
import { db, schema, type Tx } from "@/db";

export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  meta?: Record<string, unknown>,
  tx: Tx | typeof db = db,
) {
  await tx.insert(schema.auditLog).values({ actorId, action, targetType, targetId, meta });
}
