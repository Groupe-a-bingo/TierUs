import { guard } from "@/lib/guard";
import { errorResponse, notFound } from "@/lib/errors";
import { isUuid } from "@/lib/dates";
import { boardVersion, roundVersion } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/live?round=<id>  or  /api/live  (board) → { v } */
export async function GET(req: Request) {
  try {
    // a read: its own budget, not the per-IP one meant for mutations
    await guard("active", "live", { perIp: false });
    const round = new URL(req.url).searchParams.get("round");
    if (round && !isUuid(round)) throw notFound();
    const v = round ? await roundVersion(round) : await boardVersion();
    if (v === null) throw notFound("Tier list introuvable");
    return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
