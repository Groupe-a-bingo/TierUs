import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cva } from "class-variance-authority";
import { pageUser, isModerator } from "@/lib/permissions";
import { formatDayFr, formatTimeFr, isActive, isDayKey, isUuid } from "@/lib/dates";
import {
  getDailyRoundId,
  getMyPlacements,
  getProgress,
  getRoundWithIdea,
  getSubmissionsDetail,
  getTargets,
  getVotes,
  hasSubmitted,
} from "@/server/rounds/queries";
import { canSeeResults } from "@/server/rounds/visibility";
import { buildResults } from "@/server/rounds/results";
import { roundVersion } from "@/server/live";
import { missingTargetsFor } from "@/server/rounds/targets";
import { membersById } from "@/server/board";
import { getComments, getPostReactions } from "@/server/comments";
import { TierEditor } from "@/components/tier-board/tier-editor";
import { ResultsTabs } from "@/components/tier-board/results-tabs";
import { LiveRefresh } from "@/components/board/live-refresh";
import { Comments } from "@/components/board/comments";
import { ReactionBar } from "@/components/board/reaction-bar";
import { ModRoundControls } from "@/components/board/mod-round-controls";
import { Countdown } from "@/components/board/countdown";

const stateChip = cva("ml-auto rounded-full border-2 border-ink px-2.5 py-0.5 font-display text-xs font-bold text-tier-foreground", {
  variants: { active: { true: "bg-tier-s", false: "bg-tier-d" } },
});

/**
 * One tier list: `/r/<id>` (the slug is the tier list's uuid).
 * Old `/r/YYYY-MM-DD` links land here too and are redirected (temporarily:
 * the daily may not be drawn yet) to that day's daily tier list.
 */
export default async function RoundPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ play?: string }> }) {
  const u = await pageUser();
  const { slug } = await params;
  const { play } = await searchParams;

  if (isDayKey(slug)) {
    const id = await getDailyRoundId(slug);
    if (!id) notFound();
    redirect(`/r/${id}`);
  }
  if (!isUuid(slug)) notFound();

  // the live version is read before the data: a change landing while the page
  // renders moves the version after it, so the next poll refreshes again
  const [version, found] = await Promise.all([roundVersion(slug), getRoundWithIdea(slug)]);
  if (!found || version === null) notFound();
  const { round, idea } = found;

  const now = new Date();
  const active = isActive(round, now);
  const [targets, submitted, progress, missingIds, mine] = await Promise.all([
    getTargets(round.id),
    hasSubmitted(round.id, u.id),
    getProgress(round.id),
    missingTargetsFor(round.id, u.id), // empty until the member has answered
    getMyPlacements(round.id, u.id),
  ]);
  // results, others' tier lists and the discussion: only after your own answer, archived or not
  const visible = canSeeResults({ hasSubmitted: submitted });
  const mod = isModerator(u);
  const isTarget = targets.some((t) => t.id === u.id);
  // archived and not answered yet: still possible, behind a link (it won't count)
  const showEditor = !submitted && isTarget && (active || play === "1");

  const missingMembers = targets.filter((t) => missingIds.includes(t.id));
  // complement mode: show the rest of my tier list greyed out
  const locked = missingMembers.length
    ? mine.flatMap((p) => {
        const member = targets.find((t) => t.id === p.targetId);
        return member ? [{ member, tier: p.tier }] : [];
      })
    : [];

  const [resultsBundle, thread] = visible
    ? await Promise.all([
        Promise.all([getVotes(round.id), getSubmissionsDetail(round.id)]),
        Promise.all([getComments(round.id, u.id, mod), getPostReactions(round.id, u.id)]),
      ])
    : [null, null];
  const results = resultsBundle ? buildResults(resultsBundle[0], resultsBundle[1], u.id) : null;
  // answers kept from before a member left the snapshot: load their profiles too
  const extraIds = resultsBundle ? resultsBundle[1].map((d) => d.voterId).filter((id) => !targets.some((t) => t.id === id)) : [];
  const members = [...targets, ...(await membersById(extraIds)).values()];

  return (
    <div className="flex flex-col gap-6 xl:grid xl:h-post xl:grid-cols-12 xl:gap-10">
      {/* desktop: the page itself never scrolls, each column scrolls on its own */}
      <LiveRefresh roundId={round.id} initial={version} />

      {/* while playing, the editor gets the full width on desktop */}
      <div className={showEditor ? "flex flex-col gap-6 xl:col-span-12 xl:min-h-0 xl:overflow-y-auto xl:scrollbar-theme xl:pr-2 xl:pb-3" : "flex flex-col gap-6 xl:col-span-7 xl:min-h-0 xl:overflow-y-auto xl:scrollbar-theme xl:pr-2 xl:pb-3"}>
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
          <span className={stateChip({ active })}>{active ? <>En cours · <Countdown expiresAt={round.expiresAt.toISOString()} /></> : "Archivée"}</span>
        </div>
        <h1 className="animate-rise text-3xl leading-none font-extrabold lg:text-5xl">{idea.title}</h1>
        {idea.description && <p className="text-muted-foreground">{idea.description}</p>}
        {mod && active && progress.played === 0 && <ModRoundControls roundId={round.id} />}
      </header>

      {showEditor && <TierEditor roundId={round.id} ideaId={idea.id} members={targets} archived={!active} />}

      {missingMembers.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-extrabold">{missingMembers.length > 1 ? "Des nouveaux à placer 👋" : "Un nouveau à placer 👋"}</h2>
          <p className="text-muted-foreground">Ta tier list est gardée (en grisé), place juste {missingMembers.length > 1 ? "les nouveaux" : "le nouveau"}.</p>
          <TierEditor roundId={round.id} ideaId={idea.id} members={missingMembers} archived={!active} complement locked={locked} wide={false} />
        </section>
      )}

      {!submitted && !isTarget && (
        <p className="rounded-2xl border-2 border-dashed border-board-edge p-4 text-center text-sm text-muted-foreground">
          Tu n&apos;étais pas encore membre quand cette tier list a été tirée : tu ne peux pas y répondre.
        </p>
      )}

      {!submitted && isTarget && !showEditor && (
        <Link href={`/r/${round.id}?play=1`} className="flex flex-col gap-1 rounded-2xl border-2 border-dashed border-board-edge p-4 text-center active:scale-99">
          <span className="font-display font-bold">Faire ma tier list →</span>
          <span className="text-sm text-muted-foreground">Elle est archivée : ta réponse te montre les résultats, mais ne compte pas dans ton compteur.</span>
        </Link>
      )}

      {results && <ResultsTabs data={results} members={members} />}
      </div>

      {/* Desktop: the thread lives in a sticky side panel, like a Discord forum post */}
      <aside className={showEditor && !thread ? "hidden" : "flex flex-col gap-4 xl:col-span-5 xl:min-h-0 xl:overflow-hidden xl:rounded-3xl xl:border-2 xl:border-board-edge xl:bg-board xl:p-6"}>
        {thread ? (
          <>
            <ReactionBar roundId={round.id} reactions={thread[1]} />
            <Comments roundId={round.id} comments={thread[0]} me={{ id: u.id, name: u.name, avatarFileId: u.avatarFileId }} />
          </>
        ) : (
          <div className="hidden flex-col items-center gap-3 py-16 text-center xl:flex">
            <p className="text-5xl">🔒</p>
            <h2 className="text-2xl font-extrabold">Discussion verrouillée</h2>
            <p className="text-muted-foreground">Fais ta tier list pour voir les résultats et ce que les autres en pensent.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
