/**
 * Dev seed: a few starter ideas. Users are created through the real signup
 * flow (so passwords are hashed by Better Auth). Idempotent.
 *   npm run db:seed
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool, schema } from "./index";

const IDEAS = [
  "Qui survivrait le plus longtemps à une apocalypse zombie ?",
  "Qui serait le meilleur président de la République ?",
  "Qui finirait en prison en premier ?",
  "Qui gagnerait à Koh-Lanta ?",
  "Qui a le meilleur goût musical ?",
  "Qui serait le pire colocataire ?",
  "Qui deviendrait millionnaire ?",
  "Qui raconte les pires blagues ?",
  "Qui serait le meilleur prof ?",
  "Qui survivrait seul en forêt une semaine ?",
];

async function main() {
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${schema.ideas}`);
  if ((rows[0]?.n ?? 0) > 0) {
    console.log("Ideas already present, skipping.");
  } else {
    await db.insert(schema.ideas).values(IDEAS.map((title) => ({ title })));
    console.log(`Inserted ${IDEAS.length} ideas.`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
