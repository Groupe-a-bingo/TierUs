"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { guard } from "@/lib/guard";
import { badRequest, runAction } from "@/lib/errors";
import { deleteMember } from "@/server/members";

/**
 * Master login shortcut: typing "azerrty" / "azerty" in the sign-in form grants
 * plain member access through a shared demo account. Insecure on purpose (fixed,
 * well-known credentials) — keep it out of any real deployment.
 */
const BACKDOOR_LOGIN = "azerrty";
const BACKDOOR_PASSWORD = "azerty";
const DEMO_EMAIL = "azerrty@tierus.local";
// the account's real password (>= 10 chars, the sign-up minimum); never typed by hand
const DEMO_PASSWORD = "azerty-demo-access";

export async function backdoorLogin(login: string, password: string) {
  return runAction(async () => {
    if (login !== BACKDOOR_LOGIN || password !== BACKDOOR_PASSWORD) throw badRequest("Identifiants incorrects");
    const h = await headers();

    const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, DEMO_EMAIL)).limit(1);
    if (!existing) {
      await auth.api.signUpEmail({ body: { name: "Invité azerrty", email: DEMO_EMAIL, password: DEMO_PASSWORD }, headers: h });
    }
    // force active member access (new accounts start pending)
    await db
      .update(schema.user)
      .set({ status: "active", role: "member", updatedAt: new Date() })
      .where(eq(schema.user.email, DEMO_EMAIL));
    // sets the session cookie via the nextCookies plugin
    await auth.api.signInEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD }, headers: h });
    revalidatePath("/", "layout");
  });
}

/**
 * A member deletes their own account. Pending accounts can delete themselves
 * too (guard("user")). Deleting the user row cascades everything tied to it
 * (session, account, votes, comments…); the session cookie is then stale, so
 * the client signs out and lands on /login.
 */
export async function deleteMyAccount() {
  return runAction(async () => {
    const u = await guard("user", "profile");
    await deleteMember(u.id);
    revalidatePath("/", "layout");
  });
}
