"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { updateName } from "@/app/actions/profile";

/** Pseudo field: the save button only shows up once you've changed something. */
export function NameForm({ initial }: { initial: string }) {
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== saved && name.trim().length >= 2;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty) return;
        startTransition(async () => {
          const res = await updateName(name);
          if (!res.ok) toast.error(res.error);
          else {
            setSaved(name.trim());
            toast.success("Pseudo enregistré");
          }
        });
      }}
    >
      <Label htmlFor="pseudo">Pseudo</Label>
      <div className="flex h-12 items-center gap-2 rounded-xl border-2 border-board-edge bg-board pr-1.5 pl-4 focus-within:border-primary">
        <input
          id="pseudo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={32}
          autoComplete="nickname"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {dirty && (
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 animate-pop-in items-center gap-1 rounded-lg border-2 border-ink bg-primary px-3 font-display text-sm font-bold text-primary-foreground shadow-pop-sm active:translate-y-0.5 active:shadow-none"
          >
            <Check className="size-4" /> {pending ? "…" : "Enregistrer"}
          </button>
        )}
      </div>
    </form>
  );
}
