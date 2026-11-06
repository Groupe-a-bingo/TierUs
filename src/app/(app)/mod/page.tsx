import Link from "next/link";
import { asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { pageModerator } from "@/lib/permissions";
import { db, schema } from "@/db";
import { dayKey } from "@/lib/dates";
import { getCurrentRound, getRoundByDate } from "@/server/rounds/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DrawNow, IdeaBank, Members, PendingUsers } from "@/components/mod/mod-panels";
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
  const today = dayKey();

  const [pending, members, ideas, current, logs] = await Promise.all([
    db.select(userCols).from(schema.user).where(eq(schema.user.status, "pending")).orderBy(asc(schema.user.createdAt)),
    db.select(userCols).from(schema.user).where(ne(schema.user.status, "pending")).orderBy(asc(schema.user.name)),
    db
      .select({
        id: schema.ideas.id,
        title: schema.ideas.title,
        description: schema.ideas.description,
        usedAt: schema.ideas.usedAt,
        author: schema.user.name,
      })
      .from(schema.ideas)
      .leftJoin(schema.user, eq(schema.user.id, schema.ideas.authorId))
      .orderBy(desc(schema.ideas.createdAt))
      .limit(1000),
    getCurrentRound(),
    db
      .select({ id: schema.auditLog.id, action: schema.auditLog.action, at: schema.auditLog.createdAt, actor: schema.user.name })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorId))
      .where(isNotNull(schema.auditLog.action))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(15),
  ]);

  const todayRound = current?.date === today ? await getRoundByDate(today) : null;
  const available = ideas.filter((i) => !i.usedAt).length;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <h1 className="text-2xl font-bold lg:col-span-2 lg:text-5xl lg:font-extrabold">Modération</h1>

      <Card>
        <CardHeader>
          <CardTitle>Aujourd&apos;hui</CardTitle>
          <CardDescription>
            {available} idée(s) disponible(s) dans la banque.
            {available === 0 && " ⚠️ Plus d'idées : pas de tier list demain !"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todayRound ? (
            <p className="text-sm">
              <Link href={`/r/${today}`} className="underline">
                {todayRound.idea.title}
              </Link>{" "}
              — révéler ou relancer le tirage depuis la page du post.
            </p>
          ) : (
            <DrawNow />
          )}
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

      <Card className="lg:row-span-3">
        <CardHeader>
          <CardTitle>Banque d&apos;idées</CardTitle>
        </CardHeader>
        <CardContent>
          <IdeaBank ideas={ideas.map((i) => ({ id: i.id, title: i.title, description: i.description, author: i.author, used: !!i.usedAt }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Members users={members} viewerId={me.id} viewerIsAdmin={me.role === "admin"} />
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
