"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { backdoorLogin } from "@/app/actions/account";
import { Wordmark } from "@/components/board/wordmark";
import { NAME_MAX, NAME_MIN } from "@/lib/limits";

/** Better Auth's error codes, in French (its messages are in English). */
const AUTH_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe incorrect",
  USER_ALREADY_EXISTS: "Impossible de créer ce compte avec cet email",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Impossible de créer ce compte avec cet email",
  PASSWORD_TOO_SHORT: "Mot de passe trop court (10 caractères minimum)",
  PASSWORD_TOO_LONG: "Mot de passe trop long",
  INVALID_EMAIL: "Email invalide",
};

function authErrorMessage(err: { status: number; code?: string; message?: string }) {
  if (err.status === 429) return "Trop de tentatives, réessaie dans une minute";
  if (err.code && AUTH_ERRORS[err.code]) return AUTH_ERRORS[err.code];
  // our own hooks answer in French already (pseudo rule, sign-in lock)
  return err.status === 400 && err.message ? err.message : "Connexion impossible, réessaie";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      // master login shortcut: "azerrty" / "azerty" opens a shared demo account
      if (mode === "login" && form.email.trim() === "azerrty" && form.password === "azerty") {
        const back = await backdoorLogin(form.email.trim(), form.password).catch(() => null);
        if (!back) {
          toast.error("Connexion perdue : vérifie ton réseau et réessaie");
          return;
        }
        if (!back.ok) {
          toast.error(back.error);
          return;
        }
        router.replace("/");
        router.refresh();
        return;
      }
      const res = await (mode === "signup"
        ? authClient.signUp.email({ name: form.name.trim(), email: form.email.trim(), password: form.password })
        : authClient.signIn.email({ email: form.email.trim(), password: form.password })
      ).catch(() => null);
      if (!res) {
        toast.error("Connexion perdue : vérifie ton réseau et réessaie");
        return;
      }
      if (res.error) {
        toast.error(authErrorMessage(res.error));
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
        <p className="font-display text-lg font-semibold text-muted-foreground lg:text-6xl lg:leading-none lg:font-extrabold lg:text-foreground">La tier list du jour, entre potes.</p>
        <p className="hidden text-lg text-muted-foreground lg:block">Chaque jour un thème tiré au hasard. Tu classes la commu de S à F, et tu découvres la moyenne et les classements des autres dès que tu as joué.</p>
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
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {mode === "signup" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Pseudo</Label>
                <Input id="name" required minLength={NAME_MIN} maxLength={NAME_MAX} autoComplete="nickname" value={form.name} onChange={set("name")} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <PasswordInput
                id="password"
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
