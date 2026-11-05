import { requireActiveUser } from "@/lib/permissions";
import { errorResponse, notFound } from "@/lib/errors";
import { boardVersion, roundVersion } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/live?round=<id>  or  /api/live  (board) → { v } */
export async function GET(req: Request) {
  try {
    await requireActiveUser();
    const round = new URL(req.url).searchParams.get("round");
    if (round && !/^[0-9a-f-]{36}$/i.test(round)) throw notFound();
    const v = round ? await roundVersion(round) : await boardVersion();
    return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
