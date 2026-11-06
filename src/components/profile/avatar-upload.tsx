"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvatarTile } from "@/components/tier-board/avatar-tile";

const MAX = 5 * 1024 * 1024;

export function AvatarUpload({ name, fileId }: { name: string; fileId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX) {
      toast.error("Image trop lourde (5 Mo max)");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/upload/avatar", { method: "POST", body: file });
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
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? "Envoi…" : fileId ? "Changer ma photo" : "Ajouter ma photo"}
        </Button>
        <p className="text-xs text-muted-foreground">Optionnel : sinon ce sont tes initiales qui seront classées. 5 Mo max.</p>
      </div>
    </div>
  );
}
