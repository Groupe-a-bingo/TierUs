import { desc, eq } from "drizzle-orm";
import { pageUser } from "@/lib/permissions";
import { db, schema } from "@/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IdeaForm } from "@/components/ideas/idea-form";

export default async function IdeasPage() {
  const u = await pageUser();
  // Only the viewer's own ideas, and never whether they were drawn (keeps the surprise)
  const mine = await db
    .select({ id: schema.ideas.id, title: schema.ideas.title, description: schema.ideas.description, createdAt: schema.ideas.createdAt })
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
            Ton idée part directement dans la banque secrète. Chaque jour, une idée est tirée au hasard (jamais deux fois la même).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IdeaForm />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase lg:text-base">Mes idées ({mine.length})</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tu n&apos;as encore rien proposé.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((i) => (
              <li key={i.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{i.title}</p>
                {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
