import "server-only";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { drawDaily } from "./draw";

/**
 * The bank was empty at 08:00? An idea entering the bank (proposed, approved,
 * or released by turning validation off) triggers the missing daily draw.
 * Idempotent: nothing happens when today's daily already exists.
 */
export async function catchUpDaily(actorId: string, trigger: "idea" | "review" | "settings") {
  try {
    const res = await drawDaily();
    if (res.status === "created") {
      await audit(actorId, "round.draw", "round", res.roundId, { trigger });
      revalidatePath("/", "layout");
    }
  } catch (err) {
    // the change is saved either way; the worker's catch-up tick will retry
    console.error(`[draw] catch-up failed (trigger: ${trigger})`, err);
  }
}
