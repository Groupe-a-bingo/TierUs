import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/permissions";
import { errorResponse, forbidden, notFound } from "@/lib/errors";
import { resolveStoragePath } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();

    const [f] = await db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
    if (!f) throw notFound();
    // Validated members see everyone; pending users only their own photo.
    if (u.status !== "active" && f.ownerId !== u.id) throw forbidden();

    const data = await fs.readFile(resolveStoragePath(f.path)).catch(() => null);
    if (!data) throw notFound();

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp", // only ever store re-encoded WebP
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=31536000, immutable", // file ids are never reused
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
