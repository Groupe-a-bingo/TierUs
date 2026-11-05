"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateName } from "@/app/actions/profile";

export function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateName(name);
          if (res.ok) toast.success("Pseudo mis à jour");
          else toast.error(res.error);
        });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={32} aria-label="Pseudo" />
      <Button type="submit" variant="secondary" disabled={pending || name.trim() === initial}>
        OK
      </Button>
    </form>
  );
}
