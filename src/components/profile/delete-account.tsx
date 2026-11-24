"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { deleteMyAccount } from "@/app/actions/account";
import { useServerAction } from "@/hooks/use-server-action";

/** Danger zone: permanently delete your own account (irreversible). */
export function DeleteAccount() {
  const router = useRouter();
  const { pending, run } = useServerAction();

  const onDelete = () =>
    run(() => deleteMyAccount(), {
      confirm: "Supprimer définitivement ton compte ? Tes votes, commentaires et photo seront effacés. C'est irréversible.",
      success: "Compte supprimé",
      onSuccess: async () => {
        // the session row is already gone; clear the stale cookie too
        await authClient.signOut().catch(() => null);
        router.replace("/login");
        router.refresh();
      },
    });

  return (
    <Button variant="destructive" disabled={pending} onClick={onDelete}>
      <Trash2 className="size-4" /> {pending ? "…" : "Supprimer mon compte"}
    </Button>
  );
}
