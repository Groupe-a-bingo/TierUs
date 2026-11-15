"use client";

import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rerollAction } from "@/app/actions/rounds";
import { useServerAction } from "@/hooks/use-server-action";

/** Moderators, on an active tier list nobody has played yet: draw another idea. */
export function ModRoundControls({ roundId }: { roundId: string }) {
  const { pending, run } = useServerAction();
  const reroll = () =>
    run(() => rerollAction(roundId), {
      success: "Nouvelle idée tirée",
      confirm: "Tirer une autre idée ? L'actuelle retourne dans la banque.",
      refreshOnError: true,
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={pending} onClick={reroll}>
        <Shuffle /> Relancer le tirage
      </Button>
    </div>
  );
}
