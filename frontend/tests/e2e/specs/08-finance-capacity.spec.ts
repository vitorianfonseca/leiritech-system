import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { dialog, selectCombobox, unique } from "../support/app";
import { ROLES, storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 24-25 — money and capacity, the two most
 * role-sensitive surfaces in the product.
 *
 * Both are driven from BOTH sides of the permission boundary, because the
 * interesting half of BR-003/BR-008/BR-002 is what the other roles CANNOT see:
 *
 *  - flow 24 runs as the Gestor who holds `payments_grant` (the only non-admin
 *    identity allowed near financials) and again as the Membro, who must get a
 *    404 rather than a stripped-down page.
 *  - flow 25 runs as the Gestor, who sees the whole studio's load, and as the
 *    Membro, who must see their own row and nothing else.
 *
 * The milestone this spec creates is cancelled at the end rather than deleted —
 * the product has no delete for payment milestones, and a cancelled milestone is
 * excluded from the contracted total (BR-065), which is exactly what the
 * assertions check.
 */

test.describe.configure({ mode: "serial" });

test.describe("finance — Gestor with payments grant", () => {
  test.use({ storageState: storageStateFor("gestor") });

  const description = unique("Marco");

  test(`${flow(24)} the finance overview reports contracted, received, pending and margin`, async ({
    page,
  }) => {
    await page.goto("/finance", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Financeiro");

    // BR-065..073: the four numbers the studio runs on.
    for (const tile of ["Contratado", "Recebido", "Pendente", "Margem"]) {
      await expect(page.getByText(tile, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("table").first()).toBeVisible();
  });

  test(`${flow(24)} a payment milestone is created with its completion criterion`, async ({
    page,
  }) => {
    await page.goto("/finance", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Novo marco" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await selectCombobox(modal, "Projeto", "Rebranding Miolo");
    await modal.getByRole("textbox", { name: "Descrição" }).fill(description);
    await modal.getByRole("textbox", { name: "Valor (€)" }).fill("1500");
    await modal.getByRole("textbox", { name: "Data prevista" }).fill("2026-12-15");
    // BR-067: a milestone you cannot prove is done is a milestone you cannot bill.
    await modal
      .getByRole("textbox", { name: "Critério de conclusão" })
      .fill("E2E: entrega validada por escrito pelo cliente.");

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/payment-milestones") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await modal.getByRole("button", { name: "Criar marco" }).click();
    await created;
    await expect(modal).toBeHidden();

    await page.getByPlaceholder("Procurar marcos…").fill(description);
    const row = page.getByRole("row", { name: new RegExp(description) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Planeado");
    await expect(row).toContainText("1500,00 €");
  });

  test(`${flow(24)} recording a receipt moves the milestone to partially paid`, async ({
    page,
  }) => {
    await page.goto("/finance", { waitUntil: "networkidle" });
    await page.getByPlaceholder("Procurar marcos…").fill(description);
    const row = page.getByRole("row", { name: new RegExp(description) });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Ações" }).click();
    await page.getByRole("menuitem", { name: "Registar pagamento" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    // The dialog does the arithmetic so nobody has to: billed, received, outstanding.
    await expect(modal.getByText("Em falta")).toBeVisible();

    // A PARTIAL receipt, for two reasons: BR-068/072 explicitly allow one, and a
    // fully-paid milestone can no longer be cancelled — which would leave this
    // run's row permanently inflating the studio's contracted total.
    //
    // The amount is typed with a comma because of the pre-fill bug recorded in
    // the fixme below.
    await modal.getByRole("textbox", { name: "Valor recebido (€)" }).fill("500,00");

    const recorded = page.waitForResponse(
      (res) =>
        res.url().includes("/status") &&
        res.request().method() === "POST" &&
        res.status() < 400,
    );
    await modal.getByRole("button", { name: "Confirmar pagamento" }).click();
    await recorded;
    await expect(modal).toBeHidden();

    await page.getByPlaceholder("Procurar marcos…").fill(description);
    const updated = page.getByRole("row", { name: new RegExp(description) });
    await expect(updated).toContainText("Parcialmente pago");
    await expect(updated).toContainText("500,00 €");
  });

  /**
   * PRODUCT BUG — the pre-filled receipt amount is rejected by its own form.
   *
   * "Registar pagamento" pre-fills the outstanding amount as "1500.00" (a dot
   * decimal) while the field is parsed with pt-PT rules, where "." is a thousands
   * separator — so the default value reads as 150 000 € and trips the
   * "O valor não pode exceder o montante em falta." guard. Confirming the
   * untouched dialog therefore always fails, which is the single most common way
   * a user will meet this screen.
   *
   * Asserted against the INTENDED behaviour and marked fixme.
   */
  test.fixme(
    `${flow(24)} confirming the pre-filled amount records the payment`,
    async ({ page }) => {
      await page.goto("/finance", { waitUntil: "networkidle" });
      await page.getByPlaceholder("Procurar marcos…").fill(description);
      await page
        .getByRole("row", { name: new RegExp(description) })
        .getByRole("button", { name: "Ações" })
        .click();
      await page.getByRole("menuitem", { name: "Registar pagamento" }).click();

      const modal = dialog(page);
      await expect(modal).toBeVisible();
      // Straight to confirm, without retyping what the dialog already filled in.
      await modal.getByRole("button", { name: "Confirmar pagamento" }).click();
      await expect(modal).toBeHidden();
    },
  );

  test(`${flow(24)} the milestone is cancelled so repeat runs do not inflate the totals`, async ({
    page,
  }) => {
    await page.goto("/finance", { waitUntil: "networkidle" });
    await page.getByPlaceholder("Procurar marcos…").fill(description);
    const row = page.getByRole("row", { name: new RegExp(description) });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Ações" }).click();
    await page.getByRole("menuitem", { name: "Cancelar marco" }).click();

    const modal = dialog(page);
    if (await modal.isVisible()) {
      await modal.getByRole("button", { name: /Cancelar marco|Confirmar/ }).click();
      await expect(modal).toBeHidden();
    }

    await page.getByPlaceholder("Procurar marcos…").fill(description);
    // BR-065: a cancelled milestone stops counting toward contracted value.
    await expect(page.getByRole("row", { name: new RegExp(description) })).toContainText(
      /Cancelad/,
    );
  });
});

test.describe("finance — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(24)} a Membro gets a 404, not a redacted finance page (BR-008)`, async ({
    page,
  }) => {
    await page.goto("/finance", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /não encontrada/i })).toBeVisible();

    // Nothing financial leaks through the 404 either.
    await expect(page.getByText(/Marcos de pagamento|Contratado|Margem/)).toHaveCount(0);
  });
});

test.describe("capacity — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  test(`${flow(25)} a Gestor sees the whole team's load against capacity`, async ({ page }) => {
    await page.goto("/team", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Equipa");

    // BR-080..084: allocation is load over NET capacity, per person, per week.
    for (const tile of ["Elementos", "Sobrecarregados", "Disponíveis", "Utilização média"]) {
      await expect(page.getByText(tile, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/% da capacidade/).first()).toBeVisible();

    // The whole roster, not just the viewer.
    const people = await page.getByText(/% da capacidade/).count();
    expect(people).toBeGreaterThan(1);

    // And the week is navigable, because capacity is a weekly question.
    await expect(page.getByRole("button", { name: "Semana anterior" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Próxima semana" })).toBeEnabled();
  });

  test(`${flow(25)} the heatmap and the table are two views of the same week`, async ({ page }) => {
    await page.goto("/team", { waitUntil: "networkidle" });
    const heatmapRows = await page.getByText(/% da capacidade/).count();

    await page.getByRole("tab", { name: "Tabela" }).click();
    await expect(page.getByRole("tab", { name: "Tabela" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("table")).toBeVisible();

    // Same people, different presentation.
    const tableRows = await page.getByRole("row").count();
    expect(tableRows).toBeGreaterThanOrEqual(heatmapRows);
  });
});

test.describe("capacity — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(25)} a Membro sees only their own load, and is told why (BR-002)`, async ({
    page,
  }) => {
    await page.goto("/team", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Equipa");

    // Exactly one row: their own.
    await expect(page.getByText(/% da capacidade/)).toHaveCount(1);
    await expect(page.getByText(ROLES.membro.name).first()).toBeVisible();

    // The scoping is explained rather than silently applied.
    await expect(page.getByText(/Administradores e Gestores/)).toBeVisible();

    // And no colleague's numbers are reachable.
    await expect(page.getByText(ROLES.gestor.name)).toHaveCount(0);
  });
});
