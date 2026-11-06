import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cva } from "class-variance-authority";
import { eq, inArray } from "drizzle-orm";
import { pageUser, isModerator } from "@/lib/permissions";
import { formatDayFr, isDayKey, dayKey } from "@/lib/dates";
import { TIERS, emptyRows } from "@/lib/tiers";
import { db, schema } from "@/db";
import { getAggregate, getCurrentRound, getMyPlacements, getProgress, getRoundByDate, getSubmissionsDetail, getTargets, hasSubmitted } from "@/server/rounds/queries";
import { canSeeResults } from "@/server/rounds/visibility";
import { missingTargetsFor } from "@/server/rounds/targets";
import { getComments, getPostReactions } from "@/server/comments";
import { TierEditor } from "@/components/tier-board/tier-editor";
import { ResultsTabs, type ResultsData } from "@/components/tier-board/results-tabs";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { LiveRefresh } from "@/components/board/live-refresh";
import { Comments } from "@/components/board/comments";
import { ReactionBar } from "@/components/board/reaction-bar";
import { ModRoundControls } from "@/components/board/mod-round-controls";

const stateChip = cva("ml-auto rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold text-tier-foreground", {
  variants: { revealed: { true: "bg-tier-d", false: "bg-tier-s" } },
});

export default async function RoundPage({ params, searchParams }: { params: Promise<{ date: string }>; searchParams: Promise<{ play?: string }> }) {
  const u = await pageUser();
  const { date } = await params;
  const { play } = await searchParams;
  if (!isDayKey(date)) notFound();

  const found = await getRoundByDate(date);
  if (!found) notFound();
  const { round, idea } = found;

  const [current, targets, submitted, progress] = await Promise.all([
    getCurrentRound(),
    getTargets(round.id),
    hasSubmitted(round.id, u.id),
    getProgress(round.id),
  ]);
  const isCurrent = current?.id === round.id;
  const isToday = round.date === dayKey();
  const revealed = !!round.revealedAt;
  const visible = canSeeResults({ revealed, isCurrent, hasSubmitted: submitted });
  const mod = isModerator(u);
  // Discussion is part of the results: hidden on today's post until you've played.
  const showThread = !isCurrent || submitted;
  const showEditor = !submitted && (isCurrent || play === "1");

  const [missingIds, resultsBundle, playedIds, thread] = await Promise.all([
    submitted ? missingTargetsFor(round.id, u.id) : Promise.resolve([] as string[]),
    visible ? Promise.all([getAggregate(round.id), getSubmissionsDetail(round.id)]) : null,
    !visible && submitted
      ? db.select({ voterId: schema.submissions.voterId }).from(schema.submissions).where(eq(schema.submissions.roundId, round.id)).then((r) => r.map((x) => x.voterId))
      : Promise.resolve([] as string[]),
    showThread ? Promise.all([getComments(round.id, u.id, mod), getPostReactions(round.id, u.id)]) : null,
  ]);
  const missingMembers = targets.filter((t) => missingIds.includes(t.id));
  // complement mode: show the rest of my tier list greyed out
  const locked = missingMembers.length
    ? (await getMyPlacements(round.id, u.id)).flatMap((p) => {
        const member = targets.find((t) => t.id === p.targetId);
        return member ? [{ member, tier: p.tier }] : [];
      })
    : [];

  let results: ResultsData | null = null;
  let extraMembers: { id: string; name: string; avatarFileId: string | null }[] = [];
  if (resultsBundle) {
    const [agg, detail] = resultsBundle;
    const average = emptyRows();
    for (const t of TIERS) average[t] = agg.rows[t].map((r) => r.targetId);
    results = {
      average,
      means: Object.fromEntries(agg.results.map((r) => [r.targetId, r.mean])),
      controversial: agg.controversial ? { targetId: agg.controversial.targetId, stddev: agg.controversial.stddev } : null,
      unanimous: agg.unanimous.map((r) => ({ targetId: r.targetId, tier: r.tier })),
      voters: detail.map((d) => {
        const rows = emptyRows();
        for (const p of [...d.placements].sort((a, b) => a.position - b.position)) rows[p.tier].push(p.targetId);
        return { voterId: d.voterId, isLate: d.isLate, rows };
      }),
      myId: u.id,
    };
    // voters may not be in the snapshot (joined later): load their profiles too
    const extra = detail.map((d) => d.voterId).filter((id) => !targets.some((t) => t.id === id));
    extraMembers = extra.length
      ? await db
          .select({ id: schema.user.id, name: schema.user.name, avatarFileId: schema.user.avatarFileId })
          .from(schema.user)
          .where(inArray(schema.user.id, extra))
      : [];
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10">
      <LiveRefresh roundId={round.id} />

      {/* while playing, the editor gets the full width on desktop */}
      <div className={showEditor ? "flex flex-col gap-6 lg:col-span-12" : "flex flex-col gap-6 lg:col-span-7"}>
      <header className="flex flex-col gap-3">
        <Link href="/" className="flex w-fit items-center gap-1 rounded-full py-1 pr-3 text-sm font-semibold text-muted-foreground active:scale-95 lg:hidden">
          <ArrowLeft className="size-4" /> Board
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground capitalize">{isToday ? "Aujourd'hui" : formatDayFr(round.date)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-display font-bold">
            {progress.played}/{progress.total} ont joué
          </span>
          <span className={stateChip({ revealed })}>{revealed ? "Révélé" : "En cours"}</span>
        </div>
        <h1 className="animate-rise text-3xl leading-none font-extrabold lg:text-5xl">{idea.title}</h1>
        {idea.description && <p className="text-muted-foreground">{idea.description}</p>}
        {mod && isCurrent && <ModRoundControls roundId={round.id} canReveal={!revealed} canReroll={!revealed && progress.played === 0 && isToday} />}
      </header>

      {showEditor && <TierEditor roundId={round.id} members={targets} isLate={revealed} />}

      {missingMembers.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{missingMembers.length > 1 ? "Des nouveaux à placer 👋" : "Un nouveau à placer 👋"}</h2>
          <p className="text-muted-foreground">Ta tier list est gardée (en grisé), place juste {missingMembers.length > 1 ? "les nouveaux" : "le nouveau"}.</p>
          <TierEditor roundId={round.id} members={missingMembers} isLate={revealed} complement locked={locked} wide={false} />
        </section>
      )}

      {!submitted && !isCurrent && !showEditor && (
        <Link href={`/r/${round.date}?play=1`} className="rounded-2xl border-2 border-dashed border-board-edge p-4 text-center font-display font-bold text-muted-foreground active:scale-99">
          Faire ma tier list (en retard) →
        </Link>
      )}

      {submitted && !visible && (
        <section className="flex animate-rise flex-col items-center gap-4 rounded-3xl border-2 border-ink bg-tier-f p-6 text-center text-tier-foreground shadow-pop">
          <p className="text-5xl">🤫</p>
          <h2 className="text-2xl font-extrabold">Tier list envoyée !</h2>
          <p className="text-sm">Révélation quand tout le monde a joué, ou dans 24h max. La page se met à jour toute seule.</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {targets.map((t) => (
              <AvatarTile
                key={t.id}
                name={t.name}
                fileId={t.avatarFileId}
                size="sm"
                shape="round"
                state={playedIds.includes(t.id) ? "idle" : "dim"}
                title={`${t.name}${playedIds.includes(t.id) ? " a joué" : " n'a pas encore joué"}`}
              />
            ))}
          </div>
        </section>
      )}

      {results && <ResultsTabs data={results} members={[...targets, ...extraMembers]} />}
      </div>

      {/* Desktop: the thread lives in a sticky side panel, like a Discord forum post */}
      <aside className={showEditor && !thread ? "hidden" : "flex flex-col gap-4 lg:sticky lg:top-10 lg:col-span-5 lg:max-h-dvh lg:overflow-y-auto lg:scroll-gutter-stable lg:rounded-3xl lg:border-2 lg:border-board-edge lg:bg-board lg:p-6"}>
        {thread ? (
          <>
            <ReactionBar roundId={round.id} reactions={thread[1]} compact />
            <Comments roundId={round.id} comments={thread[0]} me={{ id: u.id, name: u.name, avatarFileId: u.avatarFileId }} />
          </>
        ) : (
          <div className="hidden flex-col items-center gap-3 py-16 text-center lg:flex">
            <p className="text-5xl">🔒</p>
            <h2 className="text-2xl font-extrabold">Discussion verrouillée</h2>
            <p className="text-muted-foreground">Fais ta tier list pour voir ce que les autres en pensent.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
