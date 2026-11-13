"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy } from "lucide-react";
import { cva } from "class-variance-authority";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { COUNTER_LABEL, Wordmark } from "./wordmark";
import { navItems } from "./nav-items";

const item = cva(
  "flex items-center gap-3 rounded-xl border-2 px-4 py-3 font-display text-base font-bold transition-transform duration-75 active:translate-y-0.5",
  {
    variants: {
      active: {
        true: "border-ink bg-primary text-primary-foreground shadow-pop-sm",
        false: "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
      },
    },
  },
);

const profileCard = cva("mt-auto flex items-center gap-3 rounded-2xl border-2 p-3 transition-colors duration-75", {
  variants: {
    active: { true: "border-primary bg-card", false: "border-board-edge bg-card hover:border-primary" },
  },
});

/** Desktop navigation (lg+). The phone keeps the sticky header + floating bottom bar. */
export function SideNav({ isMod, count, me }: { isMod: boolean; count: number; me: { name: string; avatarFileId: string | null; role: string } }) {
  const path = usePathname();
  const items = navItems({ isMod, profile: false });
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 border-r-2 border-board-edge bg-board p-6 lg:flex">
      <Link href="/" aria-label="Accueil">
        <Wordmark />
      </Link>

      <nav className="flex flex-col gap-1.5" aria-label="Navigation principale">
        {items.map(({ href, label, Icon, match }) => (
          <Link key={href} href={href} prefetch aria-current={match(path) ? "page" : undefined} className={item({ active: match(path) })}>
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      {/* profile = this card (no separate nav entry) */}
      <Link href="/profile" className={profileCard({ active: path.startsWith("/profile") })}>
        <AvatarTile name={me.name} fileId={me.avatarFileId} size="sm" />
        <p className="min-w-0 flex-1 truncate font-display font-bold">{me.name}</p>
        <span className="flex items-center gap-0.5 font-display font-extrabold text-streak" title={COUNTER_LABEL} role="img" aria-label={`${count} ${COUNTER_LABEL.toLowerCase()}`}>
          <Trophy className="size-4" aria-hidden />
          {count}
        </span>
      </Link>
    </aside>
  );
}
