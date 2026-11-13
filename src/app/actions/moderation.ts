"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/guard";
import { parseInput, runAction } from "@/lib/errors";
import { setMemberRole, setMemberStatus } from "@/server/members";
import { setIdeaValidation } from "@/server/settings";
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
