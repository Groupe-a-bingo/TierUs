"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, Lightbulb, Shield, User, Plus } from "lucide-react";
import { cva } from "class-variance-authority";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { Wordmark } from "./wordmark";

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

/** Desktop navigation (lg+). The phone keeps the floating bottom bar. */
export function SideNav({ isMod, me }: { isMod: boolean; me: { name: string; avatarFileId: string | null; role: string } }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Board", Icon: LayoutList, match: (p: string) => p === "/" || p.startsWith("/r/") },
    { href: "/ideas", label: "Idées", Icon: Lightbulb, match: (p: string) => p.startsWith("/ideas") },
    ...(isMod ? [{ href: "/mod", label: "Modération", Icon: Shield, match: (p: string) => p.startsWith("/mod") }] : []),
    { href: "/profile", label: "Profil", Icon: User, match: (p: string) => p.startsWith("/profile") },
  ];
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-8 border-r-2 border-board-edge bg-board p-6 lg:flex">
      <Link href="/" aria-label="Accueil">
        <Wordmark />
      </Link>

      <nav className="flex flex-col gap-1.5">
        {items.map(({ href, label, Icon, match }) => (
          <Link key={href} href={href} prefetch className={item({ active: match(path) })}>
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      <Link
        href="/ideas"
        className="flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-tier-d px-4 py-3 font-display font-bold text-tier-foreground shadow-pop transition-transform duration-75 hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
      >
        <Plus className="size-5" /> Proposer une idée
      </Link>

      <Link href="/profile" className="mt-auto flex items-center gap-3 rounded-2xl border-2 border-board-edge bg-card p-3 hover:border-primary">
        <AvatarTile name={me.name} fileId={me.avatarFileId} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-display font-bold">{me.name}</p>
          <p className="text-xs text-muted-foreground">{me.role === "admin" ? "Admin" : me.role === "moderator" ? "Modo" : "Membre"}</p>
        </div>
      </Link>
    </aside>
  );
}
