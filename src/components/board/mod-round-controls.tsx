"use client";

import { useTransition } from "react";
import { Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rerollAction } from "@/app/actions/rounds";

/** Moderators, on an active tier list nobody has played yet: draw another idea. */
export function ModRoundControls({ roundId }: { roundId: string }) {
  const [pending, startTransition] = useTransition();
  const reroll = () => {
    if (!confirm("Tirer une autre idée ? L'actuelle retourne dans la banque.")) return;
    startTransition(async () => {
      const res = await rerollAction(roundId);
      if (!res.ok) toast.error(res.error);
      else toast.success("Nouvelle idée tirée");
    });
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={pending} onClick={reroll}>
        <Shuffle /> Relancer le tirage
      </Button>
    </div>
  );
}
