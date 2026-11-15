import Link from "next/link";
import { and, asc, desc, eq, isNotNull, isNull, ne, type SQL } from "drizzle-orm";
import { pageModerator } from "@/lib/permissions";
import { db, schema } from "@/db";
import { APP_TZ, DEFAULT_TTL_HOURS, MAX_TTL_HOURS, MIN_TTL_HOURS, dueDailyKey, nextDrawHint } from "@/lib/dates";
import { auditLabel } from "@/lib/audit-actions";
import { getActiveRounds, getDailyRoundId } from "@/server/rounds/queries";
import { getDrawHour, getIdeaValidation } from "@/server/settings";
import { availableIdea, countIdeas } from "@/server/ideas";
import { Countdown } from "@/components/board/countdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSettings, CreateExtraRound, DrawNow, IdeasPanel, Members, PendingUsers, type IdeaLists } from "@/components/mod/mod-panels";
import { LiveRefresh } from "@/components/board/live-refresh";
import { modVersion } from "@/server/live";
import { EmptyState } from "@/components/board/empty-state";

const memberCols = {
  id: schema.user.id,
  name: schema.user.name,
  avatarFileId: schema.user.avatarFileId,
  role: schema.user.role,
  status: schema.user.status,
};
/** Sign-ups only: the email helps recognise who's asking. Validated members' emails never leave the server. */
const signUpCols = { ...memberCols, email: schema.user.email };
/** Each idea tab lists at most this many (waiting: oldest first, others: newest first). */
const IDEA_LIMIT = 500;

const { ideas } = schema;
/** The /mod idea tabs. The bank = drawable ideas only (approved, never played). */
const IDEA_TABS: Record<keyof IdeaLists, { where: () => SQL | undefined; oldestFirst?: boolean }> = {
  pending: { where: () => eq(ideas.status, "pending"), oldestFirst: true },
  bank: { where: availableIdea },
  played: { where: () => isNotNull(ideas.usedAt) },
  rejected: { where: () => and(eq(ideas.status, "rejected"), isNull(ideas.usedAt)) },
};

async function ideaTab({ where, oldestFirst }: (typeof IDEA_TABS)[keyof IdeaLists]) {
  const rows = await db
    .select({ id: ideas.id, title: ideas.title, description: ideas.description, author: schema.user.name })
    .from(ideas)
    .leftJoin(schema.user, eq(schema.user.id, ideas.authorId))
    .where(where())
    .orderBy(oldestFirst ? asc(ideas.createdAt) : desc(ideas.createdAt))
    .limit(IDEA_LIMIT);
  // the exact count is only needed when the tab doesn't fit in the list
  const count = rows.length < IDEA_LIMIT ? rows.length : await countIdeas(where());
  return { ideas: rows, count };
}

export default async function ModPage() {
  const me = await pageModerator();
  const now = new Date();
  const drawHour = await getDrawHour();
  const dueKey = dueDailyKey(now, APP_TZ, drawHour);

  // version first: a change landing while the page renders is caught by the next poll
  const version = await modVersion();
  const [pending, members, pendingIdeas, bank, played, rejected, active, daily, logs, validation] = await Promise.all([
    db.select(signUpCols).from(schema.user).where(eq(schema.user.status, "pending")).orderBy(asc(schema.user.createdAt)),
    db.select(memberCols).from(schema.user).where(ne(schema.user.status, "pending")).orderBy(asc(schema.user.name)),
    ideaTab(IDEA_TABS.pending),
    ideaTab(IDEA_TABS.bank),
    ideaTab(IDEA_TABS.played),
    ideaTab(IDEA_TABS.rejected),
    getActiveRounds(now),
    // null before 08:00: nothing is due yet, so no manual draw button
    dueKey ? getDailyRoundId(dueKey) : Promise.resolve(null),
    db
      .select({ id: schema.auditLog.id, action: schema.auditLog.action, at: schema.auditLog.createdAt, actor: schema.user.name })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorId))
      .where(isNotNull(schema.auditLog.action))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(15),
    getIdeaValidation(),
  ]);

  const available = bank.count;
  const isAdmin = me.role === "admin";

  return (
    <div className="flex flex-col gap-4 xl:gap-6">
      <LiveRefresh scope="mod" initial={version} />
      <h1 className="text-2xl font-bold lg:text-5xl lg:font-extrabold">Modération</h1>

      {/* phone: one column (ideas after sign-ups); desktop: 2 independent columns, each as tall as its content */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
        <div className="contents xl:flex xl:min-w-0 xl:flex-1 xl:flex-col xl:gap-6">
          <Card className="order-1 xl:order-none">
            <CardHeader>
              <CardTitle>Tier lists en cours ({active.length})</CardTitle>
              <CardDescription>
                Tirage automatique chaque jour à {drawHour} h, pour {DEFAULT_TTL_HOURS} h. {available} idée(s) disponible(s) dans la banque.
                {available === 0 && ` ⚠️ ${nextDrawHint(0, drawHour, now)}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {active.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {active.map(({ round, idea }) => (
                      <li key={round.id}>
                        <Link href={`/r/${round.id}`} className="underline">
                          {idea.title}
                        </Link>{" "}
                        <span className="text-muted-foreground">
                          · {round.kind === "daily" ? "du jour" : "bonus"} · <Countdown expiresAt={round.expiresAt.toISOString()} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {dueKey && !daily && <DrawNow />}
                <CreateExtraRound ideas={bank.ideas.map((i) => ({ id: i.id, title: i.title }))} defaultTtl={DEFAULT_TTL_HOURS} minTtl={MIN_TTL_HOURS} maxTtl={MAX_TTL_HOURS} />
              </div>
            </CardContent>
          </Card>

          <Card className="order-2 xl:order-none">
            <CardHeader>
              <CardTitle>Inscriptions en attente ({pending.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <PendingUsers users={pending} />
            </CardContent>
          </Card>

          <Card className="order-4 xl:order-none">
            <CardHeader>
              <CardTitle>Membres ({members.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Members users={members} viewerId={me.id} viewerIsAdmin={isAdmin} />
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="order-5 xl:order-none">
              <CardHeader>
                <CardTitle>Réglages</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminSettings drawHour={drawHour} validation={validation} waiting={pendingIdeas.count} />
              </CardContent>
            </Card>
          )}

          <Card className="order-6 xl:order-none">
            <CardHeader>
              <CardTitle>Journal</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 && <EmptyState>Aucune action pour l&apos;instant.</EmptyState>}
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {logs.map((l) => (
                  <li key={l.id}>
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(l.at)} · {l.actor ?? "Automatique"} · {auditLabel(l.action)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="order-3 xl:order-none xl:min-w-0 xl:flex-1">
          <CardHeader>
            <CardTitle>Idées</CardTitle>
          </CardHeader>
          <CardContent>
            <IdeasPanel lists={{ pending: pendingIdeas, bank, played, rejected }} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
