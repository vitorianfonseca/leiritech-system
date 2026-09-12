import fs from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { signIn } from "./support/app";
import { AUTH_DIR, ROLES, storageStateFor, type RoleKey } from "./support/roles";

/**
 * Signs each role in ONCE through the real login form and parks the resulting
 * cookies, so the flow specs start authenticated without re-typing credentials
 * (the backend allows only 5 logins per minute per ip+email — see support/app).
 *
 * Flow 1 still drives the login form itself; this project exists so the other
 * 24 flows do not have to.
 */

setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

for (const role of Object.keys(ROLES) as RoleKey[]) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await signIn(page, role);

    // The shell only renders once getSession() resolved against the backend, so
    // seeing the user's own name proves the cookies are a real session.
    await expect(
      page.getByRole("button", { name: ROLES[role].name }),
    ).toBeVisible({ timeout: 20_000 });

    await page.context().storageState({ path: storageStateFor(role) });
  });
}
