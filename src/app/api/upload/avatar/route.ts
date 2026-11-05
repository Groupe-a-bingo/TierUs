import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, badRequest, errorResponse } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, deleteStored, saveAvatar } from "@/lib/storage";

export const runtime = "nodejs";

/** Read the body with a hard cap, aborting as soon as it's exceeded. */
async function readCapped(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max + 64 * 1024) throw badRequest("Image trop lourde (5 Mo max)");
  if (!req.body) throw badRequest("Fichier manquant");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw badRequest("Image trop lourde (5 Mo max)");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Raw image body (not multipart): Content-Type is ignored, content is decoded by sharp. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser(); // pending users must be able to add their photo
    await rateLimit("upload", u.id);

    const input = await readCapped(req, MAX_UPLOAD_BYTES);
    const { relPath, mime } = await saveAvatar(input);

    const old = u.avatarFileId
      ? (await db.select().from(schema.files).where(eq(schema.files.id, u.avatarFileId)).limit(1))[0]
      : undefined;

    const fileId = await db.transaction(async (tx) => {
      const [f] = await tx.insert(schema.files).values({ ownerId: u.id, path: relPath, mime }).returning({ id: schema.files.id });
      await tx.update(schema.user).set({ avatarFileId: f.id, updatedAt: new Date() }).where(eq(schema.user.id, u.id));
      if (old) await tx.delete(schema.files).where(eq(schema.files.id, old.id));
      return f.id;
    });
    if (old) await deleteStored(old.path).catch(() => {});

    return Response.json({ fileId });
  } catch (err) {
    return errorResponse(err);
  }
}
