import Link from "next/link";
import { Search } from "lucide-react";
import { pageUser } from "@/lib/permissions";
import { listBoard, membersById } from "@/server/board";
import { PinnedPost, PostCard } from "@/components/board/post-card";
import { StreakChip, Wordmark } from "@/components/board/wordmark";
import { LiveRefresh } from "@/components/board/live-refresh";
import { dayKey, formatDayFr } from "@/lib/dates";
import { displayStreak } from "@/server/streaks";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await pageUser();
  const { q: rawQ } = await searchParams;
  const q = rawQ?.trim().slice(0, 80) || undefined;

  const posts = await listBoard(u.id, { q });
  const members = await membersById([...new Set(posts.flatMap((p) => p.top3))]);

  const pinned = !q && posts[0]?.date === dayKey() ? posts[0] : null;
  const archives = pinned ? posts.slice(1) : posts;

  const streak = displayStreak({
    streak: u.streak,
    lastPlayed: u.lastPlayedRoundDate,
    currentRoundDate: posts[0]?.date ?? null,
    previousRoundDate: posts[1]?.date ?? null,
  });

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh />
      <header className="flex items-center justify-between">
        <div className="lg:hidden">
          <Wordmark />
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-muted-foreground capitalize">{formatDayFr(dayKey())}</p>
          <h1 className="text-5xl font-extrabold">Le board</h1>
        </div>
        <StreakChip streak={streak} />
      </header>

      {!q &&
        (pinned ? (
          <PinnedPost post={pinned} members={members} />
        ) : (
          <div className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-board-edge p-6 text-center">
            <p className="font-display text-2xl font-extrabold">Pas de tier list aujourd&apos;hui 😶</p>
            <p className="text-muted-foreground">La banque d&apos;idées est vide.</p>
            <Link href="/ideas" className="mx-auto rounded-xl border-2 border-ink bg-primary px-5 py-3 font-display font-bold text-primary-foreground shadow-pop">
              Proposer une idée
            </Link>
          </div>
        ))}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold lg:text-3xl">Archives</h2>
          <span className="text-sm text-muted-foreground">{archives.length}</span>
        </div>
        <form action="/" className="flex h-12 items-center lg:max-w-md gap-3 rounded-xl border-2 border-board-edge bg-board px-4 focus-within:border-primary">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            name="q"
            type="search"
            placeholder="Rechercher une tier list…"
            defaultValue={q}
            maxLength={80}
            className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </form>
        {archives.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">{q ? "Aucun résultat." : "Rien pour l'instant, revenez demain !"}</p>
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {archives.map((p) => (
              <PostCard key={p.id} post={p} members={members} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
