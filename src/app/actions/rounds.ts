"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActiveUser, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, runAction } from "@/lib/errors";
import { submitTierList } from "@/server/rounds/submit";
import { revealRound } from "@/server/rounds/reveal";
import { drawRound, rerollRound } from "@/server/rounds/draw";
import { getCurrentRound } from "@/server/rounds/queries";
import { dayKey } from "@/lib/dates";

export async function submitTierListAction(raw: unknown) {
  return runAction(async () => {
    const u = await requireActiveUser();
    await rateLimit("submit", u.id);
    const res = await submitTierList(u.id, raw);
    revalidatePath(`/r/${res.roundDate}`);
    revalidatePath("/");
    return res;
  });
}

export async function revealNowAction(roundId: string) {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const id = z.string().uuid().parse(roundId);
    const done = await revealRound(id, "moderator");
    if (!done) throw badRequest("Déjà révélé");
    await audit(mod.id, "round.reveal", "round", id);
    revalidatePath("/", "layout");
  });
}

export async function rerollAction() {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const current = await getCurrentRound();
    if (!current || current.date !== dayKey()) throw badRequest("Pas de tier list aujourd'hui");
    const res = await rerollRound(current.id);
    if (!res.ok) throw badRequest(res.error);
    await audit(mod.id, "round.reroll", "round", current.id, { newIdeaId: res.ideaId });
    revalidatePath("/", "layout");
  });
}

/** Manual draw (e.g. bank was empty at midnight and ideas were added since). */
export async function drawNowAction() {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const res = await drawRound(dayKey());
    if (res.status === "empty_bank") throw badRequest("La banque d'idées est vide");
    if (res.status === "exists") throw badRequest("La tier list du jour existe déjà");
    await audit(mod.id, "round.draw", "round", res.roundId);
    revalidatePath("/", "layout");
  });
}
