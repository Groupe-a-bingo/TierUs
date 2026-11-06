import { Trophy } from "lucide-react";
import { pageUser } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { NameForm } from "@/components/profile/name-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { answeredOnTimeCount } from "@/server/counter";

export default async function ProfilePage() {
  const u = await pageUser();
  const count = await answeredOnTimeCount(u.id);

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:max-w-xl lg:pt-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              {u.name}
              {u.role !== "member" && <Badge variant="secondary">{u.role === "admin" ? "Admin" : "Modo"}</Badge>}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
          <AvatarUpload name={u.name} fileId={u.avatarFileId} />
          <NameForm initial={u.name} />
          <div className="flex flex-col gap-0.5">
            <p className="flex items-center gap-2 text-lg font-semibold text-streak">
              <Trophy className="size-6" aria-hidden /> {count} tier list{count > 1 ? "s" : ""} répondue{count > 1 ? "s" : ""} à temps
            </p>
            <p className="text-sm text-muted-foreground">Chaque tier list compte une fois si tu y réponds avant son archivage. Une journée manquée ne fait rien perdre.</p>
          </div>
          </div>
        </CardContent>
      </Card>
      <SignOutButton />
    </div>
  );
}
