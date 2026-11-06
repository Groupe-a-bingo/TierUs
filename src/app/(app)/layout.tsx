import { pageUser, isModerator } from "@/lib/permissions";
import { BottomNav } from "@/components/board/bottom-nav";
import { SideNav } from "@/components/board/side-nav";
import { MobileHeader } from "@/components/board/mobile-header";
import { answeredOnTimeCount } from "@/server/counter";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser();
  const mod = isModerator(u);
  const count = await answeredOnTimeCount(u.id);

  return (
    <>
      <MobileHeader count={count} />
      <div className="lg:flex">
        <SideNav isMod={mod} count={count} me={{ name: u.name, avatarFileId: u.avatarFileId, role: u.role }} />
        {/* desktop: content keeps the 1080p ratio (see w-content in globals.css) */}
        <div className="lg:min-w-0 lg:flex-1">
          <main className="mx-auto w-full max-w-md px-4 pt-5 pb-32 lg:w-content lg:max-w-none lg:px-10 lg:pt-10 lg:pb-16">{children}</main>
        </div>
        <BottomNav isMod={mod} />
      </div>
    </>
  );
}
