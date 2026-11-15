"use client";

import { useState } from "react";
import { cva } from "class-variance-authority";
import { Ban, MoreHorizontal, Pencil, ShieldMinus, ShieldPlus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AvatarTile } from "@/components/tier-board/avatar-tile";
import { IdeaForm } from "@/components/ideas/idea-form";
import { setDrawHourAction, setIdeaValidationAction, setUserRole, setUserStatus } from "@/app/actions/moderation";
import { deleteIdea, reviewIdeaAction } from "@/app/actions/ideas";
import { createExtraRoundAction, drawNowAction } from "@/app/actions/rounds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/**
 * An address split around the "@" in separate elements: Cloudflare's email
 * obfuscation only rewrites a whole address in one text node, and its rewrite
 * (a protected link) breaks React's hydration of the page.
 */
function Email({ address }: { address: string }) {
  const at = address.lastIndexOf("@");
  if (at < 0) return address;
  return (
    <>
      <span>{address.slice(0, at)}</span>
      <span>@</span>
      <span>{address.slice(at + 1)}</span>
    </>
  );
}

export function PendingUsers({ users }: { users: (ModMember & { email: string })[] }) {
  const { pending, run } = useModAction();
  if (!users.length) return <EmptyState>Aucune inscription en attente.</EmptyState>;
  return (
    <ul className="flex max-h-list flex-col gap-3 overflow-y-auto pr-1 scrollbar-theme">
      {users.map((u) => (
        // narrow screens: the buttons wrap under the name instead of squeezing it
        <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AvatarTile name={u.name} fileId={u.avatarFileId} size="sm" />
          <div className="min-w-0 flex-1 basis-32">
            <p className="truncate font-medium">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <Email address={u.email} />
            </p>
            {!u.avatarFileId && <p className="text-xs text-muted-foreground">Pas encore de photo</p>}
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => setUserStatus(u.id, "active"), `${u.name} validé`)}>
              Valider
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => setUserStatus(u.id, "rejected"), "Refusé", `Refuser ${u.name} ?`)}>
              Refuser
            </Button>
          </div>
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
    <ul className="flex max-h-list flex-col gap-3 overflow-y-auto pr-1 scrollbar-theme">
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

/**
 * Admin settings. Idea validation: turning it off releases the waiting ideas
 * into the bank. Draw hour: moved earlier than now, today's missing daily is
 * drawn right away. The server refuses a no-op (page out of date): we then reload the real state.
 */
export function AdminSettings({ drawHour, validation, waiting }: { drawHour: number; validation: boolean; waiting: number }) {
  const { pending, run } = useServerAction();
  const hours = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h} h` }));

  const toggle = () =>
    run(() => setIdeaValidationAction(!validation), {
      confirm: validation && waiting ? `Désactiver la validation ? Les idées en attente (${waiting}) partiront directement dans la banque.` : undefined,
      refreshOnError: true,
      success: (data) => {
        const released = data?.approved ?? 0;
        return validation ? `Validation désactivée${released ? ` · ${released} idée(s) entrée(s) dans la banque` : ""}` : "Validation activée";
      },
    });
  const setHour = (h: number) =>
    h !== drawHour && run(() => setDrawHourAction(h), { success: `Tirage à ${h} h`, confirm: `Tirer la tier list du jour à ${h} h ?`, refreshOnError: true });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Label id="setting-hour">Heure du tirage</Label>
        <div className="w-28">
          <Select items={hours} value={drawHour} onValueChange={(v) => setHour(Number(v))} disabled={pending}>
            <SelectTrigger aria-labelledby="setting-hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hours.map((h) => (
                <SelectItem key={h.value} value={h.value}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label id="setting-validation">Validation des idées</Label>
        <Button variant={validation ? "default" : "outline"} aria-pressed={validation} aria-labelledby="setting-validation" disabled={pending} onClick={toggle}>
          {validation ? "Activée" : "Désactivée"}
        </Button>
      </div>
    </div>
  );
}

// played ideas stay listed, greyed out and read-only; refused ones stay fully usable
const ideaRow = cva("flex flex-col gap-2 rounded-lg border p-3", {
  variants: { played: { true: "border-board-edge opacity-50", false: "border-border" } },
});

type Idea = { id: string; title: string; description: string | null; author: string | null };
export type IdeaTab = "pending" | "bank" | "played" | "rejected";
export type IdeaLists = Record<IdeaTab, { ideas: Idea[]; count: number }>;

/** What the moderator is looking at: the review only applies if the idea still reads exactly like this. */
const seenText = (i: { title: string; description: string | null }) => ({ title: i.title, description: i.description });

const TABS: { tab: IdeaTab; label: string; empty: string }[] = [
  { tab: "pending", label: "À valider", empty: "Aucune idée à valider." },
  { tab: "bank", label: "Banque", empty: "La banque est vide." },
  { tab: "played", label: "Jouées", empty: "Aucune idée jouée pour l'instant." },
  { tab: "rejected", label: "Refusées", empty: "Aucune idée refusée." },
];

/**
 * Every idea, by state. The bank only holds the drawable ones (approved, never
 * played): waiting and refused ideas have their own tab.
 */
export function IdeasPanel({ lists }: { lists: IdeaLists }) {
  const { pending, run } = useModAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<IdeaTab>(lists.pending.count > 0 ? "pending" : "bank");
  const { ideas } = lists[tab];

  const remove = (i: Idea) => run(() => deleteIdea(i.id), "Idée supprimée", `Supprimer « ${i.title} » ?`);
  const more = (i: Idea) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Actions pour « ${i.title} »`} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setEditing(i.id)}>
          <Pencil />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => remove(i)}>
          <Trash2 />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col gap-3 xl:h-full">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les idées">
        {TABS.map((t) => (
          <Button key={t.tab} size="sm" variant={tab === t.tab ? "default" : "outline"} aria-pressed={tab === t.tab} onClick={() => setTab(t.tab)}>
            {t.label} ({lists[t.tab].count})
          </Button>
        ))}
      </div>
      {ideas.length === 0 && <EmptyState>{TABS.find((t) => t.tab === tab)!.empty}</EmptyState>}
      <ul className="flex max-h-list flex-col gap-2 overflow-y-auto pr-1 scrollbar-theme xl:max-h-none xl:min-h-0 xl:flex-1">
        {ideas.map((i) => (
          <li key={i.id} className={ideaRow({ played: tab === "played" })}>
            {editing === i.id ? (
              <IdeaForm editId={i.id} initial={{ title: i.title, description: i.description ?? "" }} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 basis-48 break-words">
                  <p className="font-medium">{i.title}</p>
                  {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                  <p className="text-xs text-muted-foreground">par {i.author ?? "compte supprimé"}</p>
                </div>
                {tab === "pending" && (
                  <div className="ml-auto flex shrink-0 gap-2">
                    <Button size="sm" disabled={pending} onClick={() => run(() => reviewIdeaAction(i.id, "approved", seenText(i)), "Idée ajoutée à la banque")}>
                      Valider
                    </Button>
                    <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => reviewIdeaAction(i.id, "rejected", seenText(i)), "Idée refusée", `Refuser « ${i.title} » ?`)}>
                      Refuser
                    </Button>
                  </div>
                )}
                {tab === "bank" && more(i)}
                {tab === "rejected" && (
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Button size="sm" disabled={pending} onClick={() => run(() => reviewIdeaAction(i.id, "approved", seenText(i)), "Idée remise dans la banque")}>
                      Remettre dans la banque
                    </Button>
                    {more(i)}
                  </div>
                )}
              </div>
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

const RANDOM = "random";
const DURATIONS = [1, 3, 6, 12, 24, 48, 72, 168];
const durationLabel = (h: number) => (h < 48 ? `${h} h` : `${h / 24} j`);

/** Extra tier list on top of the daily one: an idea from the bank (picked, or at random) and its lifetime (TTL, in real hours). */
export function CreateExtraRound({ ideas, defaultTtl, minTtl, maxTtl }: { ideas: { id: string; title: string }[]; defaultTtl: number; minTtl: number; maxTtl: number }) {
  const { pending, run } = useModAction();
  const [idea, setIdea] = useState(RANDOM);
  const [ttl, setTtl] = useState(defaultTtl);
  const durations = DURATIONS.filter((h) => h >= minTtl && h <= maxTtl).map((h) => ({ value: h, label: durationLabel(h) }));
  const ideaItems = [{ value: RANDOM, label: "Au hasard" }, ...ideas.map((i) => ({ value: i.id, label: i.title }))];
  // the chosen idea left the bank (drawn, deleted…): back to random
  const chosen = ideas.find((i) => i.id === idea);
  const empty = ideas.length === 0;

  const create = () =>
    run(
      () => createExtraRoundAction(ttl, chosen?.id),
      "Tier list supplémentaire créée !",
      chosen ? `Lancer « ${chosen.title} » pour ${durationLabel(ttl)} ?` : `Tirer une idée au hasard pour ${durationLabel(ttl)} ?`,
    );

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <p className="font-medium">Tier list supplémentaire</p>
      <div className="flex flex-col gap-1.5">
        <Label id="extra-idea">Idée</Label>
        <Select items={ideaItems} value={chosen ? idea : RANDOM} onValueChange={(v) => setIdea(String(v ?? RANDOM))} disabled={empty}>
          <SelectTrigger aria-labelledby="extra-idea">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ideaItems.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label id="extra-ttl">Durée</Label>
          <Select items={durations} value={ttl} onValueChange={(v) => setTtl(Number(v ?? defaultTtl))} disabled={empty}>
            <SelectTrigger aria-labelledby="extra-ttl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durations.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="lg" disabled={pending || empty}>
          Créer
        </Button>
      </div>
    </form>
  );
}
