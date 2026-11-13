"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cva } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IdeaForm } from "@/components/ideas/idea-form";
import { deleteIdea } from "@/app/actions/ideas";
import type { IdeaStatus } from "@/db/schema";

type Idea = { id: string; title: string; description: string | null; played: boolean; status: IdeaStatus };

// played ideas stay listed, greyed out and read-only
const row = cva("flex flex-col gap-2 rounded-lg border p-3", {
  variants: { played: { true: "border-board-edge opacity-50", false: "border-border" } },
});

export function MyIdeas({ ideas }: { ideas: Idea[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (id: string) => {
    if (!confirm("Supprimer cette idée ?")) return;
    startTransition(async () => {
      const res = await deleteIdea(id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Idée supprimée");
    });
  };

  return (
    <ul className="flex flex-col gap-2">
      {ideas.map((i) => (
        <li key={i.id} className={row({ played: i.played })}>
          {editing === i.id ? (
            <IdeaForm editId={i.id} initial={{ title: i.title, description: i.description ?? "" }} onDone={() => setEditing(null)} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{i.title}</p>
                  {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                </div>
                {i.played ? (
                  <Badge variant="outline">jouée</Badge>
                ) : i.status === "pending" ? (
                  <Badge variant="outline">en attente</Badge>
                ) : (
                  i.status === "rejected" && <Badge variant="destructive">refusée</Badge>
                )}
              </div>
              {!i.played && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(i.id)}>
                    Modifier
                  </Button>
                  <Button size="sm" variant="destructive" disabled={pending} onClick={() => remove(i.id)}>
                    Supprimer
                  </Button>
                </div>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
