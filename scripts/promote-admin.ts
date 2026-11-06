/**
 * Promote an existing account to admin (and validate it). Server-side only:
 * admins are never granted by signing up with a special email.
 *   npm run admin:promote -- someone@example.com
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run admin:promote -- <email>");
    process.exit(1);
  }
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (!u) {
    console.error(`No account with email ${email} — sign up first, then run this again.`);
    process.exit(1);
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.user).set({ role: "admin", status: "active", updatedAt: new Date() }).where(eq(schema.user.id, u.id));
    await tx.insert(schema.auditLog).values({ actorId: null, action: "user.promote_admin", targetType: "user", targetId: u.id, meta: { via: "cli" } });
  });
  console.log(`${u.name} <${email}> is now admin.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
