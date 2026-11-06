"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireActiveUser, requireModerator } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { badRequest, runAction } from "@/lib/errors";
import { DEFAULT_TTL_HOURS, MAX_TTL_HOURS, MIN_TTL_HOURS } from "@/lib/dates";
import { submitTierList } from "@/server/rounds/submit";
import { drawDaily, drawExtra, rerollRound } from "@/server/rounds/draw";

export async function submitTierListAction(raw: unknown) {
  return runAction(async () => {
    const u = await requireActiveUser();
    await rateLimit("submit", u.id);
    const res = await submitTierList(u.id, raw);
    // whole layout: the personal counter in the header may have moved
    revalidatePath("/", "layout");
    return res;
  });
}

export async function rerollAction(roundId: string) {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const id = z.string().uuid().parse(roundId);
    const res = await rerollRound(id);
    if (!res.ok) throw badRequest(res.error);
    await audit(mod.id, "round.reroll", "round", id, { newIdeaId: res.ideaId });
    revalidatePath("/", "layout");
  });
}

/** Manual daily draw (e.g. the bank was empty at 08:00 and the worker is down). */
export async function drawNowAction() {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const res = await drawDaily();
    if (res.status === "empty_bank") throw badRequest("La banque d'idées est vide");
    if (res.status === "exists") throw badRequest("La tier list du jour existe déjà");
    if (res.status === "not_due") throw badRequest("Le tirage du jour a lieu à 8 h");
    await audit(mod.id, "round.draw", "round", res.roundId);
    revalidatePath("/", "layout");
  });
}

const ttlSchema = z.coerce.number().int().min(MIN_TTL_HOURS).max(MAX_TTL_HOURS);

/** Moderators / admins: an extra tier list, on top of the daily one, with its own TTL. */
export async function createExtraRoundAction(ttlHours: number = DEFAULT_TTL_HOURS) {
  return runAction(async () => {
    const mod = await requireModerator();
    await rateLimit("modAction", mod.id);
    const ttl = ttlSchema.safeParse(ttlHours);
    if (!ttl.success) throw badRequest(`Durée entre ${MIN_TTL_HOURS} et ${MAX_TTL_HOURS} heures`);
    const res = await drawExtra(ttl.data);
    if (res.status === "empty_bank") throw badRequest("La banque d'idées est vide");
    if (res.status !== "created") throw badRequest("Création impossible");
    await audit(mod.id, "round.extra", "round", res.roundId, { ttlHours: ttl.data });
    revalidatePath("/", "layout");
    return { roundId: res.roundId };
  });
}
