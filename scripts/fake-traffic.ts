/**
 * Dev-only fake traffic on the local database, through the app's own server
 * logic (sign-up, validation, ideas, draws, answers, chat, reactions).
 *   npx tsx --conditions react-server scripts/fake-traffic.ts seed [members=12] [days=6]
 *   npx tsx --conditions react-server scripts/fake-traffic.ts live [seconds-between-actions=5]
 *   npx tsx --conditions react-server scripts/fake-traffic.ts clean
 * seed: bot accounts (most with a generated photo), ideas (approved, waiting,
 *       refused), past daily tier lists with answers, messages and reactions.
 * live: a bot does something every few seconds (answers, chats, reacts,
 *       proposes an idea, rarely signs up). Ctrl-C to stop.
 * clean: deletes the bot accounts (their answers, messages and photos go with them).
 * Bots sign in with <name>@bots.tierus.test / BOT_PASSWORD.
 */
import "dotenv/config";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool, schema } from "@/db";
import { auth } from "@/lib/auth";
import { saveAvatar, deleteStored } from "@/lib/storage";
import { TIERS, type Tier } from "@/lib/tiers";
import { REACTION_EMOJIS } from "@/lib/reactions";
import { HOUR_MS } from "@/lib/dates";
import { getDrawHour } from "@/server/settings";
import { setMemberStatus } from "@/server/members";
import { createIdea, reviewIdea } from "@/server/ideas";
import { drawDaily } from "@/server/rounds/draw";
import { submitTierList } from "@/server/rounds/submit";
import { getActiveRounds, getTargets } from "@/server/rounds/queries";

// writes as fake accounts: never against a real database
const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
  console.error(`fake-traffic only runs against a local dev database (DATABASE_URL host: "${dbHost}")`);
  process.exit(1);
}

const BOT_DOMAIN = "bots.tierus.test";
const BOT_PASSWORD = "botbotbot123";

const NAMES = [
  "Inès", "Hugo", "Léa", "Malik", "Chloé", "Théo", "Sarah", "Yanis", "Camille", "Nathan", "Jade", "Rayan",
  "Manon", "Lucas", "Zoé", "Enzo", "Lina", "Noah", "Emma", "Adam", "Louise", "Sacha", "Nina", "Tom",
];

const IDEAS: [string, string?][] = [
  ["Qui survivrait le plus longtemps dans une apocalypse zombie", "Du stratège au premier mordu"],
  ["Qui serait le meilleur prof", "Pédagogie, patience, charisme"],
  ["Qui finirait célèbre", "Pour le meilleur ou pour le pire"],
  ["Qui cuisine le mieux", "Les vrais chefs, pas ceux qui font des pâtes"],
  ["Qui est le plus en retard", "Les champions du « j'arrive dans 5 min »"],
  ["Qui gagnerait à Koh-Lanta"],
  ["Qui a le meilleur goût musical", "Les playlists qu'on vole"],
  ["Qui serait le pire colocataire"],
  ["Qui est le plus drôle", "Sans forcer"],
  ["Qui garderait un secret", "Coffre-fort ou haut-parleur"],
  ["Qui serait président", "Programme non fourni"],
  ["Qui s'habille le mieux"],
  ["Qui est le plus mauvais perdant", "Monopoly, Mario Kart, débats"],
  ["Qui partirait vivre à l'autre bout du monde"],
  ["Qui est le plus fêtard", "Premier arrivé, dernier parti"],
  ["Qui ferait le meilleur parent"],
  ["Qui gagnerait un combat de pouces"],
  ["Qui a le meilleur rire"],
  ["Qui serait le plus utile sur une île déserte"],
  ["Qui envoie les meilleurs mèmes"],
  ["Qui est le plus têtu"],
  ["Qui a le plus de chance", "Tirages, loteries, places de parking"],
];

const MESSAGES = [
  "Mais pourquoi je suis en D 😭", "Le S est mérité franchement", "Qui m'a mis en F ?? Je veux des noms",
  "Résultat très juste, rien à dire", "Je conteste ce classement", "Le podium est carrément logique",
  "Vous êtes durs avec moi là", "Ok j'avoue c'est vrai", "MDR la moyenne", "Personne n'a osé mettre quelqu'un en S ?",
  "Celle-là était facile", "J'ai hésité longtemps pour le A", "C'est un complot", "Bien vu pour le top 3",
  "Je m'attendais pas à être aussi haut", "Demain je me venge", "Trop dur de choisir sur celle-ci",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const chance = (p: number) => Math.random() < p;
const clampTier = (i: number): Tier => TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.round(i)))];

/** A simple generated face (no fonts needed), as a PNG for saveAvatar. */
async function fakePhoto(): Promise<Buffer> {
  const hue = Math.floor(Math.random() * 360);
  const skin = pick(["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"]);
  const hair = pick(["#2c1b0e", "#6b4226", "#d4a017", "#111", "#b5651d", "#7a3b9b"]);
  const mouth = chance(0.5) ? `<path d="M100 160 Q128 190 156 160" stroke="#222" stroke-width="7" fill="none" stroke-linecap="round"/>` : `<ellipse cx="128" cy="168" rx="16" ry="10" fill="#222"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="hsl(${hue},70%,62%)"/>
    <circle cx="128" cy="140" r="78" fill="${skin}"/>
    <path d="M50 120 Q128 20 206 120 Q170 80 128 82 Q86 80 50 120Z" fill="${hair}"/>
    <circle cx="100" cy="132" r="9" fill="#222"/><circle cx="156" cy="132" r="9" fill="#222"/>
    ${mouth}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function botIds(): Promise<{ id: string; name: string; status: string }[]> {
  return db.select({ id: schema.user.id, name: schema.user.name, status: schema.user.status }).from(schema.user).where(like(schema.user.email, `%@${BOT_DOMAIN}`));
}

async function adminId(): Promise<string | null> {
  const [a] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.role, "admin")).limit(1);
  return a?.id ?? null;
}

/** A real sign-up (Better Auth), then an optional photo. Lands as "pending". */
async function signUpBot(name: string, withPhoto: boolean): Promise<string> {
  const email = `${name.normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase()}-${crypto.randomUUID().slice(0, 4)}@${BOT_DOMAIN}`;
  const res = await auth.api.signUpEmail({ body: { name, email, password: BOT_PASSWORD } });
  const id = res.user.id;
  if (withPhoto) {
    const { relPath, mime } = await saveAvatar(await fakePhoto());
    const [f] = await db.insert(schema.files).values({ ownerId: id, path: relPath, mime }).returning({ id: schema.files.id });
    await db.update(schema.user).set({ avatarFileId: f.id, updatedAt: new Date() }).where(eq(schema.user.id, id));
  }
  return id;
}

/** Each bot has a "reputation": answers lean towards it, so averages mean something. */
const reputation = new Map<string, number>();
const repOf = (id: string) => {
  if (!reputation.has(id)) reputation.set(id, Math.random() * 5);
  return reputation.get(id)!;
};

async function answer(voterId: string, roundId: string, at?: Date) {
  const targets = await getTargets(roundId);
  const tiers = targets.map((t) => clampTier(repOf(t.id) + (Math.random() - 0.5) * 2.5));
  const placements = targets.map((t, i) => ({ targetId: t.id, tier: tiers[i], position: i }));
  await submitTierList(voterId, { roundId, placements }, at);
}

async function comment(userId: string, roundId: string, at?: Date): Promise<string> {
  const [prev] = chance(0.35)
    ? await db.select({ id: schema.comments.id }).from(schema.comments).where(and(eq(schema.comments.roundId, roundId), isNull(schema.comments.deletedAt))).orderBy(sql`random()`).limit(1)
    : [];
  const [c] = await db
    .insert(schema.comments)
    .values({ roundId, userId, body: pick(MESSAGES), replyToId: prev?.id ?? null, ...(at ? { createdAt: at } : {}) })
    .returning({ id: schema.comments.id });
  return c.id;
}

async function react(userId: string, roundId: string, commentId: string | null, at?: Date) {
  await db
    .insert(schema.reactions)
    .values({ roundId, commentId, userId, emoji: pick(REACTION_EMOJIS), ...(at ? { createdAt: at } : {}) })
    .onConflictDoNothing();
}

/** Has this member answered this tier list? */
async function answered(roundId: string, userId: string) {
  const [s] = await db
    .select({ id: schema.submissions.id })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.roundId, roundId), eq(schema.submissions.voterId, userId)))
    .limit(1);
  return !!s;
}

async function seed(members: number, days: number) {
  const admin = await adminId();
  console.log(`Creating ${members} bots…`);
  const ids: string[] = [];
  for (const name of NAMES.slice(0, members)) {
    const id = await signUpBot(name, chance(0.8));
    await setMemberStatus(id, "active", null);
    ids.push(id);
  }
  // two sign-ups still waiting for a moderator
  for (const name of NAMES.slice(members, members + 2)) await signUpBot(name, chance(0.5));

  console.log("Proposing ideas…");
  const created: { id: string; title: string; description: string | null }[] = [];
  for (const [title, description] of IDEAS) {
    await createIdea({ id: pick(ids), isModerator: false }, { title, description: description ?? null });
    const [i] = await db.select({ id: schema.ideas.id, title: schema.ideas.title, description: schema.ideas.description }).from(schema.ideas).where(eq(schema.ideas.title, title)).orderBy(sql`created_at desc`).limit(1);
    created.push(i);
  }
  // with validation on, bots' ideas wait: approve most, refuse one, leave a couple waiting
  const waiting = await db.select({ id: schema.ideas.id }).from(schema.ideas).where(and(eq(schema.ideas.status, "pending"), inArray(schema.ideas.id, created.map((c) => c.id))));
  const waitingIds = new Set(waiting.map((w) => w.id));
  const toReview = created.filter((c) => waitingIds.has(c.id));
  for (const [n, i] of toReview.entries()) {
    if (n >= toReview.length - 2) break;
    await reviewIdea(i.id, n === 0 ? "rejected" : "approved", { title: i.title, description: i.description }, admin);
  }

  console.log(`Playing the last ${days} days…`);
  const drawHour = await getDrawHour();
  for (let d = days; d >= 1; d--) {
    const start = new Date(Date.now() - d * 24 * HOUR_MS);
    // just after the draw hour that day, Paris time (UTC+1 in winter, UTC+2 in summer)
    start.setUTCHours(drawHour - 1, 5, 0, 0);
    const res = await drawDaily(start, { actorId: null, trigger: "manual" });
    if (res.status !== "created") {
      console.log(`  day -${d}: ${res.status}`);
      continue;
    }
    const players = ids.filter(() => chance(0.85));
    for (const p of players) {
      const at = new Date(start.getTime() + Math.random() * 20 * HOUR_MS);
      await answer(p, res.roundId, at);
      if (chance(0.5)) {
        const cid = await comment(p, res.roundId, new Date(at.getTime() + 60_000));
        for (const r of ids.filter(() => chance(0.2))) if (players.includes(r)) await react(r, res.roundId, cid, new Date(at.getTime() + 120_000));
      }
      if (chance(0.5)) await react(p, res.roundId, null, new Date(at.getTime() + 30_000));
    }
    console.log(`  day -${d}: ${players.length} answers`);
  }

  // the tier lists running now: about half the bots already answered
  for (const { round } of await getActiveRounds()) {
    const targets = new Set((await getTargets(round.id)).map((t) => t.id));
    for (const p of ids.filter((id) => targets.has(id) && chance(0.5))) {
      if (await answered(round.id, p)) continue;
      await answer(p, round.id);
      if (chance(0.4)) await comment(p, round.id);
    }
  }
  console.log(`Done. Bots sign in with <name>@${BOT_DOMAIN} / ${BOT_PASSWORD}`);
}

/** One random action by one random bot. Returns what happened. */
async function tick(): Promise<string> {
  const bots = (await botIds()).filter((b) => b.status === "active");
  if (!bots.length) return "no active bots (run seed first)";
  const bot = pick(bots);
  const active = await getActiveRounds();
  const r = Math.random();

  if (active.length && r < 0.75) {
    const { round, idea } = pick(active);
    const isTarget = (await getTargets(round.id)).some((t) => t.id === bot.id);
    if (!isTarget) return `${bot.name} isn't part of « ${idea.title} »`;
    if (!(await answered(round.id, bot.id))) {
      await answer(bot.id, round.id);
      return `${bot.name} answered « ${idea.title} »`;
    }
    if (r < 0.45) {
      await comment(bot.id, round.id);
      return `${bot.name} wrote in « ${idea.title} »`;
    }
    const [c] = chance(0.5)
      ? await db.select({ id: schema.comments.id }).from(schema.comments).where(and(eq(schema.comments.roundId, round.id), isNull(schema.comments.deletedAt))).orderBy(sql`random()`).limit(1)
      : [];
    await react(bot.id, round.id, c?.id ?? null);
    return `${bot.name} reacted in « ${idea.title} »${c ? " (message)" : ""}`;
  }
  if (r < 0.95) {
    const [title, description] = pick(IDEAS);
    const variant = `${title} ${pick(["(bis)", "en 2030", "en vacances", "sous pression", "un lundi matin"])}`;
    const status = await createIdea({ id: bot.id, isModerator: false }, { title: variant, description: description ?? null });
    // the bank refilled: a missing daily may now be drawn (what the app does after an idea)
    if (status === "approved") await drawDaily(new Date(), { actorId: bot.id, trigger: "idea" });
    return `${bot.name} proposed « ${variant} » (${status})`;
  }
  // keep the sign-up queue short
  if ((await botIds()).filter((b) => b.status === "pending").length >= 2) return `${bot.name} is just browsing`;
  const name = pick(NAMES);
  await signUpBot(name, chance(0.6));
  return `${name} signed up (waiting for a moderator)`;
}

async function live(seconds: number) {
  console.log(`Live traffic: one action every ~${seconds}s. Ctrl-C to stop.`);
  let stop = false;
  process.on("SIGINT", () => (stop = true));
  process.on("SIGTERM", () => (stop = true));
  while (!stop) {
    try {
      console.log(`[${new Date().toLocaleTimeString("fr-FR")}] ${await tick()}`);
    } catch (e) {
      console.log(`[${new Date().toLocaleTimeString("fr-FR")}] skipped: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(seconds * 1000 * (0.5 + Math.random()));
  }
}

async function clean() {
  const bots = await botIds();
  if (!bots.length) return console.log("No bots.");
  const files = await db.select({ path: schema.files.path }).from(schema.files).where(inArray(schema.files.ownerId, bots.map((b) => b.id)));
  await db.delete(schema.user).where(inArray(schema.user.id, bots.map((b) => b.id)));
  for (const f of files) await deleteStored(f.path).catch(() => {});
  console.log(`Deleted ${bots.length} bots (ideas they proposed stay, without author).`);
}

async function main() {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "seed") await seed(Math.min(NAMES.length - 2, Number(a) || 12), Number(b) || 6);
  else if (mode === "live") await live(Number(a) || 5);
  else if (mode === "clean") await clean();
  else {
    console.error("Usage: fake-traffic.ts seed [members] [days] | live [seconds] | clean");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
