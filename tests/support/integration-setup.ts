/**
 * Integration tests run against a dedicated Postgres database.
 * TEST_DATABASE_URL must point to a database whose name contains "test":
 * every test truncates the tables, so this guard protects the real data.
 */
import { beforeAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (integration tests need their own database)");
const dbName = new URL(url).pathname.slice(1);
if (!/test/i.test(dbName)) throw new Error(`Refusing to run integration tests on database "${dbName}" (name must contain "test")`);

// must be set before "@/db" is imported by the test files
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET ??= "integration-tests-secret-integration-tests-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3010";
process.env.APP_TIMEZONE ??= "Europe/Paris";

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db } = await import("@/db");
  await migrate(db, { migrationsFolder: "drizzle" });
});
