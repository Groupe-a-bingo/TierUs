import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

let dir: string;
let storage: typeof import("@/lib/storage");

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tierus-storage-"));
  vi.stubEnv("STORAGE_DIR", dir);
  storage = await import("@/lib/storage");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "red" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-gps-like-metadata" } } })
    .jpeg()
    .toBuffer();

describe("saveAvatar", () => {
  it("re-encodes any real image to a 256×256 WebP without metadata", async () => {
    const { relPath, mime } = await storage.saveAvatar(await png(800, 300));
    expect(mime).toBe("image/webp");
    const file = await fs.readFile(path.join(dir, relPath));
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);
    expect(meta.exif).toBeUndefined();
    expect(file.toString("latin1")).not.toContain("secret-gps-like-metadata");
  });

  it("rejects HTML disguised as an image, empty and oversized files", async () => {
    await expect(storage.saveAvatar(Buffer.from("<html><script>alert(1)</script></html>"))).rejects.toThrow(/image valide/);
    await expect(storage.saveAvatar(Buffer.alloc(0))).rejects.toThrow(/vide/);
    await expect(storage.saveAvatar(Buffer.alloc(storage.MAX_UPLOAD_BYTES + 1))).rejects.toThrow(/5 Mo/);
  });

  it("uses random server-side file names", async () => {
    const a = await storage.saveAvatar(await png(10, 10));
    const b = await storage.saveAvatar(await png(10, 10));
    expect(a.relPath).not.toBe(b.relPath);
    expect(a.relPath).toMatch(/^avatars\/[0-9a-f-]{36}\.webp$/);
  });
});

describe("resolveStoragePath", () => {
  it("blocks path traversal outside the storage root", () => {
    expect(() => storage.resolveStoragePath("../../etc/passwd")).toThrow();
    expect(() => storage.resolveStoragePath("/etc/passwd")).toThrow();
    expect(storage.resolveStoragePath("avatars/x.webp")).toBe(path.join(dir, "avatars/x.webp"));
  });
});
