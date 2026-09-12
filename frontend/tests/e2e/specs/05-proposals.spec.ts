import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { alerts, dialog, selectCombobox } from "../support/app";
import { storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 15-16 — proposals.
 *
 * Flow 15 is driven as a real write: the proposal is created against the backend
 * and archived again at the end so repeat runs do not pile up drafts. Sending it
 * is not possible here — BR-025 requires an attached PDF and this environment has
 * no object storage configured (boto3 is absent), so the suite asserts the send
 * GATE instead, which is the business rule that matters.
 *
 * Flow 16 asserts the §1.2 state machine on both sides: a live proposal offers
 * exactly the four decision transitions, and an accepted one is terminal
 * (BR-026). The transitions are not committed because every decision outcome is
 * terminal on a shared seed — a run that accepted PROP-2026-002 would leave the
 * next run with nothing live to assert against.
 */

const SENT_PROPOSAL = "/crm/proposals/b0e508bf-eb26-460a-9316-5e44046c1d22"; // PROP-2026-002
const ACCEPTED_PROPOSAL = "/crm/proposals/c3c6a922-9e6a-41f7-ab5e-1e2efad8a718"; // PROP-2026-001

test.describe.configure({ mode: "serial" });

test.describe("proposals — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  let draftUrl = "";
  let draftRef = "";

  test(`${flow(15)} a Gestor creates a proposal against an open opportunity`, async ({
    page,
  }) => {
    await page.goto("/crm/proposals", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Nova proposta" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await selectCombobox(modal, "Oportunidade", /Website Verde Café/);
    await modal.getByRole("textbox", { name: "Valor" }).fill("4321");
    await modal.getByRole("textbox", { name: "Válida até" }).fill("2026-12-31");

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/proposals") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await modal.getByRole("button", { name: "Criar proposta" }).click();
    await created;

    // A new proposal opens on its own record, in Rascunho.
    await expect(page).toHaveURL(/\/crm\/proposals\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Rascunho")).toBeVisible();
    draftUrl = new URL(page.url()).pathname;
    draftRef = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
    expect(draftRef).toMatch(/^PROP-/);
  });

  test(`${flow(15)} sending is gated on the PDF, the value and the validity (BR-025)`, async ({
    page,
  }) => {
    await page.goto(draftUrl, { waitUntil: "networkidle" });

    // The draft tells the user what it still needs before it can leave the studio.
    await expect(page.getByRole("status")).toContainText("PDF");

    await page.getByRole("button", { name: "Enviar" }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading")).toHaveText("Enviar proposta");

    // The checklist names all three BR-025 requirements…
    const checklist = modal.getByRole("listitem");
    await expect(checklist).toHaveCount(3);
    await expect(checklist.nth(0)).toContainText("PDF");
    await expect(checklist.nth(1)).toContainText("Valor");
    await expect(checklist.nth(2)).toContainText("Validade");

    // …and the send is genuinely refused while the PDF is missing.
    await expect(alerts(modal).first()).toBeVisible();
    await expect(modal.getByRole("button", { name: "Enviar proposta" })).toBeDisabled();

    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });

  test(`${flow(15)} the draft is archived so repeat runs stay clean`, async ({ page }) => {
    await page.goto(draftUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Arquivar" }).click();

    const modal = dialog(page);
    if (await modal.isVisible()) {
      await modal.getByRole("button", { name: /Arquivar/ }).click();
      await expect(modal).toBeHidden();
    }

    await page.goto("/crm/proposals", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Procurar…" }).fill(draftRef);
    await expect(page.getByRole("row", { name: new RegExp(draftRef) })).toHaveCount(0);
  });

  test(`${flow(16)} a live proposal offers exactly the §1.2 decision transitions`, async ({
    page,
  }) => {
    await page.goto(SENT_PROPOSAL, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("PROP-2026-002");

    for (const decision of [
      "Marcar como visualizada",
      "Marcar como aceite",
      "Marcar como recusada",
      "Marcar como expirada",
    ]) {
      await expect(page.getByRole("button", { name: decision })).toBeEnabled();
    }
  });

  test(`${flow(16)} an accepted proposal is terminal and offers no further decision (BR-026)`, async ({
    page,
  }) => {
    await page.goto(ACCEPTED_PROPOSAL, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("PROP-2026-001");

    // Terminal means terminal: renegotiation is a NEW proposal, not a re-decision.
    await expect(page.getByRole("status")).toContainText(/Estado final/i);
    for (const decision of [
      "Marcar como aceite",
      "Marcar como recusada",
      "Marcar como expirada",
    ]) {
      await expect(page.getByRole("button", { name: decision })).toHaveCount(0);
    }
    // BR-028: an accepted proposal cannot be archived away either.
    await expect(page.getByRole("button", { name: "Arquivar" })).toHaveCount(0);
  });
});

test.describe("proposals — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(15)} a Membro has no proposals surface (BR-002)`, async ({ page }) => {
    await page.goto("/crm/proposals", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /não encontrada/i })).toBeVisible();
  });
});
