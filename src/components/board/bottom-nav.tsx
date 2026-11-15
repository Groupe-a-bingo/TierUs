"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cva } from "class-variance-authority";
import { navItems } from "./nav-items";

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
  const items = navItems({ isMod, profile: true });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-safe lg:hidden" aria-label="Navigation principale">
      <div className="mx-auto flex max-w-md gap-1 rounded-2xl border-2 border-ink bg-card p-1 shadow-pop">
        {items.map(({ href, label, short, Icon, match }) => (
          <Link key={href} href={href} prefetch aria-label={label} aria-current={match(path) ? "page" : undefined} className={itemVariants({ active: match(path) })}>
            <Icon className="size-5" />
            {short}
          </Link>
        ))}
      </div>
    </nav>
  );
}
