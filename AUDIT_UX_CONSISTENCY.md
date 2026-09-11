# UX Consistency Audit — LeiriTech (Aurea)

Scope: cross-entity CRUD pattern consistency, destructive-action confirmation, terminology
drift vs `forge-prd.md` §3 glossary, primary-action placement, table-pattern reuse, and
color-token usage vs `frontend/DESIGN.md`. Cross-referenced against `.forge-cache/` and
`forge-prd.md` §3/§8, then verified by reading source directly (cache does not capture
component *behavior*, only occurrence, so every finding below was confirmed by reading the
actual file).

All paths are relative to `/Users/vitoriafonseca/LeiriTech/leiritech/`.

## CRUD Pattern Matrix (verified against forge-prd.md §8 and source)

| Entity | List | Create | Detail | Edit | Delete/Archive | Pattern |
|---|---|---|---|---|---|---|
| Company | SmartTable | **Dialog** (list) *and* **full page** `/crm/companies/new` | Page `/crm/companies/[id]` | Dialog (`company-form-dialog.tsx`) | Custom confirm dialog w/ blocker check (`archive-company-dialog.tsx`) | Page + Dialog (duplicated) |
| Contact | SmartTable | **None** — no create UI exists anywhere | Page `/crm/contacts/[id]` (read-only) | **None** | **None** | Read-only |
| Catalog item | SmartTable | Dialog (`catalog-form-dialog.tsx`) | Page `/crm/catalog/[id]` | Dialog | **Immediate, no confirmation** (`catalogApi.archive()` fired directly on click) | Dialog, unconfirmed delete |
| Opportunity | Kanban board | Dialog (`create-opportunity-dialog.tsx`) | Page `/crm/opportunities/[id]` | **No general edit** — only inline probability field + single-purpose dialogs (Won/Lost/Reopen/Move) | N/A (terminal states, no delete) | Dialog create, no edit surface |
| Proposal | SmartTable | Dialog (`create-proposal-dialog.tsx`) | Page `/crm/proposals/[id]` | **No metadata edit** — inline content editor + single-purpose dialogs (Send/Reject/Resend/Archive) | Confirm dialog (via `ConfirmDialog`, archive) | Dialog create, no edit surface |
| Project | SmartTable | **Full page** `/projects/new` | Page `/projects/[id]` (tabs) | No core-field edit found; lifecycle via `reason-dialog.tsx` (pause/resume/cancel/archive) | `reason-dialog.tsx` (custom, requires reason) | Page-based |
| Task | Kanban/list/calendar | Dialog (`create-task-dialog.tsx`) | Side panel (`task-side-panel.tsx`) | Inline in side panel | `ConfirmDialog` (shared) | Dialog + panel |
| Proposal Template | SmartTable | **Full page** `/crm/proposal-templates/new` | Page `/crm/proposal-templates/[id]` | Same page (editor) | — | Page-based |
| Project Template | SmartTable | Dialog (`template-form-dialog.tsx`) then page editor `/settings/templates/[id]` | Page | Page editor + Dialogs for phase/task rows | `ConfirmDialog` (shared) | Mixed dialog+page |
| Finance milestone/cost | Table | Dialog | N/A (row-level) | Dialog | `ConfirmDialog` (shared) | Dialog-based |

**Dominant pattern:** Modal dialog for create (7/10 entities). **Deviations:** Company (page
*and* dialog, redundant), Project and Proposal Template (page-only, no dialog alternative),
Contact (no create surface of any kind).

## Terminology check (forge-prd.md §3 glossary)

Grepped for glossary violations ("lead" instead of "oportunidade", "fatura"/"invoice" instead
of "marco de pagamento" per BR-072, "orçamento" instead of "proposta"): **no violations found**.
The codebase explicitly documents the BR-072 boundary in comments (e.g.
`frontend/src/lib/api/finance-types.ts:11,26-28`, `frontend/src/components/finance/index.ts:7`)
and all "orçamento" occurrences refer to *hours budget* or the *client's own budget*, not the
proposal — this is correctly disambiguated. This part of the domain terminology is solid.

One minor internal (non-user-facing) inconsistency found: in `frontend/src/messages/pt-PT.json`,
the `crm.status.company.*` keys are Portuguese enum identifiers (`potencial`, `ativo`, `inativo`,
`parceiro`, `arquivada`, lines ~1181-1187) while the sibling `crm.status.contact.*` keys for the
same active/inactive concept are English identifiers (`active`, `inactive`, lines 1188-1191).
Both currently render correctly ("Ativo"/"Inativo"), so it's not user-visible today, but it's an
inconsistent naming convention between two adjacent CRM sub-entities that increases translation/
maintenance risk.

## Color tokens (DESIGN.md)

No raw hex or `oklch()` literals found in component `.tsx` files outside the theme-settings
surfaces (`grep` for `#[0-9a-f]{3,8}` and `oklch(...)` returned zero matches in components).
`text-gold` / `bg-gold` usage (125 occurrences) is intentional and documented in `DESIGN.md`
(the `--gold` CSS variable is the brand-accent token, now cobalt blue) — correct usage, not a
violation.

## Findings

| # | Severity | File | Line(s) | Description | Recommendation |
|---|----------|------|---------|--------------|----------------|
| 1 | CRITICAL | `frontend/src/components/catalog/catalog-detail-view.tsx` | 70-79 | Catalog "Archive" button fires `catalogApi.archive(item.id)` directly on click with zero confirmation step, while the functionally equivalent action on every other entity (Company `archive-company-dialog.tsx`, Proposal archive via shared `ConfirmDialog`, Project pause/cancel/archive via `reason-dialog.tsx`, Task delete via shared `ConfirmDialog`) requires an explicit confirm dialog. This directly contradicts the PRD's own stated invariant ("Every page has ... destructive-action confirmation", `forge-prd.md` §8) and is a real data-loss risk if a user misclicks. | Wrap the catalog archive action in the shared `ConfirmDialog` (already used by 15+ other flows) before calling `catalogApi.archive`. |
| 2 | HIGH | `frontend/src/components/crm/contacts-view.tsx`, `frontend/src/components/crm/contact-detail-view.tsx`, `frontend/src/components/shell/quick-create.tsx:31` | n/a | Contact has no Create, Edit, or Archive/Delete affordance anywhere in the UI — only list + read-only detail exist (verified: no `contact-form-dialog.tsx` or equivalent exists in `components/crm/`, and `contact-detail-view.tsx` renders zero action buttons). Yet `forge-prd.md` §8 explicitly lists "/crm/contacts + [id] \| Contact CRUD", and the global `QuickCreate` menu (`quick-create.tsx:31`) offers a "Novo contacto" entry that only deep-links to the `/crm/contacts` list page, not to any creation form — a misleading affordance that promises an action the UI cannot perform. | Either ship the Contact create/edit/archive dialog (mirroring Company's pattern) or remove the "Novo contacto" quick-create entry and the CRUD claim from the spec until implemented. |
| 3 | HIGH | `frontend/src/components/crm/companies-view.tsx:273` (dialog) vs `frontend/src/app/(app)/crm/companies/new/page.tsx` + `frontend/src/components/crm/new-company-form.tsx` (page), also linked from `frontend/src/components/shell/quick-create.tsx:31` | — | Company creation has two independent, fully-built implementations: a modal (`company-form-dialog.tsx`, opened from the companies list "Nova empresa" button) and a dedicated full page (`/crm/companies/new`, reached via the global Quick Create menu). No other entity in the app has two parallel create surfaces — this doubles the maintenance surface (two validation/error/loading implementations for the same mutation) and gives users two different mental models for "how do I add a company" depending on entry point. | Pick one surface (the PRD's own §8 table specifies the page route) and remove the other, or make the list-page button navigate to the same page instead of opening a dialog. |
| 4 | HIGH | Company/Project (`.../new` pages) vs Opportunity/Proposal/Catalog/Task/Finance (dialogs) | — | The "create" pattern is split roughly 70/30 between modal dialogs and full pages with no consistent rule visible to the user: Company and Project use a full-page form; Proposal Template also uses a full page; but Opportunity, Proposal, Catalog item, Task, and Finance milestones/costs all use modal dialogs for the same conceptual action (create a new record of a management entity). A user who learns "creating things opens a page" from Projects is then surprised that creating an Opportunity or Proposal opens a dialog instead, and vice versa. | Adopt one convention (dialog for quick objects, page reserved only for multi-step/wizard flows such as Won→Project conversion) and apply it uniformly; document the rule in DESIGN.md so future entities follow it. |
| 5 | HIGH | `frontend/src/components/pipeline/opportunity-detail-view.tsx`, `frontend/src/components/proposals/proposal-detail-view.tsx` vs `frontend/src/components/crm/company-detail-view.tsx:197`, `frontend/src/components/catalog/catalog-detail-view.tsx:65` | — | "Edit" as a general action exists for Company and Catalog (a dedicated Pencil-icon button opening a form dialog pre-filled with all fields), but does **not** exist for Opportunity or Proposal — those two only expose single-purpose lifecycle dialogs (Won/Lost/Reopen/Move for Opportunity; Send/Reject/Resend/Archive for Proposal) plus one inline-editable field (probability) or an inline content editor. There is no way to, e.g., correct an opportunity's title or a proposal's client-facing reference after creation without going through a lifecycle action. This is an inconsistent "how do I edit this record" model across sibling CRM entities. | Decide whether core-field editing is intentionally locked post-creation for Opportunity/Proposal (if so, state it in the PRD as a deliberate immutability rule) or add a standard Edit dialog matching Company/Catalog. |
| 6 | MEDIUM | `frontend/src/components/crm/archive-company-dialog.tsx` (full file), `frontend/src/components/projects/reason-dialog.tsx`, `frontend/src/components/pipeline/lost-dialog.tsx` vs `frontend/src/components/shared/confirm-dialog.tsx:38-39,85-121` | — | The shared `ConfirmDialog` component explicitly documents a `children` prop for "extra content between the description and the actions" (confirm-dialog.tsx:38-39) — designed precisely for confirm-with-extra-field flows. Despite this, `archive-company-dialog.tsx` (blocker list + confirm), `reason-dialog.tsx` (reason textarea + confirm), and `lost-dialog.tsx` (reason select + confirm) each re-implement the identical icon-circle / `DialogTitle` / `DialogDescription` / cancel-confirm-with-pending-state layout from scratch instead of composing `ConfirmDialog`. Each has its own local i18n keys for "cancel"/"confirm"/pending-label (e.g., `t("archiving")` vs the shared `t("processing")`), which is exactly how visual/copy drift like finding #1 gets introduced over time. | Refactor these three dialogs to wrap `ConfirmDialog` and pass their extra field/list via `children`, keeping cancel/confirm copy centralized. |
| 7 | MEDIUM | `frontend/src/components/finance/finance-format.ts:28-32` (`formatDate`) vs `frontend/src/components/crm/crm-format.ts:7-14` and `frontend/src/components/time/time-format.ts:30-49` (`formatDateTime`/`formatDateShort`) | — | `formatDate` (used across Finance and re-exported for CRM) ignores its locale context entirely and always renders `dd/mm/yyyy` by manually splitting the ISO string, whereas `formatDateTime`/`formatDateShort` pass the active locale into `Intl.DateTimeFormat`, which genuinely reorders day/month for non-pt-PT locales. Verified: for the same date, `formatDate`-style output is `05/03/2026` while `Intl.DateTimeFormat("en", ...)` produces `03/05/2026`. Because `"en"` is a real, user-selectable locale (`frontend/src/i18n/routing.ts`: `locales: ["pt-PT", "en"]`, switchable via the profile's `LocaleSwitcher`), an English-locale user will see a plain date field (e.g. company "last interaction") and an adjacent datetime field (e.g. its interaction timeline) rendering the same day in two different digit orders on the same page. | Make `formatDate` locale-aware via `Intl.DateTimeFormat` like its siblings, or intentionally document `dd/mm/yyyy` as a fixed non-localized business format everywhere (including the datetime helpers) so all date-ish output reorders consistently — pick one and apply to all three helpers. |
| 8 | LOW | `frontend/src/messages/pt-PT.json` lines ~1181-1191 (`crm.status.company.*` vs `crm.status.contact.*`) | 1181-1191 | The company status enum uses Portuguese-language keys (`potencial`, `ativo`, `inativo`, `parceiro`, `arquivada`) while the contact status enum — same "active/inactive" concept — uses English keys (`active`, `inactive`) in the same `crm.status` i18n namespace. Not user-visible today (both resolve to "Ativo"/"Inativo"), but it signals an underlying backend enum-naming inconsistency between two closely related entities and is a translation-maintenance foot-gun. | Standardize enum key casing/language across all `crm.status.*` sub-objects (prefer the English-key convention used by contact/opportunity/proposal/project, since company is the outlier). |

## Not flagged (checked, found consistent)

- **Feedback pattern**: all 146 `feedback.txt` call sites use the shared `toast()` helper with
  `{ tone, title }`; no `alert()`/inline-only success messages found. Consistent.
- **Button placement/order**: every dialog checked (`archive-company-dialog.tsx`,
  `confirm-dialog.tsx`, `lost-dialog.tsx`, `won-dialog.tsx`, `reason-dialog.tsx`, all
  `*-form-dialog.tsx`) places Cancel (outline, left in DOM/`flex-col-reverse sm:justify-end`)
  before Confirm (solid/destructive, visually right) — consistent right-aligned primary action.
- **Create-button label convention**: verified a coherent 3-tier convention across the whole
  i18n bundle — "Novo/Nova X" for the button that opens a create surface, "Criar X" for the
  actual submit/persist action, "Adicionar X" for creating a sub-item within a parent entity
  (phase/task/checklist item/line item). No mixed usage found for the same tier.
- **Domain terminology (BR-072, oportunidade/proposta)**: no glossary violations found (see
  above); the codebase actively guards this boundary with comments.
- **Color tokens**: no raw hex/oklch in components; `--gold` token usage matches DESIGN.md.
- **Hand-rolled `<table>` elements** (`roles-settings-view.tsx`, `line-items-table.tsx`,
  `proposal-content-editor.tsx`, `proposal-preview.tsx`): each is a static permission matrix,
  an inline-editable line-item grid, or printable document markup — none needs SmartTable's
  search/sort/filter/paginate features, so hand-rolling is a reasonable exception, not
  inconsistency.
