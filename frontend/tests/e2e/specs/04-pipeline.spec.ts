import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { alerts, dialog, dragOnto, selectCombobox, unique } from "../support/app";
import { storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 10-14 — the commercial pipeline.
 *
 * The board is a dnd-kit surface, so the move flows are driven with a real
 * pointer drag (see `dragOnto` — the PointerSensor needs travel, not a single
 * jump). Flow 11 moves a card and moves it back, which is what keeps the suite
 * repeatable against the shared dev database.
 *
 * Flows 13 and 14 stop at the confirmation step on purpose: won/lost are
 * terminal outcomes (BR-013/BR-011) and every seeded opportunity that could be
 * closed is one a later run would need back. The business rules that make those
 * flows interesting — the pre-"Proposta enviada" advisory and the mandatory loss
 * reason — live in the confirmation step and ARE asserted.
 */

const CARD = "Brochura Lumen";
const FROM_STAGE = "Proposta em preparação";
const TO_STAGE = "Proposta enviada";

test.describe.configure({ mode: "serial" });

test.describe("pipeline — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  test.beforeEach(async ({ page }) => {
    await page.goto("/crm/pipeline", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pipeline comercial");
  });

  /**
   * PRODUCT BUG — an opportunity cannot be created through the UI.
   *
   * `create-opportunity-dialog.tsx` requires "Responsável" and fills it from
   * `PIPELINE_OWNERS` (src/lib/api/opportunities.ts:85), a hardcoded mock roster
   * with slug ids ("u-diogo") rather than user UUIDs. Submitting therefore fails
   * `POST /opportunities 422 uuid_parsing`, and the dialog swallows the error, so
   * the form silently never saves. Same root cause as flow 8.
   *
   * Asserted against the INTENDED behaviour and marked fixme so it reports as
   * skipped instead of fake-passing.
   */
  test.fixme(`${flow(10)} a Gestor creates an opportunity on the board`, async ({ page }) => {
    const title = unique("Oportunidade");

    await page.getByRole("button", { name: "Nova oportunidade" }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();

    await modal.getByRole("textbox", { name: "Título" }).fill(title);
    await selectCombobox(modal, "Empresa", "Nortada Surf");
    await selectCombobox(modal, "Responsável", "Beatriz Lopes");
    await modal.getByRole("textbox", { name: "Valor" }).fill("12500");
    await modal.getByRole("textbox", { name: "Próxima ação" }).fill("Agendar reunião inicial");

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/opportunities") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await modal.getByRole("button", { name: "Criar oportunidade" }).click();
    await created;
    await expect(modal).toBeHidden();

    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test(`${flow(12)} a move without a próxima ação is blocked (BR-010)`, async ({ page }) => {
    await dragOnto(
      page,
      page.getByRole("button", { name: `Arrastar «${CARD}»` }),
      page.getByRole("region", { name: TO_STAGE }),
    );

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading")).toHaveText("Mover oportunidade");

    // The dialog IS the block: no próxima ação, no move (BR-010).
    await modal.getByRole("textbox", { name: "Próxima ação" }).fill("");
    await modal.getByRole("button", { name: "Mover" }).click();

    await expect(alerts(modal).first()).toBeVisible();
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();

    // And the card really did not move.
    await expect(
      page.getByRole("region", { name: FROM_STAGE }).getByRole("link", { name: CARD }),
    ).toBeVisible();
  });

  test(`${flow(11)} a Gestor moves an opportunity to the next stage and back`, async ({
    page,
  }) => {
    const forward = page.waitForResponse(
      (res) =>
        /\/opportunities\/[0-9a-f-]{36}/.test(res.url()) &&
        ["PATCH", "POST"].includes(res.request().method()) &&
        res.status() < 400,
    );

    await dragOnto(
      page,
      page.getByRole("button", { name: `Arrastar «${CARD}»` }),
      page.getByRole("region", { name: TO_STAGE }),
    );

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    // Flow 12: the próxima ação captured here is the commitment that unblocks it.
    await modal
      .getByRole("textbox", { name: "Próxima ação" })
      .fill("Enviar proposta revista ao cliente");
    await modal.getByRole("button", { name: "Mover" }).click();
    await forward;
    await expect(modal).toBeHidden();

    await expect(
      page.getByRole("region", { name: TO_STAGE }).getByRole("link", { name: CARD }),
    ).toBeVisible();

    // Restore the board so the run is repeatable — deals regress in reality, and
    // the spec allows movement between any two active stages.
    const backward = page.waitForResponse(
      (res) =>
        /\/opportunities\/[0-9a-f-]{36}/.test(res.url()) &&
        ["PATCH", "POST"].includes(res.request().method()) &&
        res.status() < 400,
    );
    await dragOnto(
      page,
      page.getByRole("button", { name: `Arrastar «${CARD}»` }),
      page.getByRole("region", { name: FROM_STAGE }),
    );
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox", { name: "Próxima ação" }).fill("Rever âmbito com o cliente");
    await modal.getByRole("button", { name: "Mover" }).click();
    await backward;

    await expect(
      page.getByRole("region", { name: FROM_STAGE }).getByRole("link", { name: CARD }),
    ).toBeVisible();
  });

  test(`${flow(12)} the próxima ação set during a move is carried on the card`, async ({
    page,
  }) => {
    // The board flags opportunities with no próxima ação; after flow 11 this card
    // carries one, which is exactly what the Atenção panel keys off (BR-014).
    const card = page
      .getByRole("region", { name: FROM_STAGE })
      .locator("..")
      .getByRole("link", { name: CARD });
    await expect(card).toBeVisible();
    await expect(
      page.getByRole("region", { name: FROM_STAGE }).getByText("Sem próxima ação"),
    ).toHaveCount(0);
  });

  test(`${flow(13)} marking won warns when the deal skipped "Proposta enviada" (BR-013)`, async ({
    page,
  }) => {
    await page
      .getByRole("region", { name: FROM_STAGE })
      .getByRole("button", { name: "Ações da oportunidade" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Marcar como ganha" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading")).toHaveText("Marcar como ganha?");
    // A verbal close is allowed, but the user is told what they are skipping.
    await expect(modal.getByRole("note")).toContainText(TO_STAGE);
    await expect(modal.getByRole("button", { name: "Marcar como ganha" })).toBeEnabled();

    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });

  test(`${flow(14)} marking lost requires a reason (BR-011)`, async ({ page }) => {
    await page
      .getByRole("region", { name: FROM_STAGE })
      .getByRole("button", { name: "Ações da oportunidade" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Marcar como perdida" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading")).toHaveText("Marcar como perdida");

    // Submitting with no motivo must be refused — a loss without a reason teaches
    // the pipeline nothing.
    await modal.getByRole("button", { name: "Marcar como perdida" }).click();
    await expect(alerts(modal).first()).toBeVisible();
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });
});

test.describe("pipeline — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(11)} a Membro has no pipeline surface at all (BR-002)`, async ({ page }) => {
    await page.goto("/crm/pipeline", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /não encontrada/i })).toBeVisible();
  });
});
