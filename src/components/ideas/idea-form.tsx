"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { addIdea, updateIdea } from "@/app/actions/ideas";

type Props = {
  editId?: string;
  initial?: { title: string; description: string };
  onDone?: () => void;
  /** idea validation is on for this member: new ideas wait for a moderator */
  needsReview?: boolean;
  /** shown above the submit button, e.g. "this edit sends the idea back for review" */
  notice?: string;
};

export function IdeaForm({ editId, initial, onDone, needsReview = false, notice }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = editId ? await updateIdea(editId, { title, description }) : await addIdea({ title, description });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          const waiting = res.data?.status === "pending";
          if (editId) toast.success(waiting ? "Idée modifiée · en attente de validation" : "Idée modifiée");
          else toast.success(waiting ? "Idée envoyée aux modos ✋" : "Idée ajoutée à la banque 🎲");
          if (!editId) {
            setTitle("");
            setDescription("");
          }
          onDone?.();
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
          minLength={3}
          maxLength={120}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`desc-${editId ?? "new"}`}>Précisions (optionnel)</Label>
        <Textarea id={`desc-${editId ?? "new"}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
      </div>
      {notice && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      )}
      <Button type="submit" disabled={pending || title.trim().length < 3}>
        {editId ? "Enregistrer" : needsReview ? "Proposer l'idée" : "Ajouter à la banque"}
      </Button>
    </form>
  );
}
