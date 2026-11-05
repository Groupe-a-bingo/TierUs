import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { NameForm } from "@/components/profile/name-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Wordmark } from "@/components/board/wordmark";

export default async function PendingPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.status === "active") redirect("/");

  const rejected = u.status === "rejected";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{rejected ? "Accès refusé" : "En attente de validation ⏳"}</CardTitle>
          <CardDescription>
            {rejected
              ? "Un modérateur a refusé ce compte."
              : "Un modérateur doit valider ton compte. En attendant, ajoute une photo : c'est elle qui sera classée dans les tier lists (obligatoire pour être validé)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
          {!rejected && (
            <>
              <AvatarUpload name={u.name} fileId={u.avatarFileId} />
              <NameForm initial={u.name} />
            </>
          )}
          <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
