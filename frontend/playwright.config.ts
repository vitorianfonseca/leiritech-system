import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E config for Aurea System (partial coverage toward issue #54).
 * Boots the dev server on a dedicated port and drives representative routes.
 */
const PORT = 3930;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    // Dev session stub: role is read from the aurea_role cookie.
    storageState: {
      cookies: [
        {
          name: "aurea_role",
          value: "admin",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
