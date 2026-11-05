import { pageUser, isModerator } from "@/lib/permissions";
import { BottomNav } from "@/components/board/bottom-nav";
import { SideNav } from "@/components/board/side-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser();
  const mod = isModerator(u);
  return (
    <div className="lg:flex">
      <SideNav isMod={mod} me={{ name: u.name, avatarFileId: u.avatarFileId, role: u.role }} />
      <main className="mx-auto w-full max-w-md px-4 pt-5 pb-32 lg:max-w-6xl lg:px-10 lg:pt-10 lg:pb-16">{children}</main>
      <BottomNav isMod={mod} />
    </div>
  );
}
