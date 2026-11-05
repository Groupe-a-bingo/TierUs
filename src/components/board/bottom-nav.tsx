"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, Lightbulb, Shield, User } from "lucide-react";
import { cva } from "class-variance-authority";

const itemVariants = cva(
  "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 font-display text-xs font-semibold active:scale-95",
  {
    variants: {
      active: { true: "bg-primary text-primary-foreground", false: "text-muted-foreground" },
    },
  },
);

export function BottomNav({ isMod }: { isMod: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Board", Icon: LayoutList, match: (p: string) => p === "/" || p.startsWith("/r/") },
    { href: "/ideas", label: "Idées", Icon: Lightbulb, match: (p: string) => p.startsWith("/ideas") },
    ...(isMod ? [{ href: "/mod", label: "Mod", Icon: Shield, match: (p: string) => p.startsWith("/mod") }] : []),
    { href: "/profile", label: "Profil", Icon: User, match: (p: string) => p.startsWith("/profile") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-safe lg:hidden">
      <div className="mx-auto flex max-w-md gap-1 rounded-2xl border-2 border-ink bg-card p-1 shadow-pop">
        {items.map(({ href, label, Icon, match }) => (
          <Link key={href} href={href} prefetch className={itemVariants({ active: match(path) })}>
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
