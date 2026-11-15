"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const signOut = () =>
    startTransition(async () => {
      const res = await authClient.signOut().catch(() => null);
      if (!res || res.error) {
        toast.error("Déconnexion impossible : réessaie");
        return;
      }
      router.replace("/login");
      router.refresh();
    });
  return (
    <Button variant="ghost" disabled={pending} onClick={signOut}>
      {pending ? "…" : "Se déconnecter"}
    </Button>
  );
}
