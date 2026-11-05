import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import sharp, { type Metadata } from "sharp";
import { badRequest } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);

const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");
const AVATAR_DIR = path.join(ROOT, "avatars");

/** Resolve a stored relative path and make sure it stays inside ROOT. */
export function resolveStoragePath(rel: string): string {
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw badRequest("Chemin invalide");
  return abs;
}

/**
 * Validate by decoding the real content (never trust filename / MIME),
 * square-crop to 256x256, re-encode to WebP (drops EXIF/metadata).
 * Returns the path relative to the storage root.
 */
export async function saveAvatar(input: Buffer): Promise<{ relPath: string; mime: string }> {
  if (input.byteLength === 0) throw badRequest("Fichier vide");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw badRequest("Image trop lourde (5 Mo max)");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw badRequest("Ce fichier n'est pas une image valide");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw badRequest("Format d'image non supporté");
  }

  const out = await sharp(input, { limitInputPixels: 40_000_000, animated: false })
    .rotate() // apply EXIF orientation before metadata is stripped
    .resize(256, 256, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();

  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.webp`;
  const relPath = path.join("avatars", name);
  await fs.writeFile(resolveStoragePath(relPath), out, { flag: "wx" });
  return { relPath, mime: "image/webp" };
}

export async function deleteStored(relPath: string) {
  await fs.rm(resolveStoragePath(relPath), { force: true });
}
