import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Three suites:
 *  - unit         (default)  pure logic, security helpers, storage — no DB
 *  - integration  (TEST_SUITE=integration) against a real Postgres (TEST_DATABASE_URL)
 *  - http         (TEST_SUITE=http) against a running app (E2E_BASE_URL)
 */
const suite = process.env.TEST_SUITE ?? "unit";
const include = {
  unit: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
  integration: ["tests/integration/**/*.test.ts"],
  http: ["tests/http/**/*.test.ts"],
}[suite]!;

export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      // server-only throws outside a React Server Components bundle
      "server-only": r("./tests/support/server-only.ts"),
    },
  },
  test: {
    include,
    environment: "node",
    // integration tests share one database: run files one after another
    fileParallelism: suite === "unit",
    setupFiles: suite === "integration" ? ["tests/support/integration-setup.ts"] : [],
    testTimeout: suite === "unit" ? 10_000 : 30_000,
    hookTimeout: 60_000,
  },
});
