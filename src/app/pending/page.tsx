import { redirect } from "next/navigation";
import { Hourglass, Ban } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { NameForm } from "@/components/profile/name-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Wordmark } from "@/components/board/wordmark";
import { PendingWatch } from "@/components/auth/pending-watch";

export default async function PendingPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.status === "active") redirect("/");

  const rejected = u.status === "rejected";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <Wordmark />
      {!rejected && <PendingWatch />}
      <section className="flex w-full max-w-sm flex-col gap-6 rounded-3xl border-2 border-board-edge bg-card p-6 shadow-pop">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className={rejected ? "flex size-14 items-center justify-center rounded-2xl border-2 border-ink bg-tier-s text-tier-foreground shadow-pop-sm" : "flex size-14 animate-wiggle items-center justify-center rounded-2xl border-2 border-ink bg-tier-b text-tier-foreground shadow-pop-sm"}>
            {rejected ? <Ban className="size-7" /> : <Hourglass className="size-7" />}
          </span>
          <h1 className="text-2xl font-extrabold">{rejected ? "Accès refusé" : "Presque dedans !"}</h1>
          <p className="text-sm text-muted-foreground">
            {rejected
              ? "Un modérateur a refusé ce compte."
              : "Un modo doit valider ton compte. Cette page s'ouvrira toute seule dès que c'est fait."}
          </p>
        </div>

        {!rejected && (
          <div className="flex flex-col gap-5 border-t-2 border-board-edge pt-5">
            <p className="font-display text-sm font-bold text-muted-foreground">En attendant, prépare ton profil</p>
            <AvatarUpload name={u.name} fileId={u.avatarFileId} />
            <NameForm initial={u.name} />
          </div>
        )}
        <SignOutButton />
      </section>
    </main>
  );
}
