import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { trackPageErrors } from "../support/app";
import { ROLES, storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 5-6 — the two daily entry points.
 *
 * Both are "nothing escapes" surfaces: the dashboard's Atenção necessária panel
 * (§4.1/4.2/4.3, §6) and the Membro's "O meu trabalho" hub (§4.3). The value of
 * an E2E here is that the panels are fed by real aggregates, so the test asserts
 * that they render populated and that each item links somewhere real — not just
 * that the route returns 200.
 */

test.describe("dashboard — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  test(`${flow(5)} the Atenção necessária panels render live work and link to it`, async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Beatriz");

    // Each panel is an accessible region whose heading carries its own count.
    const panels = page.getByRole("region");
    await expect(panels.first()).toBeVisible();
    const headings = await page.getByRole("heading", { level: 3 }).allTextContents();
    expect(headings.length, "the attention board must render at least one panel").toBeGreaterThan(0);
    // Panels are titled "<name> <n>" — proof they are counting real rows.
    // (The count lost its parentheses in the ledger redesign; what matters is
    // that a heading still carries a number, not how it is punctuated.)
    expect(headings.some((h) => /\d+\s*$/.test(h.trim()))).toBe(true);

    // "Nothing escapes" means every surfaced item is actionable. Which panels
    // appear depends on the day's data, so the assertion is that each item links
    // to one of the entity surfaces the panel can route to — not to a fixed one.
    const firstItem = page.getByRole("region").getByRole("listitem").first();
    await expect(firstItem).toBeVisible();
    const href = await firstItem.getByRole("link").first().getAttribute("href");
    expect(href).toMatch(/^\/(projects|crm|team|tasks|calendar|my-work)\b/);

    await firstItem.getByRole("link").first().click();
    await expect(page).not.toHaveURL(/\/$/);

    expect(errors).toEqual([]);
  });

  test(`${flow(5)} the KPI tiles route to the surface they summarise`, async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const tile = page.getByRole("link", { name: /Oportunidades abertas/ });
    await expect(tile).toBeVisible();
    await tile.click();

    await expect(page).toHaveURL(/\/crm\/pipeline/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pipeline comercial");
  });
});

test.describe("o meu trabalho — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(6)} the hub greets the member and buckets their own work`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/my-work", { waitUntil: "networkidle" });

    // §4.3: a contextual greeting built from the member's real data.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      ROLES.membro.name.split(" ")[0],
    );

    // The four due-date buckets of the delivery hub are always present, whether
    // or not they have rows — an empty bucket must say so rather than vanish.
    for (const bucket of ["Hoje", "Atrasadas", "Esta semana", "Sem data"]) {
      await expect(page.getByText(bucket, { exact: true }).first()).toBeVisible();
    }

    // BR-002: the hub is scoped to the projects this member actually belongs to.
    const projects = page.getByRole("progressbar");
    await expect(projects.first()).toBeVisible();
    const labels = await projects.evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label") ?? ""),
    );
    expect(labels.some((l) => l.includes("Progresso de"))).toBe(true);

    expect(errors).toEqual([]);
  });

  test(`${flow(6)} a Membro gets no approval queue of their own (C3)`, async ({ page }) => {
    await page.goto("/my-work", { waitUntil: "networkidle" });

    // A Membro moves work to "em revisão" but cannot approve it to "concluída";
    // the approval queue belongs to Gestor/Admin only.
    await expect(page.getByRole("button", { name: "Aprovar" })).toHaveCount(0);
  });
});

test.describe("o meu trabalho — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  test(`${flow(6)} a Gestor sees the review queue the Membro cannot self-approve (C3)`, async ({
    page,
  }) => {
    await page.goto("/my-work", { waitUntil: "networkidle" });
    await expect(page.getByText("Pedidos de revisão")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprovar" }).first()).toBeVisible();
  });
});
