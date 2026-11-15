import { guard } from "@/lib/guard";
import { errorResponse, notFound } from "@/lib/errors";
import { isUuid } from "@/lib/dates";
import { boardVersion, ideasVersion, modVersion, roundVersion } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/live?round=<id>  |  ?scope=mod  |  ?scope=ideas  |  (board) → { v } */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const scope = params.get("scope");
    // a read: its own budget, not the per-IP one meant for mutations
    const u = await guard(scope === "mod" ? "moderator" : "active", "live", { perIp: false });
    const round = params.get("round");
    if (round && !isUuid(round)) throw notFound();
    const v = round
      ? await roundVersion(round)
      : scope === "mod"
        ? await modVersion()
        : scope === "ideas"
          ? await ideasVersion(u.id)
          : await boardVersion();
    if (v === null) throw notFound("Tier list introuvable");
    return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
