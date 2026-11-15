"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/guard";
import { badRequest, parseInput, runAction } from "@/lib/errors";
import { DEFAULT_TTL_HOURS, MAX_TTL_HOURS, MIN_TTL_HOURS } from "@/lib/dates";
import { submitTierList } from "@/server/rounds/submit";
import { drawDaily, drawExtra, rerollRound, type DrawResult } from "@/server/rounds/draw";

export async function submitTierListAction(raw: unknown) {
  return runAction(async () => {
    const u = await guard("active", "submit");
    const res = await submitTierList(u.id, raw);
    // whole layout: the personal counter in the header may have moved
    revalidatePath("/", "layout");
    return res;
  });
}

export async function rerollAction(roundId: string) {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    await rerollRound(parseInput(z.string().uuid(), roundId), mod.id);
    revalidatePath("/", "layout");
  });
}

/** A draw that didn't create anything, as a message for the moderator. */
function drawRefused(res: Exclude<DrawResult, { status: "created" }>): never {
  switch (res.status) {
    case "empty_bank":
      throw badRequest("La banque d'idées est vide");
    case "idea_unavailable":
      throw badRequest("Cette idée n'est plus dans la banque");
    case "exists":
      throw badRequest("La tier list du jour existe déjà");
    case "not_due":
      throw badRequest(`Le tirage du jour a lieu à ${res.hour} h`);
  }
}

/** Manual daily draw (e.g. the bank was empty at 08:00 and the worker is down). */
export async function drawNowAction() {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    const res = await drawDaily(new Date(), { actorId: mod.id, trigger: "manual" });
    if (res.status !== "created") drawRefused(res);
    revalidatePath("/", "layout");
  });
}

const ttlSchema = z.coerce
  .number()
  .int()
  .min(MIN_TTL_HOURS, `Durée entre ${MIN_TTL_HOURS} et ${MAX_TTL_HOURS} heures`)
  .max(MAX_TTL_HOURS, `Durée entre ${MIN_TTL_HOURS} et ${MAX_TTL_HOURS} heures`);

/** Moderators / admins: an extra tier list, on top of the daily one, with its own TTL. */
export async function createExtraRoundAction(ttlHours: number = DEFAULT_TTL_HOURS, ideaId?: string) {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    const chosen = ideaId === undefined ? undefined : parseInput(z.string().uuid("Idée invalide"), ideaId);
    const res = await drawExtra(parseInput(ttlSchema, ttlHours), new Date(), mod.id, chosen);
    if (res.status !== "created") drawRefused(res);
    revalidatePath("/", "layout");
    return { roundId: res.roundId };
  });
}
