"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/limits";

export function AvatarUpload({ name, fileId }: { name: string; fileId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Image trop lourde (${MAX_UPLOAD_LABEL} max)`);
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/upload/avatar", { method: "POST", body: file }).catch(() => null);
      if (!res) {
        toast.error("Connexion perdue : vérifie ton réseau et réessaie");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Échec de l'envoi");
        return;
      }
      toast.success("Photo mise à jour");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-4">
      <AvatarTile name={name} fileId={fileId} size="lg" />
      <div className="flex flex-col gap-1">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = ""; // picking the same file again (after an error) fires onChange again
          }}
        />
        <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? "Envoi…" : fileId ? "Changer ma photo" : "Ajouter ma photo"}
        </Button>
        <p className="text-xs text-muted-foreground">Obligatoire pour être validé : c&apos;est ta photo que les autres classent. {MAX_UPLOAD_LABEL} max.</p>
      </div>
    </div>
  );
}
