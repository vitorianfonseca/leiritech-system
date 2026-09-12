import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, ROLES, type RoleKey } from "./roles";

/**
 * Page-driving helpers shared by every spec.
 *
 * Two environment facts shape these helpers and are worth stating once:
 *
 *  1. The login form is a hydrated client component with an autoFocus email
 *     input. Filling it before React has hydrated silently loses the value and
 *     the form then reports "Indique o seu email". `signIn` waits for the
 *     network to settle and re-asserts the typed value before submitting.
 *  2. The backend rate-limits login to LOGIN_RATE_LIMIT_PER_MINUTE (5) per
 *     ip+email. `signIn` backs off and retries once on a rate-limited attempt so
 *     a suite that signs in repeatedly is not flaky.
 */

/** Sign a role in through the real login form. */
export async function signIn(page: Page, role: RoleKey): Promise<void> {
  const { email } = ROLES[role];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login", { waitUntil: "networkidle" });

    const emailBox = page.getByRole("textbox", { name: "Email" });
    const passwordBox = page.getByRole("textbox", { name: "Palavra-passe" });
    await expect(emailBox).toBeEnabled();

    await emailBox.fill(email);
    await passwordBox.fill(E2E_PASSWORD);
    // Guard against a pre-hydration fill being discarded by React.
    await expect(emailBox).toHaveValue(email);

    await page.getByRole("button", { name: "Entrar" }).click();

    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 20_000,
      });
      return;
    } catch (err) {
      const rateLimited = await page
        .getByText(/demasiadas tentativas|tente novamente/i)
        .count();
      if (attempt === 0 && rateLimited > 0) {
        // Sliding window is one minute wide.
        await page.waitForTimeout(61_000);
        continue;
      }
      throw err;
    }
  }
}

/** Sign out through the header user menu. */
export async function signOut(page: Page, role: RoleKey): Promise<void> {
  await page.getByRole("button", { name: ROLES[role].name }).click();
  await page.getByRole("menuitem", { name: "Terminar sessão" }).click();
  await page.waitForURL(/\/login/, { timeout: 20_000 });
}

/**
 * Validation / error alerts raised by the app, excluding Next's route announcer
 * (an always-present `role="alert"` live region that would otherwise make every
 * `getByRole("alert")` a strict-mode violation).
 */
export function alerts(scope: Page | Locator): Locator {
  const root = "goto" in scope ? scope.locator("body") : scope;
  return root.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/** The single visible shadcn dialog. */
export function dialog(page: Page): Locator {
  return page.locator('[data-slot="dialog-content"]');
}

/**
 * Pick a value in the app's searchable combobox (a labelled combobox plus a
 * "Selecionar…" trigger that opens a listbox).
 */
export async function selectCombobox(
  scope: Locator,
  label: string,
  option: string | RegExp,
): Promise<void> {
  const page = scope.page();
  await scope
    .getByRole("group")
    .filter({ has: page.getByRole("combobox", { name: label }) })
    .getByRole("button", { name: "Selecionar…" })
    .click();
  await page.getByRole("option", { name: option }).first().click();
}

/**
 * Drag a dnd-kit handle onto a droppable region.
 *
 * The boards use a PointerSensor with a 6px activation distance, so the pointer
 * has to travel in steps for the drag to start at all — a single mouse.move to
 * the target is silently ignored.
 */
export async function dragOnto(
  page: Page,
  handle: Locator,
  target: Locator,
  { targetOffsetY = 100 }: { targetOffsetY?: number } = {},
): Promise<void> {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag source or target is not laid out");

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + targetOffsetY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / steps,
      startY + ((endY - startY) * i) / steps,
      { steps: 3 },
    );
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}

/** The task side panel (a dialog identified by its close affordance). */
export function taskPanel(page: Page): Locator {
  return page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "Fechar painel" }) });
}

/** Count badge rendered immediately after a board column's heading. */
export async function columnCount(page: Page, region: string): Promise<number> {
  const text = await page
    .getByRole("region", { name: region })
    .locator("h2")
    .locator("xpath=following-sibling::*[1]")
    .textContent();
  return Number((text ?? "").trim());
}

/** A label unique to this run, so writes stay idempotent across repeat runs. */
export function unique(prefix: string): string {
  return `${prefix} E2E-${Date.now().toString(36)}`;
}

/** Collect uncaught runtime errors for the lifetime of a test. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
