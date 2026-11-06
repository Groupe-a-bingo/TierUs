import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cva } from "class-variance-authority";
import { inArray } from "drizzle-orm";
import { pageUser, isModerator } from "@/lib/permissions";
import { formatDayFr, formatRemaining, formatTimeFr, isActive, isDayKey, isUuid } from "@/lib/dates";
import { TIERS, emptyRows } from "@/lib/tiers";
import { db, schema } from "@/db";
import { getMyPlacements, getVotes, getProgress, getRoundIdByDate, getRoundWithIdea, getSubmissionsDetail, getTargets, hasSubmitted } from "@/server/rounds/queries";
import { canSeeResults } from "@/server/rounds/visibility";
import { aggregate, computeStats } from "@/server/rounds/aggregate";
import { roundVersion } from "@/server/live";
import { missingTargetsFor } from "@/server/rounds/targets";
import { getComments, getPostReactions } from "@/server/comments";
import { TierEditor } from "@/components/tier-board/tier-editor";
import { ResultsTabs, type ResultsData } from "@/components/tier-board/results-tabs";
import { LiveRefresh } from "@/components/board/live-refresh";
import { Comments } from "@/components/board/comments";
import { ReactionBar } from "@/components/board/reaction-bar";
import { ModRoundControls } from "@/components/board/mod-round-controls";

const stateChip = cva("ml-auto rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold text-tier-foreground", {
  variants: { active: { true: "bg-tier-s", false: "bg-tier-d" } },
});

/**
 * One tier list: `/r/<id>` (the slug is the tier list's uuid).
 * Old `/r/YYYY-MM-DD` links land here too and are redirected to that day's
 * daily tier list (or the first one created that day).
 */
export default async function RoundPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ play?: string }> }) {
  const u = await pageUser();
  const { slug } = await params;
  const { play } = await searchParams;

  if (isDayKey(slug)) {
    const id = await getRoundIdByDate(slug);
    if (!id) notFound();
    permanentRedirect(`/r/${id}`);
  }
  if (!isUuid(slug)) notFound();

  const found = await getRoundWithIdea(slug);
  if (!found) notFound();
  const { round, idea } = found;

  const now = new Date();
  const active = isActive(round, now);
  const [targets, submitted, progress] = await Promise.all([getTargets(round.id), hasSubmitted(round.id, u.id), getProgress(round.id)]);
  // results, others' tier lists and the discussion: only after your own answer, archived or not
  const visible = canSeeResults({ hasSubmitted: submitted });
  const mod = isModerator(u);
  // archived and not answered yet: still possible, behind a link (it won't count)
  const showEditor = !submitted && (active || play === "1");

  const [missingIds, resultsBundle, thread] = await Promise.all([
    submitted ? missingTargetsFor(round.id, u.id) : Promise.resolve([] as string[]),
    visible ? Promise.all([getVotes(round.id), getSubmissionsDetail(round.id)]) : null,
    visible ? Promise.all([getComments(round.id, u.id, mod), getPostReactions(round.id, u.id)]) : null,
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
    const [votes, detail] = resultsBundle;
    const agg = aggregate(votes);
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
      stats: computeStats(votes),
      targets: agg.results.map((r) => ({ targetId: r.targetId, mean: r.mean, stddev: r.stddev, tier: r.tier, distribution: r.distribution })),
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
    <div className="flex flex-col gap-6 lg:grid lg:h-post lg:grid-cols-12 lg:gap-10">
      {/* desktop: the page itself never scrolls, each column scrolls on its own */}
      <LiveRefresh roundId={round.id} initial={await roundVersion(round.id)} />

      {/* while playing, the editor gets the full width on desktop */}
      <div className={showEditor ? "flex flex-col gap-6 lg:col-span-12 lg:min-h-0 lg:overflow-y-auto lg:scrollbar-theme lg:pr-2 lg:pb-3" : "flex flex-col gap-6 lg:col-span-7 lg:min-h-0 lg:overflow-y-auto lg:scrollbar-theme lg:pr-2 lg:pb-3"}>
      <header className="flex flex-col gap-3">
        <Link href="/" className="flex w-fit items-center gap-1 rounded-full py-1 pr-3 text-sm font-semibold text-muted-foreground active:scale-95 lg:hidden">
          <ArrowLeft className="size-4" /> Board
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground capitalize">
            {formatDayFr(round.date)}
            {round.kind === "extra" && ` · bonus ${formatTimeFr(round.startsAt)}`}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-display font-bold">
            {progress.played}/{progress.total} ont joué
          </span>
          <span className={stateChip({ active })}>{active ? `En cours · ${formatRemaining(round.expiresAt.getTime() - now.getTime())}` : "Archivée"}</span>
        </div>
        <h1 className="animate-rise text-3xl leading-none font-extrabold lg:text-5xl">{idea.title}</h1>
        {idea.description && <p className="text-muted-foreground">{idea.description}</p>}
        {mod && active && progress.played === 0 && <ModRoundControls roundId={round.id} />}
      </header>

      {showEditor && <TierEditor roundId={round.id} members={targets} archived={!active} />}

      {missingMembers.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{missingMembers.length > 1 ? "Des nouveaux à placer 👋" : "Un nouveau à placer 👋"}</h2>
          <p className="text-muted-foreground">Ta tier list est gardée (en grisé), place juste {missingMembers.length > 1 ? "les nouveaux" : "le nouveau"}.</p>
          <TierEditor roundId={round.id} members={missingMembers} archived={!active} complement locked={locked} wide={false} />
        </section>
      )}

      {!submitted && !showEditor && (
        <Link href={`/r/${round.id}?play=1`} className="flex flex-col gap-1 rounded-2xl border-2 border-dashed border-board-edge p-4 text-center active:scale-99">
          <span className="font-display font-bold">Faire ma tier list →</span>
          <span className="text-sm text-muted-foreground">Elle est archivée : ta réponse te montre les résultats, mais ne compte pas dans ton compteur.</span>
        </Link>
      )}

      {results && <ResultsTabs data={results} members={[...targets, ...extraMembers]} />}
      </div>

      {/* Desktop: the thread lives in a sticky side panel, like a Discord forum post */}
      <aside className={showEditor && !thread ? "hidden" : "flex flex-col gap-4 lg:col-span-5 lg:min-h-0 lg:overflow-hidden lg:rounded-3xl lg:border-2 lg:border-board-edge lg:bg-board lg:p-6"}>
        {thread ? (
          <>
            <ReactionBar roundId={round.id} reactions={thread[1]} />
            <Comments roundId={round.id} comments={thread[0]} me={{ id: u.id, name: u.name, avatarFileId: u.avatarFileId }} />
          </>
        ) : (
          <div className="hidden flex-col items-center gap-3 py-16 text-center lg:flex">
            <p className="text-5xl">🔒</p>
            <h2 className="text-2xl font-extrabold">Discussion verrouillée</h2>
            <p className="text-muted-foreground">Fais ta tier list pour voir les résultats et ce que les autres en pensent.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
