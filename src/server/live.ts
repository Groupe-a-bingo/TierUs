import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Every app setting (idea validation, draw hour): shown on the board, /ideas and /mod. */
const SETTINGS = sql.raw(`(select coalesce(string_agg(key || '=' || value::text, ',' order by key), '') from app_settings)`);

/**
 * Cheap "version" fingerprint of everything that can change on a page.
 * Clients poll it and only re-render when it moves. Works behind any proxy
 * (Cloudflare quick tunnels buffer SSE, so streaming isn't reliable).
 */
/** null when the tier list doesn't exist. */
async function computeRoundVersion(roundId: string): Promise<string | null> {
  const { rows } = await db.execute<{ v: string | null }>(sql`
    select case when not exists (select 1 from rounds where id = ${roundId}) then null else md5(concat_ws('|',
      -- idea (reroll) and active → archived switch
      (select idea_id || (expires_at <= now())::text from rounds where id = ${roundId}),
      (select count(*) from round_targets where round_id = ${roundId}),
      (select count(*) || max(submitted_at)::text from submissions where round_id = ${roundId}),
      (select count(*) from placements p join submissions s on s.id = p.submission_id where s.round_id = ${roundId}),
      (select count(*) || max(created_at)::text || count(deleted_at) from comments where round_id = ${roundId}),
      (select count(*) || coalesce(max(created_at)::text, '') from reactions where round_id = ${roundId}),
      -- a member banned / re-admitted, renamed or with a new photo
      (select coalesce(max(u.updated_at)::text, '') from round_targets rt join "user" u on u.id = rt.user_id where rt.round_id = ${roundId})
    )) end as v
  `);
  return rows[0]?.v ?? null;
}

async function computeBoardVersion(): Promise<string> {
  const { rows } = await db.execute<{ v: string }>(sql`
    select md5(concat_ws('|',
      (select count(*) || coalesce(max(created_at)::text, '') || coalesce(md5(string_agg(idea_id, ',' order by created_at, id)), '') from rounds),
      -- a tier list moving from the home to the archives (expires_at index)
      (select count(*) from rounds where expires_at <= now()),
      (select coalesce(max(updated_at)::text, '') from "user"),
      (select count(*) || coalesce(max(submitted_at)::text, '') from submissions),
      (select count(*) || coalesce(max(created_at)::text, '') || count(deleted_at) from comments),
      (select count(*) || coalesce(max(created_at)::text, '') from reactions),
      (select count(*) from round_targets),
      -- a newcomer placed in an existing answer (complement): podiums move
      (select count(*) from placements),
      -- the bank counter ("empty bank" message)
      (select count(*) from ideas where used_at is null and status = 'approved'),
      -- the draw hour ("next tier list at …")
      ${SETTINGS}
    )) as v
  `);
  return rows[0]?.v ?? "";
}

/** One idea's visible state: status, played, text (edits). */
const IDEA_ROW = sql.raw(`id || status || coalesce(used_at::text, '') || md5(title || coalesce(description, ''))`);

/** /mod: sign-ups and members, every idea, the validation switch, the log, the running tier lists. */
async function computeModVersion(): Promise<string> {
  const { rows } = await db.execute<{ v: string }>(sql`
    select md5(concat_ws('|',
      (select count(*) || coalesce(max(updated_at)::text, '') || coalesce(md5(string_agg(id || status || role, ',' order by id)), '') from "user"),
      (select count(*) || coalesce(md5(string_agg(${IDEA_ROW}, ',' order by id)), '') from ideas),
      ${SETTINGS},
      (select count(*) || coalesce(max(created_at)::text, '') from audit_log),
      (select count(*) || coalesce(max(created_at)::text, '') || coalesce(md5(string_agg(idea_id, ',' order by created_at, id)), '') from rounds),
      (select count(*) from rounds where expires_at <= now())
    )) as v
  `);
  return rows[0]?.v ?? "";
}

/** /ideas: the viewer's own ideas (reviewed, played, edited) and the validation switch. */
async function computeIdeasVersion(userId: string): Promise<string> {
  const { rows } = await db.execute<{ v: string }>(sql`
    select md5(concat_ws('|',
      (select count(*) || coalesce(md5(string_agg(${IDEA_ROW}, ',' order by id)), '') from ideas where author_id = ${userId}),
      ${SETTINGS}
    )) as v
  `);
  return rows[0]?.v ?? "";
}

/*
 * Shared short cache: every client polls every 2s, but the database answers
 * at most once per 1.5s per scope, whatever the number of viewers.
 */
const TTL_MS = 1500;
const cache = new Map<string, { at: number; v: Promise<string | null> }>();

function cached(key: string, compute: () => Promise<string | null>): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const v = compute().then(
    (res) => {
      // unknown ids are not kept: random ids can't fill the cache
      if (res === null) cache.delete(key);
      return res;
    },
    (e) => {
      cache.delete(key);
      throw e;
    },
  );
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return v;
}

export const roundVersion = (roundId: string) => cached(`r:${roundId}`, () => computeRoundVersion(roundId));
export const boardVersion = async () => (await cached("board", computeBoardVersion)) ?? "";
export const modVersion = async () => (await cached("mod", computeModVersion)) ?? "";
export const ideasVersion = async (userId: string) => (await cached(`i:${userId}`, () => computeIdeasVersion(userId))) ?? "";

/** Tests only: forget cached versions. */
export function clearLiveCache() {
  cache.clear();
}
