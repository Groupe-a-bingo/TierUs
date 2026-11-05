import { Flame } from "lucide-react";
import { pageUser } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { NameForm } from "@/components/profile/name-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentRound, getPreviousRoundDate } from "@/server/rounds/queries";
import { displayStreak } from "@/server/streaks";

export default async function ProfilePage() {
  const u = await pageUser();
  const current = await getCurrentRound();
  const prev = current ? await getPreviousRoundDate(current.date) : null;
  const streak = displayStreak({ streak: u.streak, lastPlayed: u.lastPlayedRoundDate, currentRoundDate: current?.date ?? null, previousRoundDate: prev });

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
          <p className="flex items-center gap-2 text-lg font-semibold text-streak">
            <Flame className="size-6" /> {streak} jour{streak > 1 ? "s" : ""} de suite
          </p>
          </div>
        </CardContent>
      </Card>
      <SignOutButton />
    </div>
  );
}
