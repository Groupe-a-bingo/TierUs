"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Any unexpected render error: themed screen with retry instead of a blank page. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-display text-7xl font-extrabold text-tier-s">💥</p>
      <h1 className="text-3xl font-extrabold">Oups, ça a planté</h1>
      <p className="text-muted-foreground">Réessaie, et si ça continue, préviens un modo.</p>
      <div className="flex gap-3">
        <Button size="lg" onClick={reset}>
          Réessayer
        </Button>
        <Link href="/" className="flex items-center rounded-xl border-2 border-board-edge px-5 font-display font-bold">
          Board
        </Link>
      </div>
    </main>
  );
}
