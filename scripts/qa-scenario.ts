/**
 * Dev-only: rebuilds the local database into a UI test scenario. Everything
 * but the admin accounts is wiped first (back the database up before!).
 *   npx tsx --conditions react-server scripts/qa-scenario.ts empty|small|big
 * empty: a fresh install (no members, ideas, tier lists).
 * small: 3 members, a few ideas, one daily running, one archive, 2 messages.
 * big:   60 members (max-length names), 40 sign-ups waiting, ~400 ideas
 *        (max-length titles and descriptions), 25 archives, a running daily
 *        with 200 messages, a running extra one not played by the admin.
 * The admin (role admin) answers the dailies, so their results and chat show.
 * Pending sign-up to view /pending: pending@qa.tierus.test / qaqaqaqa123
 */
import "dotenv/config";
import { eq, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool, schema } from "@/db";
import { auth } from "@/lib/auth";
import { saveAvatar, deleteStored } from "@/lib/storage";
import { TIERS, type Tier } from "@/lib/tiers";
import { REACTION_EMOJIS } from "@/lib/reactions";
import { COMMENT_MAX, IDEA_DESCRIPTION_MAX, IDEA_TITLE_MAX } from "@/lib/limits";
import { HOUR_MS } from "@/lib/dates";
import { setMemberStatus } from "@/server/members";
import { drawDaily, drawExtra } from "@/server/rounds/draw";
import { submitTierList } from "@/server/rounds/submit";
import { getTargets } from "@/server/rounds/queries";
import { getDrawHour } from "@/server/settings";

const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
  console.error(`qa-scenario only runs against a local dev database (DATABASE_URL host: "${dbHost}")`);
  process.exit(1);
}

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const chance = (p: number) => Math.random() < p;
const FIRST = ["Inès", "Hugo", "Léa", "Malik", "Chloé", "Théo", "Sarah", "Yanis", "Camille", "Nathan", "Jade", "Rayan", "Manon", "Lucas", "Zoé", "Enzo"];
const LONG_NAME = "Maximilien-Alexandre de la Roche"; // 32 chars
const LOREM =
  "Franchement je ne m'attendais pas du tout à ce classement, on en reparle demain mais je pense sincèrement que certains ont voté avec le cœur plutôt qu'avec la tête et ça se voit dans la moyenne finale ";

async function photo(): Promise<Buffer> {
  const hue = Math.floor(Math.random() * 360);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="hsl(${hue},65%,60%)"/><circle cx="128" cy="140" r="78" fill="#f1c27d"/><circle cx="100" cy="132" r="9" fill="#222"/><circle cx="156" cy="132" r="9" fill="#222"/><path d="M100 160 Q128 190 156 160" stroke="#222" stroke-width="7" fill="none"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Users inserted directly (fast); only the /pending account gets a real password. */
async function makeUsers(n: number, status: "active" | "pending", longEvery = 7): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const name = i % longEvery === 3 ? LONG_NAME : `${pick(FIRST)} ${i + 1}`;
    const [u] = await db
      .insert(schema.user)
      .values({ id: crypto.randomUUID(), name, email: `qa-${status}-${i}-${crypto.randomUUID().slice(0, 4)}@qa.tierus.test`, emailVerified: false, status: "pending" })
      .returning({ id: schema.user.id });
    if (chance(0.7)) {
      const { relPath, mime } = await saveAvatar(await photo());
      const [f] = await db.insert(schema.files).values({ ownerId: u.id, path: relPath, mime }).returning({ id: schema.files.id });
      await db.update(schema.user).set({ avatarFileId: f.id }).where(eq(schema.user.id, u.id));
    }
    if (status === "active") await setMemberStatus(u.id, "active", null);
    ids.push(u.id);
  }
  return ids;
}

async function makeIdeas(n: number, status: "approved" | "pending" | "rejected", authors: string[]) {
  const rows = Array.from({ length: n }, (_, i) => {
    const long = i % 9 === 4;
    const title = long ? `Qui ${"serait le plus capable de survivre une semaine entière sans téléphone ni internet ".repeat(3)}`.slice(0, IDEA_TITLE_MAX) : `Qui est le plus ${pick(["drôle", "têtu", "fêtard", "en retard", "stylé", "chanceux"])} n°${i + 1}`;
    const description = long ? LOREM.repeat(4).slice(0, IDEA_DESCRIPTION_MAX) : chance(0.5) ? "Sans forcer" : null;
    return { title, description, status, authorId: authors.length ? pick(authors) : null };
  });
  for (let i = 0; i < rows.length; i += 200) await db.insert(schema.ideas).values(rows.slice(i, i + 200));
}

const rep = new Map<string, number>();
async function answer(voter: string, roundId: string, at?: Date) {
  const targets = await getTargets(roundId);
  const tier = (id: string): Tier => {
    if (!rep.has(id)) rep.set(id, Math.random() * 5);
    return TIERS[Math.max(0, Math.min(5, Math.round(rep.get(id)! + (Math.random() - 0.5) * 2.5)))];
  };
  await submitTierList(voter, { roundId, placements: targets.map((t, i) => ({ targetId: t.id, tier: tier(t.id), position: i })) }, at);
}

async function chat(roundId: string, authors: string[], n: number, start: Date) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const len = pick([8, 30, 120, 400, COMMENT_MAX]);
    const body = i % 50 === 7 ? "https://exemple.fr/un-lien-tres-long-sans-espaces-pour-tester-le-retour-a-la-ligne-dans-les-bulles-de-discussion-aaaaaaaaaaaaaaaaaaaa" : (LOREM.repeat(6).slice(0, len).trim() || "ok");
    const [c] = await db
      .insert(schema.comments)
      .values({ roundId, userId: pick(authors), body, replyToId: ids.length && chance(0.25) ? pick(ids) : null, createdAt: new Date(start.getTime() + i * 60_000) })
      .returning({ id: schema.comments.id });
    ids.push(c.id);
    if (chance(0.3)) for (const u of authors.filter(() => chance(0.15))) await db.insert(schema.reactions).values({ roundId, commentId: c.id, userId: u, emoji: pick(REACTION_EMOJIS) }).onConflictDoNothing();
  }
  for (const u of authors.filter(() => chance(0.6))) await db.insert(schema.reactions).values({ roundId, userId: u, emoji: pick(REACTION_EMOJIS) }).onConflictDoNothing();
}

/** Everything but the admins (and their sessions): a fresh install. */
async function wipe() {
  const files = await db.select({ path: schema.files.path }).from(schema.files).innerJoin(schema.user, eq(schema.user.id, schema.files.ownerId)).where(ne(schema.user.role, "admin"));
  await db.execute(sql`truncate table rounds, ideas, audit_log, app_settings restart identity cascade`);
  await db.delete(schema.user).where(ne(schema.user.role, "admin"));
  for (const f of files) await deleteStored(f.path).catch(() => {});
}

async function admin(): Promise<string> {
  const [a] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.role, "admin")).limit(1);
  if (!a) throw new Error("No admin account");
  return a.id;
}

/** A past daily `daysAgo` days back, answered by `share` of the members. */
async function pastDaily(daysAgo: number, members: string[], share: number, messages = 0) {
  const start = new Date(Date.now() - daysAgo * 24 * HOUR_MS);
  start.setUTCHours((await getDrawHour()) - 1, 5, 0, 0);
  const res = await drawDaily(start, { actorId: null, trigger: "manual" });
  if (res.status !== "created") return null;
  const players = members.filter(() => chance(share));
  for (const p of players) await answer(p, res.roundId, new Date(start.getTime() + Math.random() * 20 * HOUR_MS));
  if (messages && players.length) await chat(res.roundId, players, messages, new Date(start.getTime() + HOUR_MS));
  return res.roundId;
}

async function main() {
  const mode = process.argv[2];
  if (!["empty", "small", "big"].includes(mode)) throw new Error("Usage: qa-scenario.ts empty|small|big");
  await wipe();
  const me = await admin();
  if (mode === "empty") return console.log("empty: admin only");

  // a real pending account, to look at /pending
  await auth.api.signUpEmail({ body: { name: "Compte en attente", email: "pending@qa.tierus.test", password: "qaqaqaqa123" } });

  if (mode === "small") {
    const members = await makeUsers(3, "active", 99);
    await makeIdeas(4, "approved", members);
    await makeIdeas(1, "pending", members);
    await pastDaily(2, [...members, me], 1, 3);
    const today = await pastDaily(0.5, [...members, me], 1, 2);
    console.log(`small: daily ${today}`);
    return;
  }

  const members = await makeUsers(60, "active");
  await makeUsers(40, "pending");
  await makeIdeas(330, "approved", members);
  await makeIdeas(80, "pending", members);
  await makeIdeas(20, "rejected", members);
  for (let d = 26; d >= 2; d--) await pastDaily(d, [...members, me], 0.7, d % 5 === 0 ? 30 : 4);
  // running daily (drawn ~12 h ago): everyone answered, 200 messages
  const daily = await pastDaily(0.5, [...members, me], 1, 0);
  if (daily) await chat(daily, [...members, me], 200, new Date(Date.now() - 11 * HOUR_MS));
  // a running extra one the admin hasn't played
  const extra = await drawExtra(48, new Date(), null);
  if (extra.status === "created") for (const m of members.slice(0, 20)) await answer(m, extra.roundId);
  console.log(`big: daily ${daily}, extra ${extra.status === "created" ? extra.roundId : extra.status}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

