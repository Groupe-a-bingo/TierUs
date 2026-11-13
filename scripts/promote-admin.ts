/**
 * Promote an existing account to admin (and validate it). Server-side only:
 * admins are never granted by signing up with a special email.
 *   npm run admin:promote -- someone@example.com [--yes]
 *
 * Emails aren't verified (no mail is ever sent): anyone may have signed up
 * with this address before its owner. The script shows the account (name,
 * sign-up date, photo) and asks for confirmation before promoting it.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { addMemberToActiveRounds } from "@/server/rounds/targets";
import { lockMembership } from "@/server/rounds/lock";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run admin:promote -- <email> [--yes]");
    process.exit(1);
  }
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (!u) {
    console.error(`No account with email ${email} — sign up first, then run this again.`);
    process.exit(1);
  }

  console.log(`Account for ${email}:`);
  console.log(`  name:       ${u.name}`);
  console.log(`  signed up:  ${u.createdAt.toISOString()}`);
  console.log(`  status:     ${u.status} (${u.role})`);
  console.log(`  photo:      ${u.avatarFileId ? "yes" : "no"}`);
  console.log("Emails are not verified: check that this is really your account (name, sign-up time) before going on.");
  if (!args.includes("--yes")) {
    if (!process.stdin.isTTY) {
      console.error("Not a terminal: re-run with --yes once you've checked the account above.");
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Type "yes" to promote this account to admin: ');
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }
  await db.transaction(async (tx) => {
    await lockMembership(tx); // same lock as the draws (see src/server/rounds/lock.ts)
    await tx.update(schema.user).set({ role: "admin", status: "active", updatedAt: new Date() }).where(eq(schema.user.id, u.id));
    // an account becoming active joins every tier list still active, like a validated member
    if (u.status !== "active") await addMemberToActiveRounds(u.id, tx);
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
