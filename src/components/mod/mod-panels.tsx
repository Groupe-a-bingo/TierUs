"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { IdeaForm } from "@/components/ideas/idea-form";
import { setUserRole, setUserStatus } from "@/app/actions/moderation";
import { deleteIdea } from "@/app/actions/ideas";
import { drawNowAction } from "@/app/actions/rounds";
import type { ActionResult } from "@/lib/errors";

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, ok: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else toast.success(ok); // actions revalidate: fresh UI comes back in the same response
    });
  };
  return { pending, run };
}

type U = { id: string; name: string; email: string; avatarFileId: string | null; role: string; status: string };

export function PendingUsers({ users }: { users: U[] }) {
  const { pending, run } = useAction();
  if (!users.length) return <p className="text-sm text-muted-foreground">Aucune inscription en attente.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <AvatarTile name={u.name} fileId={u.avatarFileId} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
          <Button size="sm" disabled={pending || !u.avatarFileId} title={u.avatarFileId ? "" : "Pas encore de photo"} onClick={() => run(() => setUserStatus(u.id, "active"), `${u.name} validé`)}>
            Valider
          </Button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => setUserStatus(u.id, "rejected"), "Refusé", `Refuser ${u.name} ?`)}>
            Refuser
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function Members({ users, viewerId, viewerIsAdmin }: { users: U[]; viewerId: string; viewerIsAdmin: boolean }) {
  const { pending, run } = useAction();
  return (
    <ul className="flex flex-col gap-3">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <AvatarTile name={u.name} fileId={u.avatarFileId} size="sm" shape="round" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-medium">
              {u.name}
              {u.role !== "member" && <Badge variant="secondary">{u.role}</Badge>}
              {u.status === "rejected" && <Badge variant="destructive">banni</Badge>}
            </p>
          </div>
          {u.id !== viewerId && u.role !== "admin" && (
            <>
              {viewerIsAdmin && u.status === "active" && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setUserRole(u.id, u.role === "moderator" ? "member" : "moderator"), "Rôle mis à jour")}>
                  {u.role === "moderator" ? "Retirer modo" : "Passer modo"}
                </Button>
              )}
              {u.status === "active" ? (
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => setUserStatus(u.id, "rejected"), "Membre banni", `Bannir ${u.name} ? Ses sessions seront fermées.`)}>
                  Bannir
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setUserStatus(u.id, "active"), "Réintégré")}>
                  Réintégrer
                </Button>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

type Idea = { id: string; title: string; description: string | null; author: string | null; used: boolean };

export function IdeaBank({ ideas }: { ideas: Idea[] }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"available" | "used" | "all">("available");
  const shown = ideas.filter((i) => (filter === "all" ? true : filter === "used" ? i.used : !i.used));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["available", "used", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "available" ? `Dispo (${ideas.filter((i) => !i.used).length})` : f === "used" ? "Utilisées" : "Toutes"}
          </Button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((i) => (
          <li key={i.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            {editing === i.id ? (
              <IdeaForm editId={i.id} initial={{ title: i.title, description: i.description ?? "" }} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{i.title}</p>
                    {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                    <p className="text-xs text-muted-foreground">par {i.author ?? "compte supprimé"}</p>
                  </div>
                  {i.used && <Badge variant="outline">utilisée</Badge>}
                </div>
                {!i.used && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(i.id)}>
                      Modifier
                    </Button>
                    <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteIdea(i.id), "Idée supprimée", "Supprimer cette idée ?")}>
                      Supprimer
                    </Button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DrawNow() {
  const { pending, run } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => drawNowAction(), "Tier list du jour tirée !")}>
      Tirer la tier list du jour maintenant
    </Button>
  );
}
