import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guard } from "@/lib/guard";
import { assertSameOrigin, badRequest, errorResponse } from "@/lib/errors";
import { deleteStored, saveAvatar } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/limits";

export const runtime = "nodejs";

/** Read the body with a hard cap, aborting as soon as it's exceeded. */
async function readCapped(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max + 64 * 1024) throw badRequest(`Image trop lourde (${MAX_UPLOAD_LABEL} max)`);
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
      throw badRequest(`Image trop lourde (${MAX_UPLOAD_LABEL} max)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Raw image body (not multipart): Content-Type is ignored, content is decoded by sharp. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await guard("user", "upload"); // pending users must be able to add their photo

    const input = await readCapped(req, MAX_UPLOAD_BYTES);
    const { relPath, mime } = await saveAvatar(input);

    let replaced: string | undefined;
    try {
      const fileId = await db.transaction(async (tx) => {
        // the user row locked: two uploads at once replace each other in turn,
        // each one deleting the photo it really replaced (no orphan)
        const [me] = await tx
          .select({ avatarFileId: schema.user.avatarFileId })
          .from(schema.user)
          .where(eq(schema.user.id, u.id))
          .for("update")
          .limit(1);
        const [f] = await tx.insert(schema.files).values({ ownerId: u.id, path: relPath, mime }).returning({ id: schema.files.id });
        await tx.update(schema.user).set({ avatarFileId: f.id, updatedAt: new Date() }).where(eq(schema.user.id, u.id));
        if (me?.avatarFileId) {
          const [old] = await tx.delete(schema.files).where(eq(schema.files.id, me.avatarFileId)).returning({ path: schema.files.path });
          replaced = old?.path;
        }
        return f.id;
      });
      if (replaced) await deleteStored(replaced).catch(() => {});
      return Response.json({ fileId });
    } catch (err) {
      await deleteStored(relPath).catch(() => {}); // not referenced by anything
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
