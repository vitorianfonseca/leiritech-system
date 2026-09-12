import { expect, test } from "@playwright/test";
import { trackPageErrors } from "./support/app";
import { storageStateFor } from "./support/roles";

/**
 * Route smoke — every authenticated surface renders without a runtime error.
 *
 * This file previously authenticated with a `leiritech_role` cookie, which the
 * integration work replaced with a real JWT session (src/lib/session.ts). The
 * effect was that every route quietly redirected to /login and the suite passed
 * while testing nothing, because a redirect still answers 200. It now runs on a
 * real session and asserts that it actually STAYED on the route it asked for.
 */

const ROUTES = [
  "/",
  "/my-work",
  "/crm/companies",
  "/crm/contacts",
  "/crm/pipeline",
  "/crm/proposals",
  "/crm/catalog",
  "/projects",
  "/tasks",
  "/team",
  "/finance",
  "/reports",
  "/notifications",
  "/calendar",
  "/time",
  "/profile",
  "/settings",
  "/settings/pipeline",
  "/settings/members",
];

test.describe("smoke — Administrador", () => {
  test.use({ storageState: storageStateFor("admin") });

  for (const route of ROUTES) {
    test(`renders ${route} on a real session, without page errors`, async ({ page }) => {
      const errors = trackPageErrors(page);

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);

      // The assertion the old version was missing: we are still where we asked
      // to be, not bounced to /login.
      expect(new URL(page.url()).pathname, `${route} must not redirect`).toBe(route);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      expect(errors, `runtime errors on ${route}`).toEqual([]);
    });
  }

  test("the locale switcher opens without the Menu.Group crash", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await page.locator("button:has(svg.lucide-languages)").first().click();
    // pt-PT and en are the two catalogues the app ships.
    await expect(page.locator('[data-slot="dropdown-item"]')).toHaveCount(2);

    expect(errors).toEqual([]);
  });
});

test.describe("smoke — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  // BR-002/BR-008: the routes a Membro must not reach at all. A 404 — rather
  // than a page with the numbers stripped out — is the contract.
  for (const route of ["/finance", "/crm/pipeline", "/crm/proposals", "/crm/catalog"]) {
    test(`denies ${route} to a Membro`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /não encontrada/i })).toBeVisible();
    });
  }

  // /reports is deliberately NOT denied: every role reaches the route and the
  // report GROUPS are gated instead (Comercial needs pipeline access, Financeiro
  // needs finance access). So the assertion is that the gated groups are absent.
  test("scopes /reports to the groups a Membro may see", async ({ page }) => {
    await page.goto("/reports", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Projetos and Equipa are open to every role; Comercial and Financeiro are not.
    await expect(page.getByRole("tab", { name: "Projetos" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Equipa" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Comercial" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Financeiro" })).toHaveCount(0);
  });
});
