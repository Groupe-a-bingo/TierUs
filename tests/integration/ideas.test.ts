/** Members edit / delete their own ideas; nobody touches a played one. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { editIdea, removeIdea } from "@/server/ideas";
import { drawActive, makeUser, resetDb } from "../support/factories";

beforeEach(resetDb);

const ideaBy = async (authorId: string, title = "Mon idée") =>
  (await db.insert(schema.ideas).values({ title, authorId }).returning())[0];
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
