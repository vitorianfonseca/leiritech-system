import { defineConfig, devices } from "@playwright/test";
import { storageStateFor } from "./tests/e2e/support/roles";

/**
 * E2E configuration for LeiriTech (issue #54 — WORKFLOW_SPEC §4.4).
 *
 * The suite drives the REAL stack: Next dev server + FastAPI + Postgres. Two
 * environment facts drive the shape of this config:
 *
 *  - Next 16 refuses to start a second dev server for the same project
 *    directory ("Another next dev server is already running"). A config that
 *    spawned its own server on a private port would therefore fail outright on
 *    any machine where the developer already has `npm run dev` up. So the suite
 *    targets the conventional port and REUSES a running server, starting one
 *    only when there is none.
 *  - Every page resolves its session server-side against the backend, so
 *    `globalSetup` refuses to run when the backend is down rather than letting
 *    the suite pass vacuously against a wall of /login redirects.
 *
 * Specs share one dev database, so they run serially: `fullyParallel: false`
 * with a single worker. Writes are made idempotent by the specs themselves
 * (unique names, revert-after-assert), not by resetting the database.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PORT = new URL(BASE_URL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/*.spec.ts", "**/auth.setup.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    // The app resolves locale from the user profile, then the `locale` cookie,
    // then Accept-Language (never from the URL — see references/routing-locale).
    // Pinning it here keeps the suite's selectors deterministic instead of
    // depending on the machine's browser language.
    locale: "pt-PT",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1100 } },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1100 },
        // Most specs override this per describe block; admin is the default so a
        // spec that forgets still runs as a real session rather than anonymously.
        storageState: storageStateFor("admin"),
      },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
