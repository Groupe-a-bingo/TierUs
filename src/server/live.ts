import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Cheap "version" fingerprint of everything that can change on a page.
 * Clients poll it and only re-render when it moves. Works behind any proxy
 * (Cloudflare quick tunnels buffer SSE, so streaming isn't reliable).
 */
export async function roundVersion(roundId: string): Promise<string> {
  const { rows } = await db.execute<{ v: string }>(sql`
    select md5(concat_ws('|',
      (select coalesce(revealed_at::text, '') || idea_id from rounds where id = ${roundId}),
      (select count(*) from round_targets where round_id = ${roundId}),
      (select count(*) || max(submitted_at)::text from submissions where round_id = ${roundId}),
      (select count(*) from placements p join submissions s on s.id = p.submission_id where s.round_id = ${roundId}),
      (select count(*) || max(created_at)::text || count(deleted_at) from comments where round_id = ${roundId}),
      (select count(*) || coalesce(max(created_at)::text, '') from reactions where round_id = ${roundId})
    )) as v
  `);
  return rows[0]?.v ?? "";
}

export async function boardVersion(): Promise<string> {
  const { rows } = await db.execute<{ v: string }>(sql`
    select md5(concat_ws('|',
      (select count(*) || coalesce(max(created_at)::text, '') || count(revealed_at) from rounds),
      (select count(*) || coalesce(max(submitted_at)::text, '') from submissions),
      (select count(*) || coalesce(max(created_at)::text, '') || count(deleted_at) from comments),
      (select count(*) || coalesce(max(created_at)::text, '') from reactions),
      (select count(*) from round_targets)
    )) as v
  `);
  return rows[0]?.v ?? "";
}
