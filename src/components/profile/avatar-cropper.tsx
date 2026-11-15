"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

/** Side of the square sent to the server (which re-encodes it to 256×256 anyway). */
const OUTPUT_PX = 512;
const MAX_ZOOM = 3;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
}

/** The chosen square, drawn at OUTPUT_PX. WebP when the browser can encode it (not Safari), JPEG otherwise. */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_PX, OUTPUT_PX);
  const webp = await toBlob(canvas, "image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg");
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

/**
 * Square crop + zoom of a freshly picked photo (drag / pinch / wheel to frame it).
 * `src` is an object URL owned by the caller; `onCancel` closes without sending;
 * `onUnreadable` takes over when the browser can't decode the photo.
 */
export function AvatarCropper({
  src,
  onCancel,
  onConfirm,
  onUnreadable,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  onUnreadable: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    if (!area) return;
    setBusy(true);
    try {
      onConfirm(await cropToBlob(src, area));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Recadrer ta photo</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border-2 border-board-edge bg-board">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            maxZoom={MAX_ZOOM}
            aspect={1}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
            mediaProps={{ onError: onUnreadable }}
          />
        </div>
        <Slider
          aria-label="Zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
        />
        {failed && <p className="text-sm text-destructive">Impossible de lire cette image. Essaie avec une autre (JPEG ou PNG).</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Annuler
          </Button>
          <Button disabled={busy || failed || !area} onClick={confirm}>
            {busy ? "Préparation…" : "Valider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
