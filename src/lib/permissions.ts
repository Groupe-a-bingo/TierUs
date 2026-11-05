import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { forbidden, unauthorized } from "@/lib/errors";

export type CurrentUser = typeof schema.user.$inferSelect;

/**
 * Loads the session AND re-reads the user row from the DB, so role/status
 * changes (validation, ban, promotion) apply immediately, not at next login.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, s.user.id)).limit(1);
  return u ?? null;
});

export const isModerator = (u: Pick<CurrentUser, "role">) => u.role === "moderator" || u.role === "admin";

/* ----- For server actions / route handlers: throw HttpError ----- */

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  if (u.status === "rejected") throw forbidden("Compte refusé");
  return u;
}

export async function requireActiveUser(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.status !== "active") throw forbidden("Compte en attente de validation");
  return u;
}

export async function requireModerator(): Promise<CurrentUser> {
  const u = await requireActiveUser();
  if (!isModerator(u)) throw forbidden();
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireActiveUser();
  if (u.role !== "admin") throw forbidden();
  return u;
}

/* ----- For pages: redirect instead of throwing ----- */

export async function pageUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.status !== "active") redirect("/pending");
  return u;
}

export async function pageModerator(): Promise<CurrentUser> {
  const u = await pageUser();
  if (!isModerator(u)) redirect("/");
  return u;
}
