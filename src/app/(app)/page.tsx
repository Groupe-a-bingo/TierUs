import Link from "next/link";
import { Search } from "lucide-react";
import { pageUser } from "@/lib/permissions";
import { ARCHIVE_PAGE, countArchived, decodeCursor, encodeCursor, listBoard, membersById, type BoardPost } from "@/server/board";
import { countBank } from "@/server/ideas";
import { getDrawHour } from "@/server/settings";
import { boardVersion } from "@/server/live";
import { SEARCH_MAX } from "@/lib/limits";
import { PinnedPost, PostCard } from "@/components/board/post-card";
import { LiveRefresh } from "@/components/board/live-refresh";
import { dayKey, formatDayFr, nextDrawHint } from "@/lib/dates";
import { EmptyState } from "@/components/board/empty-state";

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; before?: string | string[] }> }) {
  const u = await pageUser();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, SEARCH_MAX) || undefined;
  const before = decodeCursor(first(params.before));
  const now = new Date();

  // version first: a change landing while the page renders is caught by the next poll
  const version = await boardVersion();
  const [active, archives, total, bank, drawHour] = await Promise.all([
    // every active tier list (daily + extras, and two dailies around a DST change), on the first page only
    q || before ? Promise.resolve([] as BoardPost[]) : listBoard(u.id, { scope: "active", now }),
    listBoard(u.id, { scope: "archived", q, before, now }),
    countArchived(q, now),
    countBank(),
    getDrawHour(),
  ]);
  const members = await membersById([...new Set([...active, ...archives].flatMap((p) => p.top3))]);
  const last = archives.at(-1);
  const older = archives.length === ARCHIVE_PAGE && last ? `/?${new URLSearchParams({ ...(q ? { q } : {}), before: encodeCursor({ createdAt: last.createdAt, id: last.id }) })}` : null;

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh initial={version} />
      {/* phone: the sticky TierUs header (layout) is enough */}
      <header className="hidden lg:block">
        <p className="text-sm font-semibold text-muted-foreground capitalize">{formatDayFr(dayKey(now))}</p>
        <h1 className="text-5xl font-extrabold">Le board</h1>
      </header>

      {!q &&
        !before &&
        (active.length ? (
          <div className="flex flex-col gap-4">
            {active.map((p) => (
              <PinnedPost key={p.id} post={p} members={members} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-board-edge p-6 text-center">
            <p className="font-display text-2xl font-extrabold">Pas de tier list en cours 😶</p>
            <p className="text-muted-foreground">
{nextDrawHint(bank, drawHour, now)}
            </p>
            <Link href="/ideas" className="mx-auto rounded-xl border-2 border-ink bg-primary px-5 py-3 font-display font-bold text-primary-foreground shadow-pop">
              Proposer une idée
            </Link>
          </div>
        ))}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold lg:text-3xl">Archives</h2>
          <span className="text-sm text-muted-foreground">{total}</span>
        </div>
        {/* search only once there's something to search */}
        {(q || total >= 6) && (
        <form action="/" className="flex h-12 items-center lg:max-w-md gap-3 rounded-xl border-2 border-board-edge bg-board px-4 focus-within:border-primary">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            name="q"
            type="search"
            placeholder="Rechercher une tier list…"
            defaultValue={q}
            maxLength={SEARCH_MAX}
            aria-label="Rechercher une tier list"
            className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </form>
        )}
        {archives.length === 0 ? (
          <EmptyState>{q ? "Aucun résultat." : "Rien pour l'instant : les tier lists arrivent ici à la fin de leur durée."}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {archives.map((p) => (
              <PostCard key={p.id} post={p} members={members} />
            ))}
          </div>
        )}
        {(older || before) && (
          <nav className="flex justify-between gap-3 text-sm font-semibold" aria-label="Pages des archives">
            {before ? <Link href={q ? `/?${new URLSearchParams({ q })}` : "/"} className="text-muted-foreground underline-offset-4 hover:underline">← Les plus récentes</Link> : <span />}
            {older && <Link href={older} className="text-muted-foreground underline-offset-4 hover:underline">Plus anciennes →</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
