# Proposal Templates + Product Catalog — Design Spec

**Date:** 2026-07-17
**Status:** Draft — awaiting user review
**Scope:** Single spec covering three tightly-coupled pieces (Catalog → Templates → Structured Proposal Content + Preview). Server-side PDF generation is explicitly **out of scope** (future phase).

---

## 1. Problem & Goal

Today a proposal (F6) is **metadata only** + a manually uploaded PDF. `proposals.value` is a single integer (EUR cents); there is no structured content, no reusable content, no catalog. Building a client proposal is fully manual and off-platform.

**Goal:** let the company build proposals the way a systematic software house does — from **reusable, well-configured templates** that assemble **text sections + priced line items (from a catalog) + terms + tax/totals**, instantiate them into a proposal with one action, and preview the result as a branded, printable page inside the app.

---

## 2. Non-Goals (YAGNI)

- **Server-side PDF generation** — deferred. Output for now is an in-app printable preview (browser print-to-PDF). A later phase adds backend PDF that replaces/populates `pdf_attachment_id`.
- **E-signature / client portal acceptance** — out of scope. Lifecycle stays internal (Gestor+ marks accepted).
- **Multi-currency** — EUR only, consistent with the rest of the system.
- **Versioned template history / diffing** — templates are editable master data; proposals snapshot at creation, which is what protects sent proposals. No template version log.
- **Discount per-line** in v1 — a single proposal-level discount only (see §5.3).

---

## 3. Architecture Overview

Three cohesive units, each with one clear purpose, built in dependency order:

```
Catalog Item  (master data: reusable priced product/service)
      │  referenced by (snapshot price on use)
      ▼
Proposal Template  (blueprint: sections + default line items + terms + defaults)
      │  instantiated into (deep copy)
      ▼
Proposal Content  (proposal's OWN sections + line items + terms + computed totals)
```

**Core principle — snapshot on create.** Instantiating a template into a proposal *deep-copies* its sections, line items, and terms into the proposal's own rows, and *copies the catalog item's price/tax at that instant* onto each proposal line. Editing a template or a catalog price afterwards never mutates existing proposals. This is a legal/audit requirement, not a nicety.

Each unit follows the existing backend layering (`models` → `repositories` → `services` → `api/routes`) and frontend structure (`app/(app)/crm/...` pages + `components/<domain>/` + `lib/api/` + `messages/{pt-PT,en}.json`). Mutations require `RequireGestor`; reads use `CurrentUser`.

---

## 4. Piece 1 — Product/Service Catalog

### 4.1 Data model — `catalog_items`
| field | type | notes |
|---|---|---|
| id | uuid PK | AuditBase |
| name | str(200) | required |
| description | text | nullable |
| category | str(100) | nullable, free-text (grouping/filtering) |
| unit | enum | `CATALOG_UNITS = ("unit","hour","day","month","m2","license","fixed")` |
| unit_price | bigint | EUR cents, `>= 0` |
| tax_rate | numeric(5,2) | IVA %, default `23.00`, `0..100` |
| billing_type | enum | `BILLING_TYPES = ("one_time","monthly","annual")` |
| ArchiveMixin | | active/archived instead of hard delete |
| AuditBase | | created_at/updated_at/by |

### 4.2 API — `/catalog-items`
Standard CRUD mirroring proposals: `GET` (paginated, `q` search on name/category via trgm index, `category`/`billing_type`/`include_archived` filters, `sort`), `POST`, `GET/{id}`, `PATCH/{id}`, `POST/{id}/archive`, `POST/{id}/restore`. Reads `CurrentUser`; writes `RequireGestor`.

### 4.3 Frontend
- Nav: new **"Catálogo"** entry under the `COMERCIAL` group.
- Pages: `crm/catalog/page.tsx` (list, search, category filter, empty/loading/error states), `crm/catalog/new`, `crm/catalog/[id]` (detail), `crm/catalog/[id]/edit`. Create/edit may be a dialog (consistent with `create-proposal-dialog`) — decided at plan time.
- Components under `components/catalog/`.

---

## 5. Piece 2 — Proposal Templates

### 5.1 Data model
**`proposal_templates`**
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| name | str(200) | required, e.g. "Website + Manutenção" |
| description | text | internal helper text |
| default_validity_days | int | nullable, e.g. 30 → sets `valid_until` on instantiation |
| default_discount_bps | int | basis points, default 0 (proposal-level discount) |
| terms | text | rich-text terms & conditions |
| ArchiveMixin, AuditBase | | |

**`proposal_template_sections`** (ordered rich-text blocks)
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| template_id | uuid FK → proposal_templates (CASCADE) | |
| position | int | ordering |
| heading | str(200) | |
| body | text | rich-text (HTML/markdown — TBD in plan), supports placeholders |

**`proposal_template_items`** (default line items)
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| template_id | uuid FK (CASCADE) | |
| position | int | |
| catalog_item_id | uuid FK → catalog_items (SET NULL) | source; nullable for ad-hoc lines |
| name / unit / unit_price / tax_rate / billing_type | | **snapshot defaults** copied from catalog at add-time, editable on the template |
| quantity | numeric(12,2) | default 1 |

### 5.2 Placeholders
Sections and terms support `{{cliente}}`, `{{empresa}}`, `{{data}}`, `{{validade}}`, `{{referencia}}`. Resolved at instantiation from the proposal's company/contact/dates. Unknown placeholders left verbatim. Resolution is a small pure function (testable in isolation).

### 5.3 Totals model (shared by template preview & proposal)
Money stays integer EUR cents; tax_rate numeric %. Computed, never stored redundantly beyond the proposal snapshot:
- per line: `line_net = round(quantity * unit_price)`, `line_tax = round(line_net * tax_rate/100)`
- group by `billing_type`: **one_time**, **monthly**, **annual** each get their own `{net, tax, gross}` subtotal
- proposal-level discount (`discount_bps`) applies to **net** proportionally across groups (documented rule; applied before tax)
- **`proposals.value` = one_time net total after discount, excl. IVA** (per decision) — recomputed on every content change so lifecycle (BR-025..028) & dashboard stay intact.

### 5.4 API — `/proposal-templates`
CRUD on the template + nested sections/items managed via the template payload (replace-on-save is simplest and matches snapshot semantics). Reads `CurrentUser`; writes `RequireGestor`.

### 5.5 Frontend
- Nav: **"Templates"** under `COMERCIAL`.
- Pages: `crm/proposal-templates/` list, `.../new`, `.../[id]` editor (section editor with reorder, line-item picker pulling from catalog with live totals preview panel).
- Components under `components/proposal-templates/`.

---

## 6. Piece 3 — Structured Proposal Content + Preview

### 6.1 Data model (extends existing proposal, non-breaking)
**`proposal_sections`** and **`proposal_items`** — same shape as the template's section/item tables but FK → `proposals` (CASCADE) and holding the **snapshot** (own copies). `proposal_items` additionally stores `catalog_item_id` (SET NULL) for traceability only.
Add to `proposals`: `template_id uuid FK → proposal_templates (SET NULL)` (provenance), `discount_bps int default 0`, `terms text`. Existing columns unchanged. `value` continues to exist and is now **derived** from `proposal_items` (§5.3).

### 6.2 Instantiation flow — "Criar a partir de template"
1. New action on proposal create (and an action on an existing draft to apply/replace from a template).
2. Service deep-copies template sections/items → proposal sections/items, snapshotting catalog price/tax, resolving placeholders, setting `valid_until` from `default_validity_days`, copying `terms` and `discount_bps`.
3. Recompute and persist `proposals.value`.
4. Guarded by lifecycle: content is editable only while `draft` (BR-026 terminal states already block edits); applying a template to a non-draft is rejected 409.

### 6.3 API additions on `/proposals`
- `POST /proposals/{id}/apply-template` `{template_id}` → deep-copy into a draft (replaces existing content).
- `PUT /proposals/{id}/content` → edit sections/items/terms/discount of a draft; recomputes `value`.
- `GET /proposals/{id}/content` → sections + items + computed totals for the editor & preview.
- Optionally allow `POST /proposals` to accept `template_id` to instantiate at creation.

### 6.4 Frontend
- Extend `proposal-detail-view.tsx`: a **"Conteúdo"** section with the builder (draft only) and a **"Pré-visualização"** tab/route `crm/proposals/[id]/preview` — a branded, print-optimized page (company header, sections, itemized table grouped by billing type, one-time/recorrente totals, terms). `@media print` styles; a "Imprimir / Guardar PDF" button triggers `window.print()`.
- Totals card shows one-time total, monthly total, annual total separately.

---

## 7. Error Handling & Edge Cases
- Deleting/archiving a catalog item never breaks a proposal (snapshot); `catalog_item_id` goes NULL, snapshot fields remain.
- Empty proposal (no items) → `value` = 0; send prerequisites (BR-025) unchanged.
- Applying a template to a non-draft proposal → 409.
- Discount rounding: compute net per group, apply discount proportionally, round tax last; total reconciles to the sum of grouped grosses (unit-tested).
- Placeholder with missing data (e.g., no company) → left as literal `{{empresa}}` rather than blank/undefined.

## 8. Testing
- **Backend:** repo/service tests per piece; totals & discount math unit tests (rounding, mixed billing types); instantiation deep-copy test (mutating template afterwards does NOT change the proposal); lifecycle guard tests (apply-template on non-draft → 409); `value` recompute test. Extend `tests/smoke/`.
- **Frontend:** Playwright CLI visual readback of catalog list, template editor, and proposal preview (desktop + mobile + print emulation), per the visual-foundation rule.

## 9. i18n
All new strings in `messages/pt-PT.json` (canonical) + `en.json`, dot-notation keys (`catalog.*`, `proposalTemplates.*`, `proposals.content.*`, `proposals.preview.*`). No hardcoded UI strings. Locale never in URL.

## 10. Build Order (single plan, phased milestones)
1. **M1 Catalog** — model+migration, repo/service/routes, tests, frontend pages+nav.
2. **M2 Templates** — models+migration, totals/placeholder pure functions + tests, repo/service/routes, frontend editor.
3. **M3 Proposal content + preview** — proposal extension migration, instantiation service, content/preview APIs, detail-view integration, printable preview page, visual readback.

## 11. Open Questions (resolve at plan time)
- Rich-text storage format for section bodies & terms: sanitized HTML vs markdown. Recommendation: markdown stored, rendered safely — simpler, no XSS surface.
- Catalog create/edit as dialog vs full page. Recommendation: dialog for create, page for edit (matches proposal patterns).
