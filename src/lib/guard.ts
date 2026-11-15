import "server-only";
import { requireActiveUser, requireAdmin, requireModerator, requireUser, type CurrentUser } from "@/lib/permissions";
import { rateLimit, type LimitName } from "@/lib/rate-limit";

const REQUIRE = { user: requireUser, active: requireActiveUser, moderator: requireModerator, admin: requireAdmin } as const;

/**
 * The opening of every server action / mutating route: who may call it
 * (user = pending accounts too, active, moderator, admin), then its rate
 * limit (per user, plus the global per-IP one), possibly picked from the
 * user (moderators on their own quota). Throws HttpError.
 */
export async function guard(
  level: keyof typeof REQUIRE,
  limit: LimitName | ((u: CurrentUser) => LimitName),
  opts?: { perIp?: boolean },
): Promise<CurrentUser> {
  const u = await REQUIRE[level]();
  await rateLimit(typeof limit === "function" ? limit(u) : limit, u.id, opts);
  return u;
}
