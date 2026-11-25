/**
 * Server actions end to end (permissions, validation, rate-limited guard),
 * with the request layer mocked: `as(user)` sets who is signed in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

let signedIn: string | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => (signedIn ? { user: { id: signedIn } } : null) } },
}));

const { db, schema } = await import("@/db");
const { removeUserAvatar, renameUser, setIdeaValidationAction, setUserRole, setUserStatus } = await import("@/app/actions/moderation");
const { resolveStoragePath } = await import("@/lib/storage");
const { addIdea, deleteIdea, updateIdea } = await import("@/app/actions/ideas");
const { addComment, deleteComment, setReaction } = await import("@/app/actions/social");
const { createExtraRoundAction, submitTierListAction } = await import("@/app/actions/rounds");
const { getTargets } = await import("@/server/rounds/queries");
const { drawActive, makeIdeas, makeUser, placementsFor, resetDb } = await import("../support/factories");

beforeEach(async () => {
  signedIn = null;
  await resetDb();
});
afterEach(() => vi.useRealTimers());

const as = (u: { id: string } | null) => (signedIn = u?.id ?? null);
const statusOf = async (id: string) => (await db.select().from(schema.user).where(eq(schema.user.id, id)))[0];

describe("moderation actions", () => {
  it("a moderator validates a sign-up, even without a photo", async () => {
    const mod = await makeUser({ role: "moderator" });
    const newbie = await makeUser({ status: "pending" });
    as(mod);
    expect(await setUserStatus(newbie.id, "active")).toEqual({ ok: true });
    expect((await statusOf(newbie.id)).status).toBe("active");
  });

  it("moderators can't touch themselves, admins or other moderators; admins can ban a moderator", async () => {
    const admin = await makeUser({ role: "admin" });
    const mod = await makeUser({ role: "moderator" });
    const other = await makeUser({ role: "moderator" });
    as(mod);
    expect(await setUserStatus(mod.id, "rejected")).toMatchObject({ ok: false });
    expect(await setUserStatus(admin.id, "rejected")).toMatchObject({ ok: false });
    expect(await setUserStatus(other.id, "rejected")).toMatchObject({ ok: false });
    as(admin);
    expect(await setUserStatus(other.id, "rejected")).toEqual({ ok: true });
    const banned = await statusOf(other.id);
    expect([banned.status, banned.role]).toEqual(["rejected", "member"]);
  });

  it("only an admin changes roles and idea validation", async () => {
    const admin = await makeUser({ role: "admin" });
    const mod = await makeUser({ role: "moderator" });
    const member = await makeUser();
    as(mod);
    expect(await setUserRole(member.id, "moderator")).toEqual({ ok: false, error: "Accès refusé" });
    expect(await setIdeaValidationAction(true)).toEqual({ ok: false, error: "Accès refusé" });
    as(admin);
    expect(await setUserRole(member.id, "moderator")).toEqual({ ok: true });
    expect((await statusOf(member.id)).role).toBe("moderator");
    expect(await setIdeaValidationAction(true)).toMatchObject({ ok: true });
  });

  it("moderators rename members; only an admin renames a moderator; nobody renames an admin or themselves", async () => {
    const admin = await makeUser({ role: "admin" });
    const mod = await makeUser({ role: "moderator" });
    const other = await makeUser({ role: "moderator" });
    const member = await makeUser();
    as(mod);
    expect(await renameUser(member.id, "  Nouveau nom ")).toEqual({ ok: true });
    expect((await statusOf(member.id)).name).toBe("Nouveau nom");
    expect(await renameUser(member.id, "x")).toMatchObject({ ok: false });
    expect(await renameUser(mod.id, "Moi")).toMatchObject({ ok: false });
    expect(await renameUser(other.id, "Autre")).toMatchObject({ ok: false });
    expect(await renameUser(admin.id, "Chef")).toMatchObject({ ok: false });
    as(admin);
    expect(await renameUser(other.id, "Autre modo")).toEqual({ ok: true });
    expect((await statusOf(other.id)).name).toBe("Autre modo");
    as(member);
    expect(await renameUser(other.id, "Pirate")).toEqual({ ok: false, error: "Accès refusé" });
  });

  it("removes a member's photo and stored file, with the same permissions as renaming", async () => {
    const admin = await makeUser({ role: "admin" });
    const mod = await makeUser({ role: "moderator" });
    const other = await makeUser({ role: "moderator" });
    const member = await makeUser();
    const addPhoto = async (ownerId: string) => {
      const relPath = path.join("avatars", `${crypto.randomUUID()}.webp`);
      const fullPath = resolveStoragePath(relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, "photo");
      const [file] = await db.insert(schema.files).values({ ownerId, path: relPath, mime: "image/webp" }).returning();
      await db.update(schema.user).set({ avatarFileId: file.id }).where(eq(schema.user.id, ownerId));
      return { file, fullPath };
    };
    const ownPhoto = await addPhoto(mod.id);
    const adminPhoto = await addPhoto(admin.id);
    const otherPhoto = await addPhoto(other.id);
    const memberPhoto = await addPhoto(member.id);
    try {
      as(mod);
      for (const id of [mod.id, admin.id, other.id]) expect(await removeUserAvatar(id)).toMatchObject({ ok: false });
      expect(await removeUserAvatar(member.id)).toEqual({ ok: true });
      expect((await statusOf(member.id)).avatarFileId).toBeNull();
      expect(await db.select().from(schema.files).where(eq(schema.files.id, memberPhoto.file.id))).toHaveLength(0);
      await expect(fs.stat(memberPhoto.fullPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await removeUserAvatar(member.id)).toMatchObject({ ok: false });

      as(admin);
      expect(await removeUserAvatar(other.id)).toEqual({ ok: true });
      expect((await statusOf(other.id)).avatarFileId).toBeNull();
      const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.remove_avatar"));
      expect(logs).toHaveLength(2);
      expect(logs).toEqual(expect.arrayContaining([
        expect.objectContaining({ actorId: mod.id, targetId: member.id }),
        expect.objectContaining({ actorId: admin.id, targetId: other.id }),
      ]));
      as(member);
      expect(await removeUserAvatar(admin.id)).toEqual({ ok: false, error: "Accès refusé" });
    } finally {
      await Promise.all([ownPhoto, adminPhoto, otherPhoto, memberPhoto].map(({ fullPath }) => fs.rm(fullPath, { force: true })));
    }
  });

  it("members and signed-out visitors are refused", async () => {
    const member = await makeUser();
    const target = await makeUser({ status: "pending" });
    as(member);
    expect(await setUserStatus(target.id, "active")).toEqual({ ok: false, error: "Accès refusé" });
    as(null);
    expect(await setUserStatus(target.id, "active")).toEqual({ ok: false, error: "Non connecté" });
  });
});

describe("idea edit quota", () => {
  it("moderators edit and delete ideas on the moderator quota, members on theirs (30 an hour)", async () => {
    const mod = await makeUser({ role: "moderator" });
    const member = await makeUser();
    const ideas = await db
      .insert(schema.ideas)
      .values(Array.from({ length: 31 }, (_, i) => ({ title: `Idée ${i}`, authorId: member.id })))
      .returning({ id: schema.ideas.id });
    as(mod);
    for (const i of ideas) expect(await deleteIdea(i.id)).toEqual({ ok: true });

    const [own] = await db.insert(schema.ideas).values({ title: "La mienne", authorId: member.id }).returning({ id: schema.ideas.id });
    as(member);
    for (let n = 0; n < 30; n++) expect(await updateIdea(own.id, { title: `Version ${n}` })).toMatchObject({ ok: true });
    expect(await updateIdea(own.id, { title: "Version 31" })).toMatchObject({ ok: false });
  });
});

describe("member actions", () => {
  it("pending and banned accounts can't answer nor propose ideas", async () => {
    const pending = await makeUser({ status: "pending" });
    const banned = await makeUser({ status: "rejected" });
    await makeIdeas(1);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");
    for (const u of [pending, banned]) {
      as(u);
      expect(await submitTierListAction({ roundId: r.roundId, placements: [] })).toMatchObject({ ok: false });
      expect(await addIdea({ title: "Une idée" })).toMatchObject({ ok: false });
    }
  });

  it("the discussion is for members who answered; only the author or a moderator deletes a message", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const mod = await makeUser({ role: "moderator" });
    await makeIdeas(1);
    const r = await drawActive();
    if (r.status !== "created") throw new Error("setup");
    const targets = await getTargets(r.roundId);

    as(a);
    expect(await addComment({ roundId: r.roundId, body: "Salut" })).toEqual({ ok: false, error: "Réponds d'abord à la tier list" });
    expect(await setReaction({ roundId: r.roundId, emoji: "🔥", on: true })).toMatchObject({ ok: false });
    await submitTierListAction({ roundId: r.roundId, placements: placementsFor(targets, () => "B") });
    expect(await addComment({ roundId: r.roundId, body: "Salut" })).toEqual({ ok: true });
    const [c] = await db.select().from(schema.comments);

    // idempotent reactions: asking twice for "on" keeps one
    await setReaction({ roundId: r.roundId, emoji: "🔥", on: true });
    await setReaction({ roundId: r.roundId, emoji: "🔥", on: true });
    expect(await db.select().from(schema.reactions)).toHaveLength(1);
    await setReaction({ roundId: r.roundId, emoji: "🔥", on: false });
    expect(await db.select().from(schema.reactions)).toHaveLength(0);

    as(b);
    expect(await deleteComment(c.id)).toEqual({ ok: false, error: "Accès refusé" });
    as(mod);
    expect(await deleteComment(c.id)).toEqual({ ok: true });
    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "comment.delete"));
    expect(log).toHaveLength(1);
  });

  it("extra tier lists: TTL between 1 h and 7 days, audited in the same transaction", async () => {
    const mod = await makeUser({ role: "moderator" });
    await makeIdeas(1);
    as(mod);
    expect(await createExtraRoundAction(0)).toMatchObject({ ok: false, error: expect.stringContaining("Durée") });
    expect(await createExtraRoundAction(24 * 8)).toMatchObject({ ok: false });
    const res = await createExtraRoundAction(3);
    expect(res).toMatchObject({ ok: true, data: { roundId: expect.any(String) } });
    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "round.extra"));
    expect(log).toMatchObject([{ actorId: mod.id }]);
  });

  it("an idea entering an empty bank after 08:00 draws the missing daily (catch-up)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-10T08:30:00Z")); // 10:30 in Paris
    const member = await makeUser();
    as(member);
    expect(await addIdea({ title: "Enfin une idée" })).toEqual({ ok: true, data: { status: "approved" } });
    const rounds = await db.select().from(schema.rounds);
    expect(rounds).toMatchObject([{ kind: "daily", date: "2026-06-10" }]);
    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "round.draw"));
    expect(log).toMatchObject([{ actorId: member.id, meta: { trigger: "idea" } }]);
  });
});
