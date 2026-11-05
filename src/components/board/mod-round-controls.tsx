"use client";

import { useTransition } from "react";
import { Eye, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revealNowAction, rerollAction } from "@/app/actions/rounds";
import type { ActionResult } from "@/lib/errors";

export function ModRoundControls({ roundId, canReveal, canReroll }: { roundId: string; canReveal: boolean; canReroll: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, ok: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else toast.success(ok);
    });
  };
  if (!canReveal && !canReroll) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canReveal && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => revealNowAction(roundId), "Révélé !", "Révéler la tier list maintenant ?")}>
          <Eye /> Révéler
        </Button>
      )}
      {canReroll && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => rerollAction(), "Nouvelle idée tirée", "Tirer une autre idée ? L'actuelle retourne dans la banque.")}>
          <Shuffle /> Relancer le tirage
        </Button>
      )}
    </div>
  );
}
