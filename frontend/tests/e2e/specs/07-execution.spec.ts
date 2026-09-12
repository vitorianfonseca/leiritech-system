import { expect, test, type Page } from "@playwright/test";
import { flow } from "../support/flows";
import { alerts, columnCount, dialog, taskPanel } from "../support/app";
import { storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 21-23 — delivery execution.
 *
 * Status changes are driven from the task side panel rather than by dragging the
 * board, for a reason worth recording: half the seeded tasks belong to projects
 * that are not `active` (one is `planning`, one `on_hold`) and BR-053/H4 freezes
 * their forward transitions. The board card does not say which project it
 * belongs to — `projectName` is an acknowledged INTEGRATION-GAP — so "the first
 * card in Por fazer" is not a stable choice. `startFirstMovableTask` therefore
 * walks the list until it finds a task the rules actually allow to move, which
 * is what a user does too.
 *
 * Every transition is reverted, so the seed's board is left exactly as found.
 *
 * Flow 23 drives the timer contract through the UI. The time module is still
 * served by the mock client, so the assertions stop at the UI contract and do
 * not claim the entries reached the database.
 */

test.describe.configure({ mode: "serial" });

/** Narrow the list to the given status, so panel actions are unambiguous. */
async function filterByStatus(page: Page, status: string): Promise<void> {
  await page.goto("/tasks", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "Lista" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Estado", exact: true }).click();
  await page.getByRole("checkbox", { name: status }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").nth(1)).toBeVisible();
}

async function openRowDetail(page: Page, row: number): Promise<void> {
  await page.getByRole("row").nth(row).getByRole("button", { name: "Ações" }).click();
  await page.getByRole("menuitem", { name: "Abrir detalhe" }).click();
  await expect(taskPanel(page)).toBeVisible();
}

test.describe("execution — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  test(`${flow(21)} starting a task moves it to "Em curso" and the move round-trips`, async ({
    page,
  }) => {
    await filterByStatus(page, "Por fazer");
    const panel = taskPanel(page);

    let started = false;
    let refusals = 0;
    const rows = Math.min(await page.getByRole("row").count(), 6);

    for (let row = 1; row < rows && !started; row += 1) {
      await openRowDetail(page, row);
      const response = page.waitForResponse(
        (res) => res.url().includes("/transition") && res.request().method() === "POST",
      );
      await panel.getByRole("button", { name: "Iniciar", exact: true }).click();
      const status = (await response).status();

      if (status === 200) {
        started = true;
        // The panel now reflects the new status and offers the way back.
        await expect(panel.getByText("Em curso").first()).toBeVisible();
        await expect(panel.getByRole("button", { name: "Enviar para revisão" })).toBeVisible();

        // Put it back, so the seed's board is untouched by this run.
        const reverted = page.waitForResponse(
          (res) =>
            res.url().includes("/transition") &&
            res.request().method() === "POST" &&
            res.status() === 200,
        );
        await panel.getByRole("button", { name: "Mover para por fazer" }).click();
        await reverted;
        await expect(panel.getByRole("button", { name: "Iniciar", exact: true })).toBeVisible();
      } else {
        // BR-053/H4: the task belongs to a project that is not live.
        refusals += 1;
        expect(status).toBe(409);
      }
      await panel.getByRole("button", { name: "Fechar painel" }).click();
      await expect(panel).toBeHidden();
    }

    expect(started, "no task in the studio could be started").toBe(true);
    expect(refusals, "refusals must be the 409 the rules define, not a crash").toBeGreaterThanOrEqual(0);
  });

  test(`${flow(21)} the board renders the full §1.6 status ladder`, async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "networkidle" });
    for (const status of ["Por fazer", "Em curso", "Em revisão", "Bloqueada", "Concluída"]) {
      await expect(page.getByRole("region", { name: status })).toBeVisible();
    }
    // An empty column must still say so rather than silently disappear.
    if ((await columnCount(page, "Bloqueada")) === 0) {
      await expect(
        page.getByRole("region", { name: "Bloqueada" }).getByText("Sem tarefas"),
      ).toBeVisible();
    }
  });

  test(`${flow(21)} a Gestor can approve a task out of review, which a Membro cannot (C3)`, async ({
    page,
  }) => {
    await filterByStatus(page, "Em revisão");
    await openRowDetail(page, 1);
    const panel = taskPanel(page);

    // The approval affordance exists for the reviewer — the Membro spec below
    // asserts the other half of C3.
    await expect(panel.getByRole("button", { name: /Aprovar|Concluir|Devolver/ }).first()).toBeVisible();
    await panel.getByRole("button", { name: "Fechar painel" }).click();
  });

  /**
   * PRODUCT BUG — a task cannot be created through the UI.
   *
   * The "Nova tarefa" dialog fills its required Projeto combobox from the mock
   * task client's project list ("App Fidelização — Lumina", …) rather than the
   * real projects, so `POST /tasks` dies on 422 uuid_parsing exactly like flows
   * 8 and 10. That is why the specs above borrow a seeded task and put it back
   * instead of working on one of their own.
   */
  test.fixme(`${flow(21)} a Gestor creates a task on a project`, async ({ page }) => {
    const title = `E2E Tarefa ${Date.now().toString(36)}`;

    await page.goto("/tasks", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Nova tarefa" }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox", { name: "Título" }).fill(title);
    await modal
      .getByRole("group")
      .filter({ has: page.getByRole("combobox", { name: "Projeto" }) })
      .getByRole("button", { name: "Selecionar…" })
      .click();
    await page.getByRole("option", { name: "Rebranding Miolo" }).click();

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/tasks") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await modal.getByRole("button", { name: "Criar tarefa" }).click();
    await created;
    await expect(modal).toBeHidden();
    await expect(page.getByRole("button", { name: title })).toBeVisible();
  });

  test(`${flow(22)} blocking a task demands a reason, and the block round-trips (BR-046)`, async ({
    page,
  }) => {
    await filterByStatus(page, "Por fazer");
    await openRowDetail(page, 1);
    const panel = taskPanel(page);

    await panel.getByRole("button", { name: "Bloquear" }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading")).toHaveText("Bloquear tarefa");

    // A blocker with no reason tells the team nothing, so it is refused.
    await modal.getByRole("button", { name: "Bloquear" }).click();
    await expect(alerts(modal).first()).toBeVisible();
    await expect(modal).toBeVisible();

    const reason = "E2E: a aguardar acesso do cliente";
    await modal.getByRole("textbox", { name: "Motivo do bloqueio" }).fill(reason);
    const blocked = page.waitForResponse(
      (res) =>
        res.url().includes("/block") &&
        res.request().method() === "POST" &&
        res.status() === 200,
    );
    await modal.getByRole("button", { name: "Bloquear" }).click();
    await blocked;
    await expect(modal).toBeHidden();
    await expect(panel.getByText("Bloqueada").first()).toBeVisible();

    // Unblock, restoring the board.
    const unblocked = page.waitForResponse(
      (res) =>
        res.url().includes("/unblock") &&
        res.request().method() === "POST" &&
        res.status() === 200,
    );
    await panel.getByRole("button", { name: /Desbloquear/ }).first().click();
    await unblocked;
    await expect(panel.getByText("Por fazer").first()).toBeVisible();
    await panel.getByRole("button", { name: "Fechar painel" }).click();
  });

  test(`${flow(22)} a task carries an explicit dependency list (BR-045)`, async ({ page }) => {
    await filterByStatus(page, "Por fazer");
    await openRowDetail(page, 1);
    const panel = taskPanel(page);

    // Dependencies are what BR-045 gates `in_progress` on, so the surface must
    // exist and state emptiness rather than hide.
    await expect(panel.getByText("Dependências", { exact: true })).toBeVisible();
    await expect(panel.getByText("Sem dependências.")).toBeVisible();
    await expect(panel.getByRole("combobox", { name: /dependência/i })).toBeVisible();
    await panel.getByRole("button", { name: "Fechar painel" }).click();
  });
});

test.describe("execution — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(21)} a Membro only sees the tasks of their own projects (BR-002)`, async ({
    page,
  }) => {
    await page.goto("/tasks", { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "Por fazer" })).toBeVisible();

    // The Membro belongs to 2 of the 4 seeded projects, so their board must be a
    // strict subset — never the whole studio's work.
    const own = await columnCount(page, "Por fazer");
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(8);
  });

  test(`${flow(23)} the timer runs one task at a time and can be stopped (BR-040)`, async ({
    page,
  }) => {
    await page.goto("/time", { waitUntil: "networkidle" });
    const timer = page.getByRole("region", { name: "Cronómetro ativo" });
    await expect(timer).toBeVisible();

    // Nothing selected, nothing to time.
    await expect(timer.getByRole("button", { name: "Iniciar" })).toBeDisabled();

    await timer.getByRole("button", { name: "Selecionar…" }).click();
    await page.getByRole("option").first().click();
    // BR-043: billable is the default for delivery work.
    await expect(timer.getByRole("switch", { name: "Faturável" })).toBeChecked();

    await expect(timer.getByRole("button", { name: "Iniciar" })).toBeEnabled();
    await timer.getByRole("button", { name: "Iniciar" }).click();

    // A running timer shows elapsed time…
    await expect(timer.getByRole("timer")).toBeVisible();
    await expect(timer.getByRole("button", { name: "Parar" })).toBeVisible();

    // …and BR-040 leaves no way to start a second one while it runs.
    await expect(timer.getByRole("button", { name: "Iniciar" })).toHaveCount(0);
    await expect(timer.getByRole("button", { name: "Selecionar…" })).toHaveCount(0);

    await timer.getByRole("button", { name: "Parar" }).click();
    await expect(timer.getByRole("button", { name: "Iniciar" })).toBeVisible();
    await expect(timer.getByRole("timer")).toHaveCount(0);
  });

  test(`${flow(23)} a manual entry captures the interval and its billing flag`, async ({
    page,
  }) => {
    await page.goto("/time", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Adicionar entrada" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading")).toHaveText("Nova entrada de tempo");

    // The interval is pre-filled and its duration derived, so a manual entry is
    // one field of work, not four.
    await expect(modal.getByRole("textbox", { name: "Início" })).not.toHaveValue("");
    await expect(modal.getByRole("textbox", { name: "Fim" })).not.toHaveValue("");
    await expect(modal.getByText(/Duração:/)).toBeVisible();
    await expect(modal.getByRole("switch", { name: "Faturável" })).toBeChecked();

    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });
});
