import { desc, eq } from "drizzle-orm";
import { isModerator, pageUser } from "@/lib/permissions";
import { db, schema } from "@/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IdeaForm } from "@/components/ideas/idea-form";
import { MyIdeas } from "@/components/ideas/my-ideas";
import { EmptyState } from "@/components/board/empty-state";
import { getDrawHour, getIdeaValidation } from "@/server/settings";
import { ideasVersion } from "@/server/live";
import { LiveRefresh } from "@/components/board/live-refresh";

export default async function IdeasPage() {
  const u = await pageUser();
  // version first: a change landing while the page renders is caught by the next poll
  const version = await ideasVersion(u.id);
  // Only the viewer's own ideas. "Played" = already drawn into a tier list, which everyone has seen by then.
  const [mine, validation, drawHour] = await Promise.all([
    db
      .select({ id: schema.ideas.id, title: schema.ideas.title, description: schema.ideas.description, usedAt: schema.ideas.usedAt, status: schema.ideas.status })
      .from(schema.ideas)
      .where(eq(schema.ideas.authorId, u.id))
      .orderBy(desc(schema.ideas.createdAt))
      .limit(200),
    getIdeaValidation(),
    getDrawHour(),
  ]);
  const needsReview = validation;

  return (
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start xl:gap-10">
      <LiveRefresh scope="ideas" initial={version} />
      <h1 className="hidden text-5xl font-extrabold lg:block xl:col-span-2">La banque d&apos;idées</h1>
      <Card className="xl:sticky xl:top-10">
        <CardHeader>
          <CardTitle>Proposer une tier list</CardTitle>
          <CardDescription>
            {needsReview
              ? "Un modo relit ton idée avant qu'elle entre dans la banque secrète."
              : "Ton idée part directement dans la banque secrète."}{" "}
            Chaque jour à {drawHour} h, une idée est tirée au hasard (jamais deux fois la même).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IdeaForm needsReview={needsReview} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase lg:text-base">Mes idées ({mine.length})</h2>
        {mine.length === 0 ? (
          <EmptyState>Tu n&apos;as encore rien proposé.</EmptyState>
        ) : (
          <MyIdeas validation={validation} me={{ id: u.id, isModerator: isModerator(u) }} ideas={mine.map((i) => ({ id: i.id, title: i.title, description: i.description, played: !!i.usedAt, status: i.status }))} />
        )}
      </section>
    </div>
  );
}
