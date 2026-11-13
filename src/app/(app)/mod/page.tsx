import Link from "next/link";
import { asc, desc, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { pageModerator } from "@/lib/permissions";
import { db, schema } from "@/db";
import { DAILY_DRAW_HOUR, DEFAULT_TTL_HOURS, MAX_TTL_HOURS, MIN_TTL_HOURS, dueDailyKey, formatRemaining } from "@/lib/dates";
import { getActiveRounds, getDailyRound } from "@/server/rounds/queries";
import { getIdeaValidation } from "@/server/settings";
import { availableIdea } from "@/server/ideas";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateExtraRound, DrawNow, IdeaBank, IdeaValidationToggle, Members, PendingIdeas, PendingUsers } from "@/components/mod/mod-panels";
import { EmptyState } from "@/components/board/empty-state";

const userCols = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  avatarFileId: schema.user.avatarFileId,
  role: schema.user.role,
  status: schema.user.status,
};

export default async function ModPage() {
  const me = await pageModerator();
  const now = new Date();
  const dueKey = dueDailyKey(now);

  const ideaCols = {
    id: schema.ideas.id,
    title: schema.ideas.title,
    description: schema.ideas.description,
    usedAt: schema.ideas.usedAt,
    status: schema.ideas.status,
    author: schema.user.name,
  };
  const countIdeas = (where: SQL | undefined) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.ideas)
      .where(where)
      .then((r) => r[0]?.n ?? 0);

  const [pending, members, ideas, waiting, waitingCount, available, active, daily, logs, validation] = await Promise.all([
    db.select(userCols).from(schema.user).where(eq(schema.user.status, "pending")).orderBy(asc(schema.user.createdAt)),
    db.select(userCols).from(schema.user).where(ne(schema.user.status, "pending")).orderBy(asc(schema.user.name)),
    // the bank (approved + refused), newest first
    db
      .select(ideaCols)
      .from(schema.ideas)
      .leftJoin(schema.user, eq(schema.user.id, schema.ideas.authorId))
      .where(ne(schema.ideas.status, "pending"))
      .orderBy(desc(schema.ideas.createdAt))
      .limit(1000),
    // the validation queue, oldest first like the sign-ups (its own query: never cut by the bank's limit)
    db
      .select(ideaCols)
      .from(schema.ideas)
      .leftJoin(schema.user, eq(schema.user.id, schema.ideas.authorId))
      .where(eq(schema.ideas.status, "pending"))
      .orderBy(asc(schema.ideas.createdAt))
      .limit(200),
    countIdeas(eq(schema.ideas.status, "pending")),
    countIdeas(availableIdea()),
    getActiveRounds(now),
    // null before 08:00: nothing is due yet, so no manual draw button
    dueKey ? getDailyRound(dueKey) : Promise.resolve(null),
    db
      .select({ id: schema.auditLog.id, action: schema.auditLog.action, at: schema.auditLog.createdAt, actor: schema.user.name })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorId))
      .where(isNotNull(schema.auditLog.action))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(15),
    getIdeaValidation(),
  ]);

  const isAdmin = me.role === "admin";

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <h1 className="text-2xl font-bold lg:col-span-2 lg:text-5xl lg:font-extrabold">Modération</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tier lists en cours ({active.length})</CardTitle>
          <CardDescription>
            Tirage automatique chaque jour à {DAILY_DRAW_HOUR} h, pour {DEFAULT_TTL_HOURS} h. {available} idée(s) disponible(s) dans la banque.
            {available === 0 && " ⚠️ Banque vide : la prochaine idée proposée lancera le tirage manquant."}
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
                      · {round.kind === "daily" ? "du jour" : "bonus"} · {formatRemaining(round.expiresAt.getTime() - now.getTime())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {dueKey && !daily && <DrawNow />}
            <CreateExtraRound defaultTtl={DEFAULT_TTL_HOURS} minTtl={MIN_TTL_HOURS} maxTtl={MAX_TTL_HOURS} disabled={available === 0} />
            <p className="text-xs text-muted-foreground">Relancer le tirage : depuis la page d&apos;une tier list tant que personne n&apos;a joué.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inscriptions en attente ({pending.length})</CardTitle>
          <CardDescription>Sans photo, le membre apparaîtra avec ses initiales.</CardDescription>
        </CardHeader>
        <CardContent>
          <PendingUsers users={pending} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Idées à valider ({waitingCount})</CardTitle>
          <CardDescription>
            {validation
              ? "Les idées des membres attendent ici qu'un modo les valide avant d'entrer dans la banque."
              : "Validation désactivée : les idées proposées partent directement dans la banque."}
          </CardDescription>
          {isAdmin && (
            <CardAction>
              <IdeaValidationToggle enabled={validation} waiting={waitingCount} />
            </CardAction>
          )}
        </CardHeader>
        {(validation || waitingCount > 0) && (
          <CardContent>
            <PendingIdeas ideas={waiting.map((i) => ({ id: i.id, title: i.title, description: i.description, author: i.author }))} />
          </CardContent>
        )}
      </Card>

      <Card className="lg:row-span-3">
        <CardHeader>
          <CardTitle>Banque d&apos;idées</CardTitle>
        </CardHeader>
        <CardContent>
          <IdeaBank
            ideas={ideas.map((i) => ({ id: i.id, title: i.title, description: i.description, author: i.author, used: !!i.usedAt, rejected: i.status === "rejected" }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Members users={members} viewerId={me.id} viewerIsAdmin={isAdmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 && <EmptyState>Aucune action pour l&apos;instant.</EmptyState>}
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {logs.map((l) => (
              <li key={l.id}>
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(l.at)} · {l.actor ?? "?"} · {l.action}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
