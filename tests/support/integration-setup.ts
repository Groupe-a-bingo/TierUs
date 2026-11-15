/**
 * Integration tests run against a dedicated Postgres database.
 * TEST_DATABASE_URL must point to a local database whose name ends in
 * "_test": every test truncates all tables, so this guard protects real data
 * ("latest", "contest" or a remote host are refused).
 */
import { beforeAll } from "vitest";
import { assertTestDatabase } from "./test-db";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (integration tests need their own database)");
assertTestDatabase(url);

// must be set before "@/db" is imported by the test files
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET ??= "integration-tests-secret-integration-tests-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3010";

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db } = await import("@/db");
  await migrate(db, { migrationsFolder: "drizzle" });
});
