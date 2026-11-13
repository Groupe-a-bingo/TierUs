"use client";

import "./globals.css";

/**
 * Last resort, when the root layout itself fails: it replaces the whole
 * document, so it brings its own <html> and styles (no fonts, no providers).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-dvh antialiased">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
          <p className="font-display text-7xl font-extrabold text-tier-s">💥</p>
          <h1 className="text-3xl font-extrabold">Oups, TierUs a planté</h1>
          <p className="text-muted-foreground">Réessaie dans un instant, et si ça continue, préviens un modo.</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border-2 border-ink bg-primary px-5 py-3 font-display font-bold text-primary-foreground shadow-pop active:translate-y-1 active:shadow-none"
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
