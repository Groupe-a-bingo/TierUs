import Link from "next/link";
import { Wordmark } from "@/components/board/wordmark";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Wordmark />
      <p className="font-display text-7xl font-extrabold text-tier-f">F</p>
      <h1 className="text-3xl font-extrabold">Page introuvable</h1>
      <p className="text-muted-foreground">Cette tier list n&apos;existe pas (ou plus).</p>
      <Link href="/" className="rounded-xl border-2 border-ink bg-primary px-5 py-3 font-display font-bold text-primary-foreground shadow-pop active:translate-y-1 active:shadow-none">
        Retour au board
      </Link>
    </main>
  );
}
