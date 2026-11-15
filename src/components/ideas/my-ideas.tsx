"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IdeaForm } from "@/components/ideas/idea-form";
import { deleteIdea } from "@/app/actions/ideas";
import type { IdeaStatus } from "@/db/schema";
import { statusAfterEdit } from "@/lib/idea-rules";
import { useServerAction } from "@/hooks/use-server-action";

type Idea = { id: string; title: string; description: string | null; played: boolean; status: IdeaStatus };

// played ideas stay listed, greyed out and read-only
const row = cva("flex flex-col gap-2 rounded-lg border p-3", {
  variants: { played: { true: "border-board-edge opacity-50", false: "border-border" } },
});

/** What saving an edit will do to the idea: the server's own rule (statusAfterEdit), put into words. */
function editNotice(status: IdeaStatus, me: { id: string; isModerator: boolean }, validation: boolean) {
  const next = statusAfterEdit(me, { authorId: me.id, status }, validation);
  if (status === "rejected" && next === "approved") return "Une fois corrigée, ton idée retourne directement dans la banque.";
  if (status === "rejected" && next === "pending") return "Une fois corrigée, ton idée sera relue par un modo.";
  if (status === "approved" && next === "pending")
    return "Une fois modifiée, ton idée repasse en validation : elle sort de la banque jusqu'à ce qu'un modo la valide à nouveau.";
  return undefined;
}

export function MyIdeas({ ideas, validation, me }: { ideas: Idea[]; validation: boolean; me: { id: string; isModerator: boolean } }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, run } = useServerAction();

  const remove = (id: string) => run(() => deleteIdea(id), { success: "Idée supprimée", confirm: "Supprimer cette idée ?" });

  return (
    <ul className="flex flex-col gap-2">
      {ideas.map((i) => (
        <li key={i.id} className={row({ played: i.played })}>
          {editing === i.id ? (
            <IdeaForm
              editId={i.id}
              initial={{ title: i.title, description: i.description ?? "" }}
              notice={editNotice(i.status, me, validation)}
              onDone={() => setEditing(null)}
            />
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
