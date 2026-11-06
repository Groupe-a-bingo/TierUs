import Link from "next/link";
import { StreakChip, Wordmark } from "./wordmark";

/** Phone only: TierUs header pinned at the top of every page. */
export function MobileHeader({ streak }: { streak: number }) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-board-edge bg-background/90 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2.5">
        <Link href="/" aria-label="Accueil" className="active:scale-95">
          <Wordmark />
        </Link>
        <StreakChip streak={streak} />
      </div>
    </header>
  );
}
