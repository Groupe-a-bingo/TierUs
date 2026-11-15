/** Members edit / delete their own ideas; nobody touches a played one. Idea validation by moderators. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createIdea, editIdea, removeIdea, reviewIdea, requeueIdea } from "@/server/ideas";
import { getIdeaValidation, setIdeaValidation } from "@/server/settings";
import { rerollRound } from "@/server/rounds/draw";
import { drawActive, makeUser, resetDb, waitUntilBlockedOnLock } from "../support/factories";

beforeEach(resetDb);

const ideaBy = async (authorId: string, title = "Mon idée", status: "pending" | "approved" | "rejected" = "approved") =>
  (await db.insert(schema.ideas).values({ title, authorId, status }).returning())[0];
const get = async (id: string) => (await db.select().from(schema.ideas).where(eq(schema.ideas.id, id)))[0];
const as = (u: { id: string }, isModerator = false) => ({ id: u.id, isModerator });
/** review an idea as the moderator sees it right now */
const review = async (id: string, decision: "approved" | "rejected") => {
  const i = await get(id);
  return reviewIdea(id, decision, { title: i?.title ?? "", description: i?.description ?? null });
};

describe("own ideas", () => {
  it("the author can edit and delete their unplayed idea", async () => {
    const a = await makeUser();
    const idea = await ideaBy(a.id);
    await editIdea(as(a), idea.id, { title: "Nouveau titre", description: "détail" });
    expect(await get(idea.id)).toMatchObject({ title: "Nouveau titre", description: "détail" });
    await removeIdea(as(a), idea.id);
    expect(await get(idea.id)).toBeUndefined();
  });

  it("another member can't touch it, a moderator can", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    const idea = await ideaBy(a.id);
    await expect(editIdea(as(b), idea.id, { title: "Piraté", description: null })).rejects.toMatchObject({ status: 403 });
    await expect(removeIdea(as(b), idea.id)).rejects.toMatchObject({ status: 403 });
    expect((await get(idea.id)).title).toBe("Mon idée");
    await editIdea(as(mod, true), idea.id, { title: "Corrigé", description: null });
    expect((await get(idea.id)).title).toBe("Corrigé");
    await removeIdea(as(mod, true), idea.id);
    expect(await get(idea.id)).toBeUndefined();
  });

  it("a played idea is read-only, even for its author or a moderator", async () => {
    const a = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    const idea = await ideaBy(a.id);
    const r = await drawActive();
    expect(r.status).toBe("created");
    for (const actor of [as(a), as(mod, true)]) {
      await expect(editIdea(actor, idea.id, { title: "Trop tard", description: null })).rejects.toMatchObject({ status: 400 });
      await expect(removeIdea(actor, idea.id)).rejects.toMatchObject({ status: 400 });
    }
    expect((await get(idea.id)).title).toBe("Mon idée");
  });

  it("an unknown idea is a 404", async () => {
    const a = await makeUser();
    await expect(removeIdea(as(a), crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
  });
});

describe("idea validation", () => {
  it("is off by default: every new idea goes straight to the bank", async () => {
    const a = await makeUser();
    expect(await getIdeaValidation()).toBe(false);
    const status = await createIdea(as(a), { title: "Direct", description: null });
    expect(status).toBe("approved");
    const [idea] = await db.select().from(schema.ideas).where(eq(schema.ideas.title, "Direct"));
    expect(idea).toMatchObject({ status: "approved", authorId: a.id });
  });

  it("when on, members' ideas wait for a moderator; moderators' ideas skip the queue", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    await setIdeaValidation(true, admin.id);
    expect(await getIdeaValidation()).toBe(true);
    expect(await createIdea(as(a), { title: "De membre", description: null })).toBe("pending");
    expect(await createIdea(as(mod, true), { title: "De modo", description: null })).toBe("approved");
  });

  it("a pending or refused idea is never drawn, an approved one is", async () => {
    const a = await makeUser();
    const pending = await ideaBy(a.id, "En attente", "pending");
    await ideaBy(a.id, "Refusée", "rejected");
    expect((await drawActive()).status).toBe("empty_bank");

    await review(pending.id, "approved");
    const res = await drawActive();
    expect(res).toMatchObject({ status: "created", ideaId: pending.id });
  });

  it("a re-roll only picks approved ideas", async () => {
    const a = await makeUser();
    await ideaBy(a.id, "Approuvée");
    await ideaBy(a.id, "En attente", "pending");
    const res = await drawActive();
    if (res.status !== "created") throw new Error(res.status);
    await expect(rerollRound(res.roundId)).rejects.toMatchObject({ status: 400 });
  });

  it("refusing marks the idea; its author can fix it and it goes back to the queue", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    await setIdeaValidation(true, admin.id);
    const idea = await ideaBy(a.id, "Bof", "pending");
    await review(idea.id, "rejected");
    expect((await get(idea.id)).status).toBe("rejected");
    expect(await editIdea(as(a), idea.id, { title: "Mieux", description: null })).toEqual({ status: "pending", previous: "rejected" });
    expect(await get(idea.id)).toMatchObject({ title: "Mieux", status: "pending" });
  });

  it("a moderator's edit of someone else's refused idea leaves it refused", async () => {
    const a = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    const idea = await ideaBy(a.id, "Bof", "rejected");
    expect(await editIdea(as(mod, true), idea.id, { title: "Retouchée", description: null })).toEqual({ status: "rejected", previous: "rejected" });
  });

  it("a moderator fixing their own refused idea puts it straight in the bank", async () => {
    const mod = await makeUser({ role: "moderator" });
    const idea = await ideaBy(mod.id, "Bof", "rejected");
    expect(await editIdea(as(mod, true), idea.id, { title: "Mieux", description: null })).toEqual({ status: "approved", previous: "rejected" });
  });

  it("a member editing an approved idea sends it back for review; a moderator's edit keeps the status", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    await setIdeaValidation(true, admin.id);
    const idea = await ideaBy(a.id);
    expect(await editIdea(as(mod, true), idea.id, { title: "Typo corrigée", description: null })).toEqual({ status: "approved", previous: "approved" });
    expect(await editIdea(as(a), idea.id, { title: "Tout autre chose", description: null })).toEqual({ status: "pending", previous: "approved" });
  });

  it("even with validation off, a member's fixed refused idea goes back to a moderator, never straight to the bank", async () => {
    const a = await makeUser();
    expect(await getIdeaValidation()).toBe(false);
    const idea = await ideaBy(a.id, "Bof", "rejected");
    expect(await editIdea(as(a), idea.id, { title: "Bof.", description: null })).toEqual({ status: "pending", previous: "rejected" });
    expect((await drawActive()).status).toBe("empty_bank");
  });

  it("a moderator can't approve wording they didn't see (author edited it meanwhile)", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    await setIdeaValidation(true, admin.id);
    const idea = await ideaBy(a.id, "Sage", "pending");
    const seen = { title: "Sage", description: null };
    await editIdea(as(a), idea.id, { title: "Plus du tout sage", description: null });
    await expect(reviewIdea(idea.id, "approved", seen)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("modifiée") });
    await expect(reviewIdea(idea.id, "approved", { title: "Sage", description: "ajout" })).rejects.toMatchObject({ status: 400 });
    expect((await get(idea.id)).status).toBe("pending");
    await reviewIdea(idea.id, "approved", { title: "Plus du tout sage", description: null });
    expect((await get(idea.id)).status).toBe("approved");
  });

  it("an idea can't be reviewed twice; a refused one can still be put back in the bank", async () => {
    const a = await makeUser();
    const idea = await ideaBy(a.id, "Une idée", "pending");
    await review(idea.id, "rejected");
    await expect(review(idea.id, "rejected")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("traitée") });
    await review(idea.id, "approved");
    expect((await get(idea.id)).status).toBe("approved");
    await expect(review(idea.id, "approved")).rejects.toMatchObject({ status: 400 });
    await expect(review(idea.id, "rejected")).rejects.toMatchObject({ status: 400 });
    await expect(reviewIdea(crypto.randomUUID(), "approved", { title: "x", description: null })).rejects.toMatchObject({ status: 404 });
  });

  it("a moderator can send a bank or refused idea back to validation, not a played one", async () => {
    const mod = await makeUser({ role: "moderator" });
    const a = await makeUser();
    const idea = await ideaBy(a.id, "Trop vague");
    expect(await requeueIdea(idea.id, mod.id)).toMatchObject({ previous: "approved" });
    expect((await get(idea.id)).status).toBe("pending");
    expect((await drawActive()).status).toBe("empty_bank");
    await expect(requeueIdea(idea.id, mod.id)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("déjà en validation") });
    await review(idea.id, "rejected");
    expect(await requeueIdea(idea.id, mod.id)).toMatchObject({ previous: "rejected" });
    await review(idea.id, "approved");
    expect((await drawActive()).status).toBe("created");
    await expect(requeueIdea(idea.id, mod.id)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("jouée") });
    expect((await get(idea.id)).status).toBe("approved");
    await expect(requeueIdea(crypto.randomUUID(), mod.id)).rejects.toMatchObject({ status: 404 });
  });

  it("turning validation off releases the waiting ideas into the bank (refused ones stay refused)", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    await setIdeaValidation(true, admin.id);
    const p1 = await ideaBy(a.id, "Attente 1", "pending");
    const p2 = await ideaBy(a.id, "Attente 2", "pending");
    const r = await ideaBy(a.id, "Refusée", "rejected");
    expect(await setIdeaValidation(false, admin.id)).toEqual({ approved: 2 });
    expect(await getIdeaValidation()).toBe(false);
    expect((await get(p1.id)).status).toBe("approved");
    expect((await get(p2.id)).status).toBe("approved");
    expect((await get(r.id)).status).toBe("rejected");
    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "settings.idea_validation"));
    expect(logs).toHaveLength(2);
  });
});

describe("idea validation setting", () => {
  it("refuses a no-op toggle (an admin's page out of date)", async () => {
    const admin = await makeUser({ role: "admin" });
    await expect(setIdeaValidation(false, admin.id)).rejects.toMatchObject({ status: 400 });
    await setIdeaValidation(true, admin.id);
    await expect(setIdeaValidation(true, admin.id)).rejects.toMatchObject({ status: 400 });
  });

  it("two admins turning it on at once for the first time: only one succeeds", async () => {
    const a1 = await makeUser({ role: "admin" });
    const a2 = await makeUser({ role: "admin" });
    const results = await Promise.allSettled([setIdeaValidation(true, a1.id), setIdeaValidation(true, a2.id)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "settings.idea_validation"));
    expect(logs).toHaveLength(1);
  });

  it("an idea written while validation is being turned off can't stay pending", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    await setIdeaValidation(true, admin.id);

    // a member's write that read "validation on" (share lock held) before the admin's switch
    let readDone!: () => void;
    const read = new Promise<void>((r) => (readDone = r));
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const write = db.transaction(async (tx) => {
      expect(await getIdeaValidation(tx, { lock: true })).toBe(true);
      readDone();
      await hold;
      await tx.insert(schema.ideas).values({ title: "Pendant la bascule", authorId: a.id, status: "pending" });
    });
    await read;
    const off = setIdeaValidation(false, admin.id);
    // the switch really waits for the member's transaction (not just "probably" after a sleep)
    await waitUntilBlockedOnLock();
    release();
    await write;
    expect(await off).toEqual({ approved: 1 });
    const [idea] = await db.select().from(schema.ideas).where(eq(schema.ideas.title, "Pendant la bascule"));
    expect(idea.status).toBe("approved");
  });
});
