import Link from "next/link";
import { CounterChip, Wordmark } from "./wordmark";

/**
 * Phone only: TierUs header pinned at the top of every page.
 * pt-safe: opened from the home screen (standalone, black-translucent status
 * bar) the page starts under the iPhone status bar; the padding keeps the logo
 * and the counter below it. In Safari the inset is 0, so nothing changes.
 */
export function MobileHeader({ count }: { count: number }) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-board-edge bg-background/90 pt-safe backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2.5">
        <Link href="/" aria-label="Accueil" className="active:scale-95">
          <Wordmark />
        </Link>
        <CounterChip count={count} />
      </div>
    </header>
  );
}
