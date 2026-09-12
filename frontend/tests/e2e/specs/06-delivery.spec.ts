import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { alerts, dialog } from "../support/app";
import { storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 17-20 — turning a won deal into delivery.
 *
 * Flow 17 asserts the promise the spec actually makes about conversion — "zero
 * re-entry" (BR-035): every field on step 1 arrives pre-filled from the
 * opportunity and the accepted proposal. The wizard is not completed, for two
 * reasons stated where they bite: step 2 requires a project template and the dev
 * seed ships none, and every won opportunity in the seed already owns a project,
 * so a committed conversion would duplicate it and break repeat runs.
 *
 * Flows 18 and 20 are real, reversible writes: a phase is renamed and renamed
 * back; the health override is published and then handed back to the system
 * suggestion. Flow 19 is read-only — see the note on that test.
 */

const PROJECT = "/projects/ecf4b159-d298-4e33-b620-4831b8c0d690"; // Rebranding Miolo
const WON_OPPORTUNITY = "/crm/opportunities/43b7e488-8fae-45b2-a67e-fd99406b459f";

test.describe.configure({ mode: "serial" });

test.describe("delivery — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  test(`${flow(17)} the conversion wizard pre-fills the project from the won deal (BR-035)`, async ({
    page,
  }) => {
    await page.goto(`${WON_OPPORTUNITY}/convert`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Converter em projeto");

    // The spin-up context: won opportunity, its client, its accepted proposal.
    await expect(page.getByText("Oportunidade ganha")).toBeVisible();
    await expect(page.getByText("Miolo Editora").first()).toBeVisible();
    await expect(page.getByText(/PROP-\d{4}-\d{3}/).first()).toBeVisible();

    // BR-035 — zero re-entry. Nothing here should be an empty box.
    await expect(page.getByRole("textbox", { name: "Nome do projeto" })).toHaveValue(
      "Rebranding Miolo 2026",
    );
    await expect(page.getByRole("textbox", { name: "Valor contratado" })).toHaveValue(/18\s?000/);
    await expect(page.getByRole("textbox", { name: "Data de início" })).not.toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Descrição" })).toHaveValue(/PROP-/);

    // The contract value is traceable to the proposal, not typed from memory.
    await expect(page.getByText(/Valor da proposta aceite/)).toBeVisible();
  });

  test(`${flow(17)} the wizard refuses to advance past the template step`, async ({ page }) => {
    await page.goto(`${WON_OPPORTUNITY}/convert`, { waitUntil: "networkidle" });
    const steps = page.getByRole("navigation", { name: /^Passo/ });
    await expect(steps).toHaveAccessibleName("Passo 1 de 5");

    await page.getByRole("button", { name: "Seguinte" }).click();
    await expect(steps).toHaveAccessibleName("Passo 2 de 5");
    await expect(page.getByRole("heading", { name: "Escolher modelo" })).toBeVisible();

    // A template instantiates the phases and tasks, so it is mandatory — and the
    // wizard says where to go when there is none, rather than dead-ending.
    await page.getByRole("button", { name: "Seguinte" }).click();
    await expect(alerts(page).first()).toContainText("modelo");
    await expect(steps).toHaveAccessibleName("Passo 2 de 5");
  });

  test(`${flow(18)} a phase can be renamed and the change round-trips`, async ({ page }) => {
    await page.goto(PROJECT, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Fases" }).click();

    const phases = page.getByRole("button", { name: /^Reordenar fase/ });
    await expect(phases.first()).toBeVisible();
    const original = "Produção";
    const renamed = "Produção (E2E)";

    await expect(page.getByRole("button", { name: `Reordenar fase ${original}` })).toBeVisible();

    const rename = async (from: string, to: string) => {
      const index = await page
        .getByRole("button", { name: /^Reordenar fase/ })
        .evaluateAll(
          (els, name) =>
            els.findIndex((el) => el.getAttribute("aria-label") === `Reordenar fase ${name}`),
          from,
        );
      expect(index).toBeGreaterThanOrEqual(0);

      await page.getByRole("button", { name: "Ações da fase" }).nth(index).click();
      await page.getByRole("menuitem", { name: "Editar" }).click();

      const modal = dialog(page);
      await expect(modal).toBeVisible();
      await modal.getByRole("textbox", { name: "Nome da fase" }).fill(to);

      const saved = page.waitForResponse(
        (res) =>
          /\/phases\/[0-9a-f-]{36}/.test(res.url()) &&
          res.request().method() === "PATCH" &&
          res.status() === 200,
      );
      await modal.getByRole("button", { name: "Guardar" }).click();
      await saved;
      await expect(modal).toBeHidden();
      await expect(page.getByRole("button", { name: `Reordenar fase ${to}` })).toBeVisible();
    };

    await rename(original, renamed);
    // Restore, so the seed's project plan is exactly as we found it.
    await rename(renamed, original);
  });

  test(`${flow(18)} every phase carries its own progress and deadline`, async ({ page }) => {
    await page.goto(PROJECT, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Fases" }).click();

    const phases = page.getByRole("button", { name: /^Reordenar fase/ });
    const count = await phases.count();
    expect(count).toBeGreaterThan(0);

    // §1.5: a phase is a plan row — progress derived from its tasks, plus a date.
    await expect(page.getByRole("progressbar", { name: /^Progresso da fase/ })).toHaveCount(count);
    await expect(page.getByRole("tabpanel").getByText(/prazo/).first()).toBeVisible();
  });

  /**
   * Flow 19 is read-only on purpose. Delivery milestones (§1.8) have no create,
   * edit or delete surface anywhere in the product — they exist only as
   * projections on the project overview, the phases tab and the calendar. The
   * writable kind of milestone is the PAYMENT milestone, covered by flow 24.
   */
  test(`${flow(19)} delivery milestones surface on the project, with an explicit empty state`, async ({
    page,
  }) => {
    await page.goto(PROJECT, { waitUntil: "networkidle" });

    const section = page.getByText("Próximos marcos");
    await expect(section).toBeVisible();
    // The seed carries no delivery milestones, so the surface must SAY so rather
    // than render a silent blank.
    await expect(page.getByText("Sem marcos agendados.")).toBeVisible();
  });

  test(`${flow(20)} overriding the system health demands a reason (BR-031)`, async ({ page }) => {
    await page.goto(PROJECT, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Alterar saúde" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    // BR-030: the system suggests, the human publishes.
    await expect(modal.getByText(/Sugestão do sistema/)).toBeVisible();

    await modal.getByRole("radio", { name: "Em risco" }).check();
    await expect(modal.getByText(/Obrigatório porque difere da sugestão/)).toBeVisible();

    await modal.getByRole("button", { name: "Publicar com motivo" }).click();
    await expect(alerts(modal).first()).toBeVisible();
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });

  test(`${flow(20)} a published override sticks, and can be handed back to the suggestion`, async ({
    page,
  }) => {
    await page.goto(PROJECT, { waitUntil: "networkidle" });
    const reason = "Verificação E2E do override de saúde.";

    await page.getByRole("button", { name: "Alterar saúde" }).click();
    const modal = dialog(page);
    await modal.getByRole("radio", { name: "Em risco" }).check();
    await modal.getByRole("textbox", { name: "Motivo da alteração" }).fill(reason);

    const published = page.waitForResponse(
      (res) =>
        res.url().includes("/health") &&
        res.request().method() === "POST" &&
        res.status() === 200,
    );
    await modal.getByRole("button", { name: "Publicar com motivo" }).click();
    await published;
    await expect(modal).toBeHidden();

    // The published health and the reason behind it are both visible.
    await expect(page.getByText("Em risco").first()).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();

    // Hand it back so the next run starts from the system suggestion again.
    await page.getByRole("button", { name: "Alterar saúde" }).click();
    await modal.getByRole("radio", { name: /^Saudável/ }).check();
    const reverted = page.waitForResponse(
      (res) =>
        res.url().includes("/health") &&
        res.request().method() === "POST" &&
        res.status() === 200,
    );
    await modal.getByRole("button", { name: "Aceitar sugestão" }).click();
    await reverted;
    await expect(modal).toBeHidden();
    await expect(page.getByText(reason)).toHaveCount(0);
  });
});

test.describe("delivery — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(20)} a Membro cannot publish project health (§3 matrix)`, async ({ page }) => {
    await page.goto(PROJECT, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Alterar saúde" })).toHaveCount(0);
  });
});
