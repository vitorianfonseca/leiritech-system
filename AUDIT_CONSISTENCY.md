# Consistency & Architecture Audit

## Progress
- [x] Architecture inference
- [x] Naming convention scan (files, exports, enums, i18n keys)
- [x] Duplicate logic scan (frontend format helpers, reports pipeline)
- [x] Error response audit (backend envelope + frontend BFF routes)
- [x] God file / god function audit
- [x] Dependency graph analysis (frontend via madge, backend via import scan)
- [x] State-management pattern check (TanStack Query usage)
- [x] Enum/state-key casing check
- [x] Test coverage gap check

## Inferred Architecture

**Pattern**: Layered, on both sides.
- Backend (FastAPI): `api/routes/*` (HTTP wiring only) → `services/*` (business rules,
  BR-xxx enforcement) → `repositories/*` (query builders) → `models/*` (SQLAlchemy).
  A single `core/errors.py` + `core/permissions.py` + `api/dependencies/auth.py` layer
  is shared by every route.
- Frontend (Next.js App Router): server components (`app/**/page.tsx`) resolve
  `getSession()` and pass a typed user down → client "view" components own
  TanStack Query fetching → typed API clients in `lib/api/*` → a single `http.ts`
  fetch wrapper with centralized case-mapping and error typing.

**Evidence**: 149/150 backend routes delegate to a `*_service` function with zero
direct ORM calls in the handler; permission checks are 100% centralized in
`api/dependencies/auth.py` / `core/permissions.py` (no inline `role ==` checks found
in routes); every list-fetching component in the sample uses `useQuery`/`useMutation`,
none use raw `useEffect`+`fetch`; the error envelope `{"error":{"code","message","details"}}`
specified in forge-prd.md §7 is implemented in exactly one place
(`app/main.py::_error_envelope`) and used by all three FastAPI exception handlers.
This is a well-executed layered architecture overall — most findings below are
localized inconsistencies, not systemic violations.

**One consolidated note (per instructions, not itemized further)**: the frontend was
fully rebranded to LeiriTech this session (colors, component/type names, `leiritech_*`
cookies, translations) while the backend intentionally still uses legacy "Aurea"
naming throughout (package name `aurea-backend`, `app/main.py` docstring "Aurea
System", `structlog.get_logger("aurea")`, docker-compose service/db names, `.env.example`,
seed emails `@aurea.pt`/`@aurea.studio`, `DATABASE_URL=aurea:aurea`) — **45 backend
files** contain "aurea". Known/intentional per session context; not re-itemized below.

---

## Findings

| # | Severity | File | Line(s) | Description | Recommendation |
|---|----------|------|---------|-------------|----------------|
| 1 | HIGH | `frontend/src/components/reports/report-compute.ts` (esp. L555-591) vs `backend/app/services/report_service.py` / `backend/app/repositories/reports.py` | 546-591 | The Reports page never calls the backend's built, versioned `/reports/{commercial,projects,team,financial}` endpoints (confirmed: no fetch to `/reports` anywhere in `frontend/src`). Instead `frontend/src/lib/api/reports.ts::getDataset` re-fetches raw companies/projects/tasks/time-entries/finance rows and **reimplements the entire analytics layer client-side** in `report-compute.ts` (~650 lines: conversion rate, win/loss value, utilization, margin, monthly evolution — the same aggregates §5/F19 and `report_service.py` already compute server-side). The two implementations have already diverged (see #2). This is a large duplicate-logic surface that must be kept in sync by hand and currently isn't. | Make the Reports page call `GET /api/v1/reports/{type}` for the numbers it renders (or delete the unused backend report endpoints if the client-side approach is the intended final design) — pick one source of truth for report math, not two. |
| 2 | HIGH | `frontend/src/components/reports/report-compute.ts:555-591` vs `backend/app/services/finance_service.py:475-490` | 587 | Business-rule divergence caused by #1: PRD/BR-065/069/H8 define `margin = contracted − (Σ logged hours × internal rate) − Σ project_costs`, and the backend implements exactly that. The frontend's client-side `marginByProject()` computes `marginCents = contractedCents - costsCents` — it **omits labour cost entirely**. The Financeiro report tab shown to users therefore displays a materially wrong (inflated) margin per project versus what the backend/finance tab would compute for the same data. | Remove the client-side margin calc; consume `marginCents`/`marginRatio` from the backend financial report (or from `finance_service`'s per-project summary) instead of recomputing from raw milestones+costs. |
| 3 | HIGH | `frontend/src/components/pipeline/pipeline-format.ts:36`, `frontend/src/components/proposals/proposal-format.ts:26`, `frontend/src/components/projects/project-format.ts:23` | — | `parseEuroToCents()` is implemented independently 3 times. Two of them (pipeline, proposals) return `null` on unparsable input (caller can block submit); the third (`project-format.ts`) instead returns `0` on unparsable input — a malformed contracted-value string in the New Project form silently becomes €0.00 instead of failing validation, which is a data-integrity risk on exactly the field (`contracted_value`) the PRD calls out as commercially critical (BR-035/H1). | Consolidate into one `lib/currency.ts` helper with one input→output contract (prefer `null` on invalid, forcing every caller to handle it explicitly), used by all three forms. |
| 4 | MEDIUM | `frontend/src/components/crm/crm-format.ts:19`, `frontend/src/components/pipeline/pipeline-format.ts:27`, `frontend/src/components/proposals/proposal-format.ts:51`, `frontend/src/components/tasks/task-meta.tsx:48`, `frontend/src/components/projects/project-format.ts:15` | — | `initials(name)` is copy-pasted identically into 4 files, and reimplemented with different logic in a 5th (`project-format.ts` picks first+last-word letters and returns `"?"` for empty input, instead of the other four's first-two-words + `""` for empty). Same visual concept (avatar fallback), 5 divergent implementations. | Move to `lib/utils.ts` (already the shared frontend util module) as a single exported `initials()`. |
| 5 | MEDIUM | `frontend/src/components/reports/reports-format.ts:14`, `frontend/src/components/time/time-format.ts:16` | — | Two exported functions both named `formatHours(x, locale)` exist in different modules with **incompatible unit semantics**: `reports-format.ts` expects hours, `time-format.ts` expects minutes. A wrong import (both are plausible names to reach for from a "time/hours" component) silently produces a value 60x off with no type error, since both signatures are `(number, string) => string`. `formatDateTime` is similarly duplicated (`crm-format.ts` and `time-format.ts`, both `(iso, locale) => string`, presumably fine but still unreviewed duplication). | Rename for the unit (`formatHoursFromMinutes` vs `formatHoursDecimal`) or consolidate both time-formatting modules into one `lib/format/time.ts`. |
| 6 | MEDIUM | `frontend/src/components/projects/financeiro-tab.tsx`, `frontend/src/components/reports/{comercial,equipa,financeiro,projetos}-reports.tsx` | — | File-naming convention is inconsistent within the same directories: pt-PT-named component files (`financeiro-tab.tsx`, `comercial-reports.tsx`, `equipa-reports.tsx`, `financeiro-reports.tsx`, `projetos-reports.tsx`) sit alongside English-named siblings doing the exact same kind of job (`overview-tab.tsx`, `phases-tab.tsx`; `report-charts.tsx`, `report-compute.ts`, `reports-view.tsx`). All of these render text exclusively through `next-intl` `t()` calls, so there's no reason the file/export names themselves needed to be in Portuguese — it's a leftover from whoever wrote each file choosing their own language for identifiers. | Rename the 5 files/exports to English (`FinanceTab`, `CommercialReports`, `TeamReports`, `FinancialReports`, `ProjectsReports`) to match the rest of `components/` and `components/projects/`. |
| 7 | MEDIUM | `frontend/src/messages/en.json` (e.g. L48, L159-160, L400, L588, L1360, L1400-1401, L1495, L1736-1737, L1758, L2857-2858) and corresponding call sites in `feedback.txt` | — | Toast/feedback i18n keys use at least 4 different naming conventions for the same concept across features: nested `toast.<event>` / `toasts.<event>` (pipeline, finance, my-work), flat suffix `createdToast`/`errorToast`/`savedToast` (catalog, templates, proposal content), flat prefix `toastCreated`/`toastUpdated`/`toastRestored` (company detail), and generic `errorGeneric`/`saved`/`changed` (settings, profile). No single pattern dominates enough to call the others the exception. | Standardize on one nested convention (e.g. `toasts.created`, `toasts.updated`, `toasts.error`) across all message namespaces going forward; not worth a mass rename now, but document the convention so new features don't add a 5th style. |
| 8 | MEDIUM | `frontend/src/app/api/auth/login/route.ts:21,52`, `frontend/src/app/api/auth/refresh/route.ts:21` | 21, 52, 21 | These Next.js BFF route handlers construct their own `{error:{code,message}}` envelopes with **hardcoded English** messages ("Invalid request body.", "Could not load profile.", "No session.") — everywhere else in the app (backend `core/errors.py`, all FastAPI responses) user-facing error messages are pt-PT, per PRD §7's own example (`"A tarefa indicada não existe."`) and per the i18n NFR ("all UI strings via translation keys; canonical pt-PT"). These specific messages are edge cases (malformed body / no cookie) so impact is low, but they're the only English strings in the error path of an otherwise pt-PT product. | Route these fallback messages through the same message catalog (or at minimum a pt-PT constant) instead of literal English strings. |
| 9 | MEDIUM | `frontend/src/components/settings/export-settings-view.tsx:24-46` | 27-31 | Settings → Data Export produces a **fake CSV**: `download()` writes only the column header plus one row of `"—"` placeholders per dataset ("Mock export: real backend streams the dataset" per the inline comment) and reports success via toast. Meanwhile the unrelated Reports page CSV export (`components/reports/csv.ts` + `report-section.tsx`) exports real, client-computed data. Two "export to CSV" affordances exist in the same app with different levels of realness, and the settings one is shippable-looking but non-functional. | Either wire `ExportSettingsView` to a real backend export endpoint (F20 acceptance criteria implies real export) or clearly mark it as "coming soon" instead of a working-looking button that silently downloads placeholder data. |
| 10 | HIGH | `backend/app/services/project_service.py` | 1-815 (whole file) | God-service: 815 lines covering ≥5 distinct responsibilities — project CRUD (155-278), lifecycle state-machine transitions (279-419), health suggestion/publishing (419-535), membership management (536-608), and template CRUD + instantiation + won→project conversion (609-815). This is the largest service in the codebase by a wide margin (next is `proposal_service.py` at 673 lines) and mixes concerns the PRD treats as separate features (F8 Projects, F9 Templates, F7 Won→Project). | Split into `project_service.py` (CRUD+lifecycle), `project_health_service.py`, `project_membership_service.py`, and `project_template_service.py` (template CRUD/instantiation + conversion), matching the pattern already used for `proposal_service.py` / `proposal_template_service.py` (which *are* already split this way). |
| 11 | MEDIUM | `frontend/src/components/conversion/convert-wizard.tsx` | 1-1042 (whole file) | 1042-line file — the largest in the frontend by ~300 lines — containing the wizard shell plus all 5 step components (`StepDetails`, `StepTemplate`, `StepMilestones`, `StepTeam`, `StepReview`) and their local state/validation. Reasonably organized internally, but its size makes it the hardest single file to review or test in isolation. | Split each `Step*` component into its own file under `components/conversion/steps/`, keeping `convert-wizard.tsx` as the orchestrator. |
| 12 | LOW | `backend/app/api/routes/attachments.py:116-133` | 125-132 | `list_attachments` is the only route handler in the backend (checked all 150 routes) that issues a raw `db.execute(select(...))` directly instead of delegating to a repository/service function — every other route in the codebase (companies, tasks, projects, etc.) calls out to `*_service`. Minor, single-instance layering inconsistency. | Move the query into `attachment_service.list_for_entity()` (or a new `repositories/attachments.py`) for consistency with the rest of the codebase. |
| 13 | LOW | `frontend/.verify.mjs`, `frontend/.verify2.mjs` (untracked), `frontend/.aurea-run-server.mjs` | — | Sequentially-numbered ad-hoc scripts (`.verify.mjs`, `.verify2.mjs`) sitting in the frontend root outside `tests/` or `scripts/`, suggesting copy-paste-and-rerun debugging rather than a single maintained script. Also note `scripts/close-reconciled-issues.sh` (untracked, project-root `scripts/`) is a second, differently-located scripts convention. | Consolidate one-off verification scripts into `frontend/tests/` or a single `frontend/scripts/` dir, delete the superseded `.verify.mjs`/`.verify2.mjs` once no longer needed, and remove from git status before merging. |
| 14 | LOW | `frontend/src/components/reports/report-compute.ts` | 1-650 | This is the single largest pure-business-logic module on the frontend (margin, conversion rate, utilization, monthly evolution — see finding #2 for a live bug in it) and has **zero unit tests**; frontend testing overall is limited to one Playwright smoke spec (`frontend/tests/e2e/smoke.spec.ts`) and a visual-baseline script, versus the backend's near 1:1 service-to-test-file coverage (29 service modules, 29 test files). | Add unit tests for `report-compute.ts`'s pure functions (especially `marginByProject`, `conversionSummary`, `monthlyEvolution`) before relying on it as a second source of truth for financial reporting. |

---

## Positive notes (things done consistently, called out so they aren't "rediscovered")
- Error envelope `{"error":{"code","message","details"}}` is implemented in exactly
  one place backend-side and used uniformly (200+ endpoints, 3 exception handlers).
- Permission checks are 100% centralized in `core/permissions.py` +
  `api/dependencies/auth.py`; no inline role checks found in any route file.
- No circular dependencies found (verified with `madge --circular` on the frontend;
  manual cross-import check on backend services).
- Enum/state fields are consistently stable English snake_case tuples
  (`app/models/enums.py`), matching the PRD's "stable English keys, pt-PT labels
  client-side" requirement; frontend mirrors the same string unions.
- API versioning is consistent: all backend routes sit under `/api/v1` via one
  `settings.API_V1_PREFIX`, and the frontend's single `http.ts` client is the only
  place that constructs API URLs.
- Data fetching is uniformly TanStack Query (`useQuery`/`useMutation`) across every
  sampled component — no stray `useEffect`+`fetch` pattern found.
