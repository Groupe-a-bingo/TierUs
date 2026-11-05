import "server-only";
import { db, schema } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
