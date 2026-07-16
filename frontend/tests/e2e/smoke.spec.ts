import { test, expect } from "@playwright/test";

/**
 * Smoke coverage: representative authenticated routes render without runtime
 * errors, plus the two fixes verified during closeout:
 *  - DropdownMenuLabel no longer crashes the locale switcher (Menu.Group bug)
 *  - BR-008 finance route gating (Membro → 404, no financial data)
 */

const ROUTES = [
  "/",
  "/my-work",
  "/crm/companies",
  "/crm/pipeline",
  "/projects",
  "/tasks",
  "/team",
  "/finance",
  "/reports",
  "/notifications",
  "/settings/pipeline",
  "/profile",
  "/time",
  "/calendar",
];

for (const route of ROUTES) {
  test(`renders ${route} without page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const resp = await page.goto(route, { waitUntil: "networkidle" });
    expect(resp?.status(), `HTTP status for ${route}`).toBeLessThan(400);
    expect(errors, `runtime errors on ${route}`).toEqual([]);
  });
}

test("locale switcher dropdown opens without the Menu.Group crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("button:has(svg.lucide-languages)").first().click();
  // Two locales (pt-PT, en) render as menu items when the dropdown opens.
  await expect(page.locator('[data-slot="dropdown-item"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("BR-008: Membro is denied the finance page", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: {
      cookies: [
        {
          name: "aurea_role",
          value: "membro",
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
  });
  const page = await ctx.newPage();
  await page.goto("/finance", { waitUntil: "networkidle" });
  // No finance stat tiles / payment-milestone content leaks to a Membro.
  await expect(
    page.locator("text=/Marcos de pagamento|CONTRATADO/i")
  ).toHaveCount(0);
  await ctx.close();
});
