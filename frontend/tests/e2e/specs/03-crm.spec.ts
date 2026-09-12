import { expect, test } from "@playwright/test";
import { flow } from "../support/flows";
import { dialog, selectCombobox, unique } from "../support/app";
import { storageStateFor } from "../support/roles";

/**
 * WORKFLOW_SPEC §4.4 flows 7-9 — onboarding and working a client relationship.
 *
 * Flow 7 is a full write journey against the real backend, made repeatable by
 * archiving the company it creates. Flow 8's write half is blocked by a product
 * bug (see the fixme below) so only its read half is asserted. Flow 9 covers the
 * interaction half; the app has no meeting-creation surface (the calendar is a
 * read-only projection, §5).
 */

const SEEDED_COMPANY = "/crm/companies/276cac58-df6a-40f8-9267-181497750d04"; // Miolo Editora

test.describe.configure({ mode: "serial" });

test.describe("crm — Gestor", () => {
  test.use({ storageState: storageStateFor("gestor") });

  const companyName = unique("Empresa");
  let companyUrl = "";

  test(`${flow(7)} a Gestor creates a company and lands on its record`, async ({ page }) => {
    await page.goto("/crm/companies", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Nova empresa" }).click();

    await expect(page).toHaveURL(/\/crm\/companies\/new/);
    await page.getByRole("textbox", { name: "Nome" }).fill(companyName);
    await page.getByRole("textbox", { name: "Setor" }).fill("Testes automatizados");
    await page.getByRole("textbox", { name: "Email" }).fill("geral@e2e.example");

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/companies") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await page.getByRole("button", { name: "Criar empresa" }).click();
    await created;

    // The write is real: we are redirected onto the persisted record.
    await expect(page).toHaveURL(/\/crm\/companies\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(companyName);
    companyUrl = new URL(page.url()).pathname;
  });

  test(`${flow(7)} the new company is findable in the book by search`, async ({ page }) => {
    await page.goto("/crm/companies", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Procurar…" }).fill(companyName);

    await expect(page.getByRole("row", { name: new RegExp(companyName) })).toBeVisible();
    await expect(page.getByText("1 registo", { exact: false })).toBeVisible();
  });

  test(`${flow(7)} the throwaway company is archived so repeat runs stay clean`, async ({
    page,
  }) => {
    await page.goto(companyUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Arquivar" }).click();

    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Arquivar" }).click();
    await expect(modal).toBeHidden();

    // BR-062/H6 permits the archive precisely because this company has no active
    // project and no open opportunity — so it must disappear from the live book.
    await page.goto("/crm/companies", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Procurar…" }).fill(companyName);
    await expect(page.getByRole("row", { name: new RegExp(companyName) })).toHaveCount(0);
  });

  /**
   * PRODUCT BUG — creating a contact is impossible through the UI.
   *
   * `contact-form-dialog.tsx` makes "Responsável interno" required and fills the
   * combobox from `CRM_OWNERS` (src/lib/api/crm.ts:101), a hardcoded mock roster
   * whose ids are slugs ("u-diogo"), not user UUIDs. Every submit therefore dies
   * on `POST /contacts 422 uuid_parsing` — and the dialog swallows it, so the
   * user sees a form that simply never saves.
   *
   * The same defect blocks flow 10 via `PIPELINE_OWNERS`.
   *
   * This test asserts the INTENDED behaviour and is marked fixme so it reports
   * as skipped rather than fake-passing. Unskip once the owner comboboxes are
   * fed from the real users endpoint.
   */
  test.fixme(
    `${flow(8)} a contact is added and attaches to the company`,
    async ({ page }) => {
      const contactName = unique("Contacto");

      await page.goto("/crm/contacts", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Novo contacto" }).click();

      const modal = dialog(page);
      await expect(modal).toBeVisible();
      await modal.getByRole("textbox", { name: "Nome" }).fill(contactName);
      await selectCombobox(modal, "Empresa", "Miolo Editora");
      await selectCombobox(modal, "Responsável interno", "Beatriz Lopes");
      await modal.getByRole("textbox", { name: "Cargo" }).fill("Diretora de Testes");

      const created = page.waitForResponse(
        (res) =>
          res.url().includes("/contacts") &&
          res.request().method() === "POST" &&
          res.status() === 201,
      );
      await modal.getByRole("button", { name: "Criar contacto" }).click();
      await created;
      await expect(modal).toBeHidden();

      await page.goto(SEEDED_COMPANY, { waitUntil: "networkidle" });
      await page.getByRole("tab", { name: /^Contactos/ }).click();
      await expect(
        page.getByRole("tabpanel").getByRole("link", { name: new RegExp(contactName) }),
      ).toBeVisible();
    },
  );

  test(`${flow(8)} a company's contacts are listed against it and open their own record`, async ({
    page,
  }) => {
    await page.goto(SEEDED_COMPANY, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /^Contactos/ }).click();

    const contact = page.getByRole("tabpanel").getByRole("link").first();
    await expect(contact).toBeVisible();
    await expect(contact).toHaveAttribute("href", /\/crm\/contacts\/[0-9a-f-]{36}/);

    await contact.click();
    await expect(page).toHaveURL(/\/crm\/contacts\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test(`${flow(9)} an interaction is logged and lands on the company timeline`, async ({
    page,
  }) => {
    await page.goto(SEEDED_COMPANY, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Interações" }).click();

    const items = page.getByRole("tabpanel").getByRole("listitem");
    await expect(items.first()).toBeVisible();
    const before = await items.count();

    await page.getByRole("button", { name: "Registar interação" }).click();
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox", { name: "Assunto" }).fill(unique("Chamada"));

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/interactions") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await modal.getByRole("button", { name: "Registar" }).click();
    await created;
    await expect(modal).toBeHidden();

    // §1.9: the interaction becomes part of the relationship history.
    await expect(items).toHaveCount(before + 1);
  });
});

test.describe("crm — Membro", () => {
  test.use({ storageState: storageStateFor("membro") });

  test(`${flow(7)} a Membro cannot create companies (BR-002 / §3 matrix)`, async ({ page }) => {
    await page.goto("/crm/companies", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Nova empresa" })).toHaveCount(0);
  });
});
