"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { addIdea, updateIdea } from "@/app/actions/ideas";
import { IDEA_DESCRIPTION_MAX, IDEA_TITLE_MAX, IDEA_TITLE_MIN } from "@/lib/limits";
import { useServerAction } from "@/hooks/use-server-action";

type Props = {
  editId?: string;
  initial?: { title: string; description: string };
  /** after saving, or cancelling an edit */
  onDone?: () => void;
  /** idea validation is on for this member: new ideas wait for a moderator */
  needsReview?: boolean;
  /** shown above the submit button, e.g. "this edit sends the idea back for review" */
  notice?: string;
};

export function IdeaForm({ editId, initial, onDone, needsReview = false, notice }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const { pending, run } = useServerAction();

  return (
    <form
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (editId && e.key === "Escape") onDone?.();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (editId ? updateIdea(editId, { title, description }) : addIdea({ title, description })), {
          success: (data) => {
            const waiting = data?.status === "pending";
            if (editId) return waiting ? "Idée modifiée · en attente de validation" : "Idée modifiée";
            return waiting ? "Idée envoyée aux modos ✋" : "Idée ajoutée à la banque 🎲";
          },
          onSuccess: () => {
            if (!editId) {
              setTitle("");
              setDescription("");
            }
            onDone?.();
          },
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`title-${editId ?? "new"}`}>Thème de la tier list</Label>
        <Input
          id={`title-${editId ?? "new"}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Qui survivrait à une apocalypse zombie ?"
          minLength={IDEA_TITLE_MIN}
          maxLength={IDEA_TITLE_MAX}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`desc-${editId ?? "new"}`}>Précisions (optionnel)</Label>
        <Textarea id={`desc-${editId ?? "new"}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={IDEA_DESCRIPTION_MAX} rows={2} />
      </div>
      {notice && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending || title.trim().length < IDEA_TITLE_MIN}>
          {editId ? "Enregistrer" : needsReview ? "Proposer l'idée" : "Ajouter à la banque"}
        </Button>
        {editId && onDone && (
          <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
