import { desc, eq } from "drizzle-orm";
import { pageUser } from "@/lib/permissions";
import { db, schema } from "@/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IdeaForm } from "@/components/ideas/idea-form";
import { MyIdeas } from "@/components/ideas/my-ideas";
import { EmptyState } from "@/components/board/empty-state";

export default async function IdeasPage() {
  const u = await pageUser();
  // Only the viewer's own ideas. "Played" = already drawn into a tier list, which everyone has seen by then.
  const mine = await db
    .select({ id: schema.ideas.id, title: schema.ideas.title, description: schema.ideas.description, usedAt: schema.ideas.usedAt })
    .from(schema.ideas)
    .where(eq(schema.ideas.authorId, u.id))
    .orderBy(desc(schema.ideas.createdAt))
    .limit(200);

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <h1 className="hidden text-5xl font-extrabold lg:col-span-2 lg:block">La banque d&apos;idées</h1>
      <Card className="lg:sticky lg:top-10">
        <CardHeader>
          <CardTitle>Proposer une tier list</CardTitle>
          <CardDescription>
            Ton idée part directement dans la banque secrète. Chaque jour à 8 h, une idée est tirée au hasard (jamais deux fois la même).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IdeaForm />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase lg:text-base">Mes idées ({mine.length})</h2>
        {mine.length === 0 ? (
          <EmptyState>Tu n&apos;as encore rien proposé.</EmptyState>
        ) : (
          <MyIdeas ideas={mine.map((i) => ({ id: i.id, title: i.title, description: i.description, played: !!i.usedAt }))} />
        )}
      </section>
    </div>
  );
}
