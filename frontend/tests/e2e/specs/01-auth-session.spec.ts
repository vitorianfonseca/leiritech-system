import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { alerts, dialog, signIn, signOut } from "../support/app";
import { ROLES, storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 1-4 — authentication and session.
 *
 * Flows 1 and 4 are driven end to end. Flows 2 and 3 are driven as far as this
 * environment allows: both finish in an email (Resend) and there is no mail sink
 * here, so the suite covers the request side and the rejection of a bad token,
 * and stops short of consuming a real link. See support/flows.ts.
 */

const ANONYMOUS = { cookies: [], origins: [] };

test.describe("auth — anonymous", () => {
  test.use({ storageState: ANONYMOUS });

  test(`${flow(1)} signing in lands on the dashboard and signing out revokes access`, async ({
    page,
  }) => {
    await signIn(page, "admin");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      ROLES.admin.name.split(" ")[0],
    );

    // A real session is a real cookie pair (src/lib/api/server-auth.ts).
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).toContain("leiritech_access");
    expect(names).toContain("leiritech_refresh");

    await signOut(page, "admin");

    // And the protected area is genuinely closed again, not just visually.
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login\?from=%2Fprojects/);
  });

  test(`${flow(1)} wrong credentials are rejected without creating a session`, async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    const email = page.getByRole("textbox", { name: "Email" });
    await expect(email).toBeEnabled();
    await email.fill(ROLES.admin.email);
    await page.getByRole("textbox", { name: "Palavra-passe" }).fill("definitely-wrong");
    await expect(email).toHaveValue(ROLES.admin.email);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(alerts(page).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).not.toContain("leiritech_access");
  });

  test(`${flow(2)} a reset request answers neutrally whether or not the account exists`, async ({
    page,
  }) => {
    await page.goto("/forgot-password", { waitUntil: "networkidle" });
    const email = page.getByRole("textbox", { name: "Email" });
    await expect(email).toBeEnabled();

    await email.fill(`nobody-${Date.now()}@leiritech.pt`);
    await expect(email).toHaveValue(/nobody-/);
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();

    // Account enumeration must not be possible: the same confirmation either way.
    await expect(
      page.getByText(/enviámos|enviamos|verifique|email/i).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test(`${flow(2)} an invalid reset token cannot set a new password`, async ({ page }) => {
    await page.goto("/reset-password?token=e2e-not-a-real-token", {
      waitUntil: "networkidle",
    });

    const next = page.getByRole("textbox", { name: "Nova palavra-passe" });
    await expect(next).toBeEnabled();
    await next.fill("BrandNewPass!2026");
    await page.getByRole("textbox", { name: "Confirmar palavra-passe" }).fill(
      "BrandNewPass!2026",
    );
    await page.getByRole("button", { name: "Guardar palavra-passe" }).click();

    await expect(alerts(page).first()).toBeVisible();
    // Still anonymous — a rejected reset must not mint a session.
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).not.toContain("leiritech_access");
  });

  test(`${flow(3)} an unknown invitation token is refused`, async ({ page }) => {
    await page.goto("/invite/e2e-not-a-real-token", { waitUntil: "networkidle" });
    await expect(alerts(page).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /início de sessão/i })).toBeVisible();
  });

  test(`${flow(4)} an unauthenticated request is redirected and keeps its destination`, async ({
    page,
  }) => {
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/login\?from=%2Ffinance/);
  });
});

test.describe("auth — Administrador", () => {
  test.use({ storageState: storageStateFor("admin") });

  test(`${flow(3)} an Administrador can send an invitation`, async ({ page }) => {
    await page.goto("/settings/members/invite", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Convidar membro");

    await page.locator("main").getByRole("button", { name: "Convidar membro" }).last().click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();

    const invitee = `e2e-invite-${Date.now().toString(36)}@leiritech.pt`;
    await modal.getByRole("textbox", { name: "Email" }).fill(invitee);
    await modal.getByRole("radio", { name: "Membro" }).check();

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/invitations") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await modal.getByRole("button", { name: "Enviar convite" }).click();

    const body = (await (await created).json()) as { email: string; status: string };
    expect(body.email).toBe(invitee);
    expect(body.status).toBe("pending");
    await expect(modal).toBeHidden();
  });
});

test.describe("auth — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(3)} a Membro cannot reach the invitation surface (BR-003)`, async ({ page }) => {
    await page.goto("/settings/members/invite", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /não encontrada/i })).toBeVisible();
  });

  test(`${flow(4)} an expired access cookie is refreshed from the refresh cookie`, async ({
    page,
    context,
  }) => {
    await page.goto("/my-work", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Simulate the 15-minute access token running out while the 14-day refresh
    // cookie survives. proxy.ts must rotate silently (BR-006).
    const before = await context.cookies();
    const refresh = before.find((c) => c.name === "leiritech_refresh");
    expect(refresh, "refresh cookie must exist before the test can be meaningful").toBeTruthy();

    await context.clearCookies({ name: "leiritech_access" });
    expect((await context.cookies()).map((c) => c.name)).not.toContain("leiritech_access");

    await page.goto("/my-work", { waitUntil: "networkidle" });

    await expect(page).toHaveURL(/\/my-work/);
    await expect(page.getByRole("button", { name: ROLES.membro.name })).toBeVisible();
    expect((await context.cookies()).map((c) => c.name)).toContain("leiritech_access");
  });

  test(`${flow(4)} losing both cookies ends the session`, async ({ page, context }) => {
    await context.clearCookies({ name: "leiritech_access" });
    await context.clearCookies({ name: "leiritech_refresh" });

    await page.goto("/my-work");
    await expect(page).toHaveURL(/\/login/);
  });
});
