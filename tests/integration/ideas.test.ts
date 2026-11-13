/** Members edit / delete their own ideas; nobody touches a played one. Idea validation by moderators. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { editIdea, newIdeaStatus, removeIdea, reviewIdea } from "@/server/ideas";
import { getIdeaValidation, setIdeaValidation } from "@/server/settings";
import { rerollRound } from "@/server/rounds/draw";
import { drawActive, makeUser, resetDb } from "../support/factories";

beforeEach(resetDb);

const ideaBy = async (authorId: string, title = "Mon idée", status: "pending" | "approved" | "rejected" = "approved") =>
  (await db.insert(schema.ideas).values({ title, authorId, status }).returning())[0];
const get = async (id: string) => (await db.select().from(schema.ideas).where(eq(schema.ideas.id, id)))[0];
const as = (u: { id: string }, isModerator = false) => ({ id: u.id, isModerator });

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
    expect(await newIdeaStatus(as(a))).toBe("approved");
  });

  it("when on, members' ideas wait for a moderator; moderators' ideas skip the queue", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    await setIdeaValidation(true, admin.id);
    expect(await getIdeaValidation()).toBe(true);
    expect(await newIdeaStatus(as(a))).toBe("pending");
    expect(await newIdeaStatus(as(mod, true))).toBe("approved");
  });

  it("a pending or refused idea is never drawn, an approved one is", async () => {
    const a = await makeUser();
    const pending = await ideaBy(a.id, "En attente", "pending");
    await ideaBy(a.id, "Refusée", "rejected");
    expect((await drawActive()).status).toBe("empty_bank");

    await reviewIdea(pending.id, "approved");
    const res = await drawActive();
    expect(res).toMatchObject({ status: "created", ideaId: pending.id });
  });

  it("a re-roll only picks approved ideas", async () => {
    const a = await makeUser();
    await ideaBy(a.id, "Approuvée");
    await ideaBy(a.id, "En attente", "pending");
    const res = await drawActive();
    if (res.status !== "created") throw new Error(res.status);
    expect(await rerollRound(res.roundId)).toMatchObject({ ok: false });
  });

  it("refusing marks the idea; its author can fix it and it goes back to the queue", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    await setIdeaValidation(true, admin.id);
    const idea = await ideaBy(a.id, "Bof", "pending");
    await reviewIdea(idea.id, "rejected");
    expect((await get(idea.id)).status).toBe("rejected");
    expect(await editIdea(as(a), idea.id, { title: "Mieux", description: null })).toBe("pending");
    expect(await get(idea.id)).toMatchObject({ title: "Mieux", status: "pending" });
  });

  it("a member editing an approved idea sends it back for review; a moderator's edit keeps the status", async () => {
    const admin = await makeUser({ role: "admin" });
    const a = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    await setIdeaValidation(true, admin.id);
    const idea = await ideaBy(a.id);
    await editIdea(as(mod, true), idea.id, { title: "Typo corrigée", description: null });
    expect((await get(idea.id)).status).toBe("approved");
    await editIdea(as(a), idea.id, { title: "Tout autre chose", description: null });
    expect((await get(idea.id)).status).toBe("pending");
  });

  it("with validation off, a member's fixed refused idea goes straight to the bank", async () => {
    const a = await makeUser();
    const idea = await ideaBy(a.id, "Bof", "rejected");
    expect(await editIdea(as(a), idea.id, { title: "Mieux", description: null })).toBe("approved");
  });

  it("an idea can't be reviewed twice; a refused one can still be put back in the bank", async () => {
    const a = await makeUser();
    const idea = await ideaBy(a.id, "Une idée", "pending");
    await reviewIdea(idea.id, "rejected");
    await expect(reviewIdea(idea.id, "rejected")).rejects.toMatchObject({ status: 400 });
    await reviewIdea(idea.id, "approved");
    expect((await get(idea.id)).status).toBe("approved");
    await expect(reviewIdea(idea.id, "approved")).rejects.toMatchObject({ status: 400 });
    await expect(reviewIdea(idea.id, "rejected")).rejects.toMatchObject({ status: 400 });
    await expect(reviewIdea(crypto.randomUUID(), "approved")).rejects.toMatchObject({ status: 404 });
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
