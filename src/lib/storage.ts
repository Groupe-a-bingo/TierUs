import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import sharp, { type Metadata } from "sharp";
import { badRequest } from "@/lib/errors";

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/limits";

export { MAX_UPLOAD_BYTES };
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);

/** Largest decoded image accepted (pixels), before resizing. */
const MAX_INPUT_PIXELS = 40_000_000;
/** Decoding is CPU / memory heavy: at most this many images at once per process. */
const MAX_CONCURRENT_DECODES = 2;

let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_DECODES) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

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
  if (input.byteLength > MAX_UPLOAD_BYTES) throw badRequest(`Image trop lourde (${MAX_UPLOAD_LABEL} max)`);

  const out = await limited(async () => {
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw badRequest("Ce fichier n'est pas une image valide");
    }
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw badRequest("Format d'image non supporté");
    }
    return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate() // apply EXIF orientation before metadata is stripped
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  });

  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.webp`;
  const relPath = path.join("avatars", name);
  await fs.writeFile(resolveStoragePath(relPath), out, { flag: "wx" });
  return { relPath, mime: "image/webp" };
}

export async function deleteStored(relPath: string) {
  await fs.rm(resolveStoragePath(relPath), { force: true });
}
