"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { Wordmark } from "@/components/board/wordmark";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res =
        mode === "signup"
          ? await authClient.signUp.email({ name: form.name.trim(), email: form.email.trim(), password: form.password })
          : await authClient.signIn.email({ email: form.email.trim(), password: form.password });
      if (res.error) {
        toast.error(
          res.error.status === 429
            ? "Trop de tentatives, réessaie dans une minute"
            : res.error.message ?? "Identifiants invalides",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4 lg:flex-row lg:gap-24 lg:p-12">
      <div className="flex animate-rise flex-col items-center gap-3 text-center lg:max-w-lg lg:items-start lg:gap-6 lg:text-left">
        <Wordmark />
        <p className="font-display text-lg font-semibold text-muted-foreground lg:hidden">La tier list du jour, entre potes.</p>
        <p className="hidden font-display text-6xl leading-none font-extrabold lg:block">La tier list du jour, entre potes.</p>
        <p className="hidden text-lg text-muted-foreground lg:block">Chaque jour un thème tiré au hasard. Tu classes la commu de S à F, on révèle la moyenne quand tout le monde a joué.</p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signup" ? "Rejoindre TierUs" : "Connexion"}</CardTitle>
          <CardDescription>
            {mode === "signup"
              ? "Un modérateur validera ton compte avant que tu apparaisses dans les tier lists."
              : "La tier list du jour t'attend."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Pseudo</Label>
                <Input id="name" required minLength={2} maxLength={32} autoComplete="nickname" value={form.name} onChange={set("name")} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={mode === "signup" ? 10 : 1}
                maxLength={128}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={form.password}
                onChange={set("password")}
              />
              {mode === "signup" && <p className="text-xs text-muted-foreground">10 caractères minimum.</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? (
                <>
                  Déjà inscrit ? <Link href="/login" className="text-foreground underline">Connexion</Link>
                </>
              ) : (
                <>
                  Pas de compte ? <Link href="/signup" className="text-foreground underline">Inscription</Link>
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
