"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/guard";
import { parseInput, runAction } from "@/lib/errors";
import { removeMemberAvatar, renameMember, setMemberRole, setMemberStatus } from "@/server/members";
import { nameSchema } from "@/lib/names";
import { setDrawHour, setIdeaValidation } from "@/server/settings";
import { catchUpDaily } from "@/server/rounds/catch-up";

const userId = z.string().min(1).max(64);

/** Validate / ban a member. Permission rules (own status, admins, moderators, photo) live in setMemberStatus. */
export async function setUserStatus(id: string, status: "active" | "rejected") {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    await setMemberStatus(parseInput(userId, id), parseInput(z.enum(["active", "rejected"]), status), mod);
    revalidatePath("/mod");
    revalidatePath("/", "layout");
  });
}

export async function setUserRole(id: string, role: "member" | "moderator") {
  return runAction(async () => {
    const admin = await guard("admin", "modAction");
    await setMemberRole(parseInput(userId, id), parseInput(z.enum(["member", "moderator"]), role), admin.id);
    revalidatePath("/mod");
  });
}

/** Rename a member. Permission rules (own name, admins, moderators) live in renameMember. */
export async function renameUser(id: string, name: string) {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    await renameMember(parseInput(userId, id), parseInput(nameSchema, name), mod);
    revalidatePath("/", "layout");
  });
}

/** Remove a member's photo. Permission rules live in removeMemberAvatar. */
export async function removeUserAvatar(id: string) {
  return runAction(async () => {
    const mod = await guard("moderator", "modAction");
    await removeMemberAvatar(parseInput(userId, id), mod);
    revalidatePath("/", "layout");
  });
}

/** Admin switch: members' new ideas wait for a moderator before entering the bank. */
export async function setIdeaValidationAction(enabled: boolean) {
  return runAction(async () => {
    const admin = await guard("admin", "modAction");
    const res = await setIdeaValidation(parseInput(z.boolean(), enabled), admin.id);
    revalidatePath("/mod");
    revalidatePath("/ideas");
    // released ideas may refill an empty bank (board counter, missing daily)
    if (res.approved) {
      revalidatePath("/", "layout");
      await catchUpDaily(admin.id, "settings");
    }
    return res;
  });
}

/** Admin setting: the hour of the automatic daily draw. Moved earlier than now, today's missing daily is drawn right away. */
export async function setDrawHourAction(hour: number) {
  return runAction(async () => {
    const admin = await guard("admin", "modAction");
    await setDrawHour(parseInput(z.number().int().min(0).max(23), hour), admin.id);
    revalidatePath("/", "layout");
    await catchUpDaily(admin.id, "settings");
  });
}
