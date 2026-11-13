"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import { Ban, MoreHorizontal, ShieldMinus, ShieldPlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { IdeaForm } from "@/components/ideas/idea-form";
import { setIdeaValidationAction, setUserRole, setUserStatus } from "@/app/actions/moderation";
import { deleteIdea, reviewIdeaAction } from "@/app/actions/ideas";
import { createExtraRoundAction, drawNowAction } from "@/app/actions/rounds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/board/empty-state";
import { useServerAction } from "@/hooks/use-server-action";
import type { Member } from "@/lib/types";

/**
 * Moderation calls: a refusal usually means the page is out of date (idea
 * edited or already reviewed, member changed): reload it. On success the
 * action revalidates and the fresh UI comes back in the same response.
 */
function useModAction() {
  const { pending, run } = useServerAction();
  return {
    pending,
    run: (fn: Parameters<typeof run>[0], success: string, confirm?: string) => run(fn, { success, confirm, refreshOnError: true }),
  };
}

type ModMember = Member & { role: string; status: string };

export function PendingUsers({ users }: { users: (ModMember & { email: string })[] }) {
  const { pending, run } = useModAction();
  if (!users.length) return <EmptyState>Aucune inscription en attente.</EmptyState>;
  return (
    <ul className="flex flex-col gap-3">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <AvatarTile name={u.name} fileId={u.avatarFileId} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            {!u.avatarFileId && <p className="text-xs text-muted-foreground">Pas encore de photo</p>}
          </div>
          <Button
            size="sm"
            disabled={pending || !u.avatarFileId}
            title={u.avatarFileId ? undefined : "Il faut une photo de profil pour être validé"}
            onClick={() => run(() => setUserStatus(u.id, "active"), `${u.name} validé`)}
          >
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

const roleLabel: Record<string, string> = { moderator: "modo", admin: "admin" };

/** Secondary actions sit behind a "⋯" menu: the row only shows who the member is. */
export function Members({ users, viewerId, viewerIsAdmin }: { users: ModMember[]; viewerId: string; viewerIsAdmin: boolean }) {
  const { pending, run } = useModAction();
  return (
    <ul className="flex flex-col gap-3">
      {users.map((u) => {
        const canEditRole = viewerIsAdmin && u.status === "active";
        return (
          <li key={u.id} className="flex items-center gap-3">
            <AvatarTile name={u.name} fileId={u.avatarFileId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-medium">
                {u.name}
                {u.role !== "member" && <Badge variant="secondary">{roleLabel[u.role] ?? u.role}</Badge>}
                {u.status === "rejected" && <Badge variant="destructive">banni</Badge>}
              </p>
            </div>
            {u.id !== viewerId && u.role !== "admin" && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Actions pour ${u.name}`} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditRole &&
                    (u.role === "moderator" ? (
                      <DropdownMenuItem onClick={() => run(() => setUserRole(u.id, "member"), `${u.name} n'est plus modo`)}>
                        <ShieldMinus />
                        Retirer le rôle de modo
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => run(() => setUserRole(u.id, "moderator"), `${u.name} est modo`)}>
                        <ShieldPlus />
                        Nommer modérateur
                      </DropdownMenuItem>
                    ))}
                  {canEditRole && <DropdownMenuSeparator />}
                  {u.status === "active" ? (
                    <DropdownMenuItem variant="destructive" onClick={() => run(() => setUserStatus(u.id, "rejected"), "Membre banni", `Bannir ${u.name} ? Ses sessions seront fermées.`)}>
                      <Ban />
                      Bannir
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => run(() => setUserStatus(u.id, "active"), "Réintégré")}>
                      <Undo2 />
                      Réintégrer
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type PendingIdea = { id: string; title: string; description: string | null; author: string | null };

/** What the moderator is looking at: the review only applies if the idea still reads exactly like this. */
const seenText = (i: { title: string; description: string | null }) => ({ title: i.title, description: i.description });

/** Ideas waiting for validation, oldest first: approved ones enter the bank. */
export function PendingIdeas({ ideas }: { ideas: PendingIdea[] }) {
  const { pending, run } = useModAction();
  if (!ideas.length) return <EmptyState>Aucune idée à valider.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {ideas.map((i) => (
        <li key={i.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <p className="font-medium">{i.title}</p>
            {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
            <p className="text-xs text-muted-foreground">par {i.author ?? "compte supprimé"}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => reviewIdeaAction(i.id, "approved", seenText(i)), "Idée ajoutée à la banque")}>
              Valider
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => reviewIdeaAction(i.id, "rejected", seenText(i)), "Idée refusée", `Refuser « ${i.title} » ?`)}>
              Refuser
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Admin switch for idea validation. Turning it off releases the waiting ideas into the bank.
 * The server refuses a no-op (page out of date): we then reload the real state.
 */
export function IdeaValidationToggle({ enabled, waiting }: { enabled: boolean; waiting: number }) {
  const { pending, run } = useServerAction();
  const toggle = () =>
    run(() => setIdeaValidationAction(!enabled), {
      confirm: enabled && waiting ? `Désactiver la validation ? Les idées en attente (${waiting}) partiront directement dans la banque.` : undefined,
      refreshOnError: true,
      success: (data) => {
        const released = data?.approved ?? 0;
        return enabled ? `Validation désactivée${released ? ` · ${released} idée(s) entrée(s) dans la banque` : ""}` : "Validation activée";
      },
    });
  // fixed name + aria-pressed: screen readers announce "Validation des idées, activé"
  return (
    <Button size="sm" variant={enabled ? "default" : "outline"} aria-pressed={enabled} disabled={pending} onClick={toggle}>
      Validation des idées : {enabled ? "activée" : "désactivée"}
    </Button>
  );
}

// played and refused ideas stay listed, greyed out (played ones are read-only)
const ideaRow = cva("flex flex-col gap-2 rounded-lg border p-3", {
  variants: { used: { true: "border-board-edge opacity-50", false: "border-border" } },
});

type Idea = { id: string; title: string; description: string | null; author: string | null; used: boolean; rejected: boolean };
type BankFilter = "available" | "used" | "rejected" | "all";

export function IdeaBank({ ideas, availableCount }: { ideas: Idea[]; availableCount: number }) {
  const { pending, run } = useModAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<BankFilter>("available");
  const matches: Record<BankFilter, (i: Idea) => boolean> = {
    available: (i) => !i.used && !i.rejected,
    used: (i) => i.used,
    rejected: (i) => i.rejected,
    all: () => true,
  };
  const label: Record<BankFilter, string> = {
    available: `Dispo (${availableCount})`,
    used: "Utilisées",
    rejected: "Refusées",
    all: "Toutes",
  };
  const shown = ideas.filter(matches[filter]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(["available", "used", "rejected", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label[f]}
          </Button>
        ))}
      </div>
      {shown.length === 0 && <EmptyState>Aucune idée ici.</EmptyState>}
      <ul className="flex flex-col gap-2">
        {shown.map((i) => (
          <li key={i.id} className={ideaRow({ used: i.used || i.rejected })}>
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
                  {i.rejected && <Badge variant="destructive">refusée</Badge>}
                </div>
                {!i.used && (
                  <div className="flex flex-wrap gap-2">
                    {i.rejected && (
                      <Button size="sm" disabled={pending} onClick={() => run(() => reviewIdeaAction(i.id, "approved", seenText(i)), "Idée remise dans la banque")}>
                        Remettre dans la banque
                      </Button>
                    )}
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
  const { pending, run } = useModAction();
  return (
    <Button disabled={pending} onClick={() => run(() => drawNowAction(), "Tier list du jour tirée !")}>
      Tirer la tier list du jour maintenant
    </Button>
  );
}

/** Extra tier list on top of the daily one, with its own lifetime (TTL, in real hours). */
export function CreateExtraRound({ defaultTtl, minTtl, maxTtl, disabled }: { defaultTtl: number; minTtl: number; maxTtl: number; disabled: boolean }) {
  const { pending, run } = useModAction();
  const [ttl, setTtl] = useState(String(defaultTtl));
  const hours = Number(ttl);
  const valid = Number.isInteger(hours) && hours >= minTtl && hours <= maxTtl;
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) run(() => createExtraRoundAction(hours), "Tier list supplémentaire créée !", `Tirer une idée de la banque pour une tier list de ${hours} h ?`);
      }}
    >
      <Label htmlFor="extra-ttl">Tier list supplémentaire</Label>
      <p className="text-xs text-muted-foreground">Une idée tirée au hasard dans la banque, en plus de celle du jour. Elle part dans les archives à la fin de sa durée.</p>
      <div className="flex items-center gap-2">
        <div className="w-24">
          <Input
            id="extra-ttl"
            type="number"
            inputMode="numeric"
            min={minTtl}
            max={maxTtl}
            step={1}
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            aria-describedby="extra-ttl-unit"
          />
        </div>
        <span id="extra-ttl-unit" className="flex-1 text-sm text-muted-foreground">
          heures ({minTtl}–{maxTtl})
        </span>
        <Button type="submit" disabled={pending || disabled || !valid}>
          Créer
        </Button>
      </div>
      {disabled && <p className="text-xs text-muted-foreground">La banque d&apos;idées est vide.</p>}
    </form>
  );
}
