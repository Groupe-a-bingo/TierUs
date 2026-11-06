import { pageUser, isModerator } from "@/lib/permissions";
import { BottomNav } from "@/components/board/bottom-nav";
import { SideNav } from "@/components/board/side-nav";
import { MobileHeader } from "@/components/board/mobile-header";
import { getCurrentRound, getPreviousRoundDate } from "@/server/rounds/queries";
import { displayStreak } from "@/server/streaks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser();
  const mod = isModerator(u);
  const current = await getCurrentRound();
  const prev = current ? await getPreviousRoundDate(current.date) : null;
  const streak = displayStreak({
    streak: u.streak,
    lastPlayed: u.lastPlayedRoundDate,
    currentRoundDate: current?.date ?? null,
    previousRoundDate: prev,
  });

  return (
    <>
      <MobileHeader streak={streak} />
      <div className="lg:flex">
        <SideNav isMod={mod} streak={streak} me={{ name: u.name, avatarFileId: u.avatarFileId, role: u.role }} />
        <main className="mx-auto w-full max-w-md px-4 pt-5 pb-32 lg:max-w-6xl lg:px-10 lg:pt-10 lg:pb-16">{children}</main>
        <BottomNav isMod={mod} />
      </div>
    </>
  );
}
