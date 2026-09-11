# Application Audit Report

- **Date**: 2026-09-10
- **Project**: LeiriTech (internal PSA/CRM tool for a software studio; formerly "Aurea System" — frontend rebranded this session, backend not yet)
- **Root**: /Users/vitoriafonseca/LeiriTech/leiritech
- **Stack**: Next.js 16 App Router (TypeScript, shadcn/ui, TanStack Query) + FastAPI (Python, SQLAlchemy 2.0, Alembic) + PostgreSQL 16
- **Specification**: forge-prd.md + WORKFLOW_SPEC.md (r2 — state machines, BR-001..084, permission matrix, 25 critical flows)
- **Auditors**: 13-agent unified team (Quality 6 · UX 4 · Workflow 3)
- **Cache**: rebuilt at 2026-09-09 21:48 UTC (`.forge-cache/`)
- **Total Findings (post-dedup)**: 75
- **CRITICAL**: 17 | **HIGH**: 21 | **MEDIUM**: 22 | **LOW**: 15

## Executive Summary

LeiriTech has a genuinely disciplined backend core — 40 of 42 spot-checked business rules are correctly, backend-authoritatively enforced (workflow-logic audit), the error envelope and permission-check layer are 100% centralized with no inline role checks anywhere, and UX navigation is flawless (0 broken links across 111 targets, 49 pages). But three classes of CRITICAL gap sit underneath that polish and must be fixed before this can be trusted as the company's system of record:

1. **Concurrency holes that corrupt state, not just UX.** Two Admins can race to deactivate each other and leave the system with **zero active Administrators** (BR-005); a race between "mark won" and "mark lost" on the same opportunity can produce the explicitly-forbidden `won→lost` transition; a double-click on "Converter em projeto" creates two duplicate projects because `projects.opportunity_id` has no unique constraint. None of these have a DB-level backstop the way the single-active-timer rule does.
2. **Financial data is leaking and miscalculating.** `GET /projects` returns `contracted_value`/`internal_cost_rate` to *any* authenticated role including Membro — a direct BR-008 violation the frontend silently assumed the backend prevented (it doesn't). Separately, the Reports page reimplements margin calculation client-side and omits labour cost entirely, showing an inflated margin that disagrees with the correct backend calculation used elsewhere.
3. **Several features that render as fully working are non-functional mocks.** Proposal PDF upload/download, the project-template phase/task editor, the task checklist, task archive/restore, Settings → Data Export, and Settings → role management all either don't persist past the browser session or silently fail — a user cannot tell the difference between these and the real, working features next to them.

On top of these: the logout button never calls the logout endpoint (sessions aren't revoked server-side), the Meeting entity has a DB model but no API so meeting reminders and calendar meeting lanes are permanently empty, and Contact has zero create/edit/archive UI despite the spec requiring it (directly contradicting a "CRM is solid" claim from another pass — flagged below as an unresolved discrepancy).

**Top 3 immediate actions**: (1) add row-locking/unique-constraint backstops to the four concurrency races (last-Admin, won/lost, duplicate-project, plus the general check-then-insert pattern); (2) redact financial fields from `ProjectResponse` for non-finance roles and fix the Reports margin calculation; (3) either wire or clearly gate-off (as "coming soon") the mock features listed above so users cannot lose data believing it was saved.

---

## Critical & High Findings (Action Required)

### CRITICAL

| # | Domain | Category | File | Line(s) | Description | Recommendation |
|---|--------|----------|------|---------|-------------|----------------|
| C1 | Quality | security | `backend/app/schemas/projects.py`, `backend/app/api/routes/projects.py` | schemas:79-81, routes:71-154 | BR-008 violation: `ProjectResponse` leaks `contracted_value`/`hours_budget`/`internal_cost_rate` to any authenticated role via `GET /projects` and `GET /projects/{id}` — no `RequireFinance` gate, unlike the correct pattern in `finance.py`/`reports.py`/`dashboard_service.py`/`users.py`. Frontend wrongly assumes the backend already nulls these for non-finance callers. *Note: workflow-logic-auditor confirmed BR-008 is correctly enforced elsewhere (finance/reports/dashboard) — it did not check `projects.py` specifically, so this is a gap in that endpoint, not a contradiction.* | Add a role check that nulls these 3 fields for callers without `can_manage_financials`; add a regression test asserting a Membro token never receives non-null values. |
| C2 | Quality | security | `backend/app/schemas/attachments.py:11-16`, `routes/attachments.py:45-87`, `storage/r2.py:84-90` | — | Upload validation gap (issue #47): `content_type`/`size_bytes` are client-supplied with no MIME allowlist and no upper size bound; `presign_upload()` passes client content_type straight to S3. Independently confirmed by missing-impl-auditor and security-auditor. | Add `MAX_ATTACHMENT_SIZE_BYTES` + `le=` in schema; validate `content_type` against an explicit allowlist before minting the presigned URL. |
| C3 | Quality | saas-pages | `frontend/src/components/shell/user-menu.tsx:71`, `frontend/src/components/profile/security-section.tsx:159` | — | Logout in both the top-bar user menu and the profile security section just navigates to `/login` — neither calls `POST /api/auth/logout`. Sessions and refresh tokens are never revoked server-side; a "logged out" user's token is still valid until natural expiry. | Build a shared `useLogout()` hook that calls the logout endpoint, clears cookies, then redirects; use it in both places. |
| C4 | Quality | missing-impl | `frontend/` (no Dockerfile/railway.json) | — | Frontend deployment configuration is entirely missing — no Dockerfile, no railway.json, no deploy workflow. Cannot ship the frontend to Railway or any container platform as-is. | Create `frontend/Dockerfile`, `railway.json`, and a deploy workflow. |
| C5 | Quality | missing-impl | `.github/` | — | No CI/CD workflows exist at all — no automated tests, builds, or deploys; every release is manual. | Add `.github/workflows/` for backend + frontend test/build/deploy. |
| C6 | Quality | missing-impl | `backend/app/services/email_service.py:25-28` | — | Email delivery is stubbed: even with `RESEND_API_KEY` configured, the service only logs instead of calling the Resend API. Password reset, invitations, and payment-reminder emails will never actually reach a user in production. | Complete the Resend API integration. |
| C7 | UX | ux-consistency | `frontend/src/components/catalog/catalog-detail-view.tsx:70-79` | — | Catalog "Archive" fires immediately on click with **zero confirmation**, unlike the equivalent action on every other entity (Company, Proposal, Project, Task all confirm). Directly contradicts the PRD's "every page has destructive-action confirmation" invariant — real data-loss risk on a misclick. | Wrap in the shared `ConfirmDialog` already used by 15+ other flows. |
| C8 | UX / Workflow | ux-interaction, workflow-completeness | `frontend/src/lib/api/proposals.ts:331,472-490,495`, `pdf-upload.tsx:101-127` | — | Proposal PDF upload/download is a non-functional stub end to end: upload shows a working-looking file card and Download button, but nothing is persisted (`file: null` on reload) and Download points at a non-existent `mock.r2.leiritech.pt` domain — because `mapProposal` never resolves `pdf_attachment_id` through the (working) `/attachments/{id}/download-url` endpoint. A user who attaches, sends, then reloads finds the attachment silently gone. | Resolve the download URL via the existing attachments endpoint in `mapProposal`; block/label the upload control until this is wired. |
| C9 | Workflow | workflow-completeness, workflow-logic | `backend/app/services/project_service.py:745-783` (`create_from_opportunity`), `opportunity_service.py:363-410` (`convert_opportunity`), `schemas/projects.py:150-162` | — | BR-035's required 422-if-empty guard for `contracted_value` on a verbal-close (no accepted proposal) won→project conversion **does not exist anywhere in the backend** — confirmed independently by two auditors. The code silently falls back to `opportunity.estimated_value` (itself optional); a project can be created with `contracted_value = NULL`. This is API-bypassable — the only enforcement is a frontend "required" field. This is the spec's explicit core differentiator. | Add the check in `create_from_opportunity`: raise 422 `CONTRACTED_VALUE_REQUIRED` when `contracted_value` is `None` and no accepted proposal exists. Consider not defaulting to `estimated_value` at all (see related LOW note). |
| C10 | Workflow | workflow-completeness | `frontend/src/lib/api/templates.ts:376-460`, `backend/app/api/routes/projects.py:48-59` | — | F9 Project templates: only bare list/create reach the backend. Detail/update/delete and **all** phase/task editing are 100% frontend-mock — any phases/tasks an Admin configures in Settings → Templates are lost on reload and never available to conversion, undermining F7 (won→project). | Add `GET/PATCH/DELETE /projects/templates/{id}` + phase/task sub-resource routes; wire the frontend to send the real nested payload (the backend's `create_template` already accepts it). |
| C11 | Workflow | workflow-completeness | `backend/app/models/crm.py:237`, no `meetings.py` route, `automations/meeting_reminder.py` | — | The Meeting entity (§1.9 state machine) has a DB model but **zero CRUD API**. "Log a meeting" fakes it as a plain `interaction` row with no state/organizer/reminder. AUTO-10 (meeting reminder) can never fire; My Work and Calendar meeting lanes are permanently empty. | Add a `/meetings` route (create/list/transition) backed by the existing model; point "log meeting" at it instead of `/interactions`. |
| C12 | Workflow | workflow-completeness | `backend/app/models/task.py:84`, `frontend/src/lib/api/tasks.ts:805-835` | — | Task checklist (`TaskChecklistItem`) exists as a DB table with no API at all — 100% frontend-mock, non-persistent, invisible to other users. | Add `GET/POST /tasks/{id}/checklist`, `PATCH/DELETE .../checklist/{item_id}`. |
| C13 | Workflow | workflow-completeness | `frontend/src/lib/api/tasks.ts:854-935` | — | Task archive/restore/soft-delete/duplicate have **no backend routes at all** — breaking BR-060 specifically for tasks (every other soft-delete entity has a working archive path). | Implement `POST /tasks/{id}/archive`, `/restore`, and a duplicate endpoint. |
| C14 | Quality / Workflow | data-integrity, workflow-edge-case | `backend/app/services/project_service.py:745-815`, `opportunity_service.py::convert_opportunity`, `backend/app/models/project.py` (`opportunity_id`) | — | Double-submit or two concurrent "Converter em projeto" clicks create **two separate projects** for one won opportunity: `projects.opportunity_id` has no unique constraint and the service never checks for an existing project before creating another. Both flip the company to "cliente ativo" and corrupt AUTO-11 (which assumes 1:1). | Add a partial unique index `ON projects(opportunity_id) WHERE opportunity_id IS NOT NULL AND archived_at IS NULL`, and/or an explicit 409 check in `create_from_opportunity`. |
| C15 | Workflow | workflow-edge-case | `backend/app/services/user_service.py:121-143` | 128 | BR-005 last-Admin guard has **no row lock**: two concurrent deactivations when exactly 2 Admins exist can both pass the `count<=1` check and both commit, leaving **zero active Administrators** — an unrecoverable state without direct DB access. | Wrap the count-check + update in `SELECT ... FOR UPDATE` over admin rows, or add a DB check constraint. |
| C16 | Workflow | workflow-edge-case | `backend/app/services/opportunity_service.py` (`_assert_open` 185-191, `win_opportunity` 312-334, `lose_opportunity` 337-360) | — | Concurrent "Marcar como ganha" + "Marcar como perdida" on the same opportunity can both pass the terminal-state guard under READ COMMITTED with no row lock, achieving the explicitly-forbidden `won→lost` transition. No DB backstop exists (unlike the timer rule). | Use `SELECT ... FOR UPDATE` or an optimistic `WHERE outcome = :expected` before applying `won`/`lost`; convert the loser to 409. |
| C17 | Workflow | workflow-edge-case | `backend/app/services/project_service.py::change_state:326-370`, `core/permissions.py::can_manage_project:104-110` | — | The permission matrix requires Gestor project-cancellation to be gated by an explicit grant (like the financial grant, per design decision #9 — cancellation has financial consequences). The implementation routes cancellation through the same check as ordinary owner actions (start/pause/resume) — **any** Gestor who owns a project can cancel it with no grant check anywhere. | Add an explicit grant check gating the `target=="cancelled"` branch of `change_state`. |

### HIGH

| # | Domain | Category | File | Description | Recommendation |
|---|--------|----------|------|-------------|----------------|
| H1 | Quality | security | `backend/app/api/routes/auth.py`, `invitations.py` | Rate limiting exists only on `/auth/login`; `/password/forgot`, `/password/reset`, `/invitations/accept`, `GET /invitations/{token}` are public and unthrottled — enables mail-bombing via `/password/forgot`. | Apply the existing sliding-window limiter to all four; consider a stricter per-email limiter on `/password/forgot`. |
| H2 | Quality | security | `backend/app/main.py:36-42` | `allow_methods=["*"]`/`allow_headers=["*"]` are overly broad for an internal invite-only tool (origins list itself is correctly non-wildcard). | Restrict to the actual verbs/headers used. |
| H3 | Quality | security | `backend/tests/test_*.py` (~22 files) | Shared hardcoded test password `correct-horse-battery` reused across the whole suite — low risk if test-only, but a real risk if any staging DB ever reuses seed data. | Confirm test seeds never run against a shared/staging DB; gate seed scripts by environment. |
| H4 | Quality | data-integrity | `backend/app/services/proposal_service.py::accept_proposal`, `repositories/pipeline.py:142-153` | No constraint prevents more than one `proposal` per opportunity reaching `accepted` simultaneously; `accepted_proposal()` silently picks "most recent," so two proposals racing to accepted can non-deterministically pick the wrong contract value. | Add a partial unique index `ON proposals(opportunity_id) WHERE status='accepted'`; reject (409) a second accept. |
| H5 | Quality | consistency | `frontend/src/components/reports/report-compute.ts` (~650 lines) vs `backend/app/services/report_service.py` | The Reports page never calls the backend's built `/reports/{type}` endpoints — it reimplements the entire analytics layer client-side, already diverged from the backend (see H6). | Call the backend report endpoints, or delete them if client-side is the intended final design — one source of truth, not two. |
| H6 | Quality | consistency | `frontend/src/components/reports/report-compute.ts:587` vs `backend/app/services/finance_service.py:475-490` | Direct consequence of H5: the frontend's `marginByProject()` computes `contracted − costs`, **omitting labour cost** entirely (BR-065 requires `contracted − Σlogged-hours×rate − Σcosts`). The Financeiro report shows a materially inflated margin vs. the correct backend calculation. | Consume the backend's margin figure instead of recomputing client-side. |
| H7 | Quality | consistency | `pipeline-format.ts:36`, `proposal-format.ts:26`, `project-format.ts:23` | `parseEuroToCents()` implemented 3x independently; the project-form version returns `0` (not `null`) on unparsable input, silently turning a malformed contracted-value into €0.00 instead of failing validation. | Consolidate into one `lib/currency.ts` helper that returns `null` on invalid input everywhere. |
| H8 | Quality | consistency | `backend/app/services/project_service.py` (815 lines) | God-service mixing ≥5 responsibilities (CRUD, lifecycle, health, membership, templates/conversion) — the largest service in the codebase by a wide margin. | Split into `project_service`, `project_health_service`, `project_membership_service`, `project_template_service`, matching the pattern already used for proposals. |
| H9 | UX | ux-consistency | `frontend/src/components/crm/contacts-view.tsx`, `contact-detail-view.tsx`, `shell/quick-create.tsx:31` | Contact has **zero** Create/Edit/Archive UI anywhere despite `forge-prd.md` §8 explicitly requiring "Contact CRUD"; the global Quick Create's "Novo contacto" entry is a dead-end that just links to the read-only list. **Discrepancy flag**: `AUDIT_WORKFLOW_COMPLETENESS.md` characterized F4 "company/contact/interaction CRUD" as solid — this finding's file-level evidence (no create/edit dialog exists anywhere in `components/crm/`) contradicts that characterization; treating this finding as authoritative given its specificity. | Ship the Contact create/edit/archive dialog (mirroring Company), or remove the CRUD claim and the misleading quick-create entry until built. |
| H10 | UX | ux-consistency | `companies-view.tsx:273` (dialog) vs `app/(app)/crm/companies/new/page.tsx` (page) | Company creation has two independent, fully-built implementations (a modal and a full page) — the only entity with two parallel create surfaces, doubling the maintenance burden. | Pick one surface (spec's own §8 table names the page route) and remove the other. |
| H11 | UX | ux-consistency | Company/Project (pages) vs Opportunity/Proposal/Catalog/Task/Finance (dialogs) | No consistent dialog-vs-page rule for entity creation — users learn one convention from one entity and get surprised by another. | Adopt one convention (dialog for quick objects, page reserved for multi-step wizards) and document it in DESIGN.md. |
| H12 | UX | ux-consistency | `opportunity-detail-view.tsx`, `proposal-detail-view.tsx` vs `company-detail-view.tsx:197`, `catalog-detail-view.tsx:65` | "Edit" as a general action exists for Company/Catalog but not Opportunity/Proposal, which only expose single-purpose lifecycle dialogs — no way to correct a title/reference after creation without a lifecycle action. | Decide if core-field editing is intentionally locked (document it) or add a standard Edit dialog matching Company/Catalog. |
| H13 | UX | ux-interaction | `frontend/src/components/tasks/task-side-panel.tsx:160-190,327-337` | Task side-panel timer Start button switches the active BR-040 timer with **no confirmation**, unlike `my-work-view.tsx` and `active-timer-card.tsx`, which both confirm before displacing a running timer — risks silently mis-attributed time. | Add the same pre-start confirmation used by the other two entry points. |
| H14 | Workflow | workflow-completeness | `frontend/src/lib/api/settings.ts:466-484`, `backend/app/api/routes/pipeline_stages.py:51` | BR-020 (win-probability editable) works on the backend but is unreachable from the UI: a key-mismatch (stage `code` vs UUID) means `updatePipelineStages` never calls the real endpoint — admin changes to stage names/probabilities/colors never reach the DB. | Resolve stage `code→id` before calling `PATCH /pipeline-stages/{id}`. |
| H15 | Workflow | workflow-completeness | `frontend/src/lib/api/settings.ts:379-397` | F20/matrix "Manage roles" is non-functional end to end: `updateMemberRole` writes only to a local in-session map, never the backend — a role change disappears on reload and is invisible to the real permission middleware. | Add `PATCH /users/{id}/role` (Admin-only, BR-005-guarded) and wire the frontend to it. |
| H16 | Workflow | workflow-completeness | `frontend/src/lib/api/team.ts:254-280` | BR-081 (role-dependent, Admin-configurable utilization targets) has no backend surface at all — Settings → Capacity edits are mock-only and never influence the real workload computation. | Add a per-role capacity-config table + endpoint; have `workload_service` read from it. |
| H17 | UX / Quality | ux-interaction, consistency | `frontend/src/components/settings/export-settings-view.tsx:24-47` | Every Settings → Export button downloads a CSV of only headers + placeholder `—` rows (self-documented as mock) but shows the same success toast as a real export — a user cannot tell it's fake. | Wire the real export endpoint, or clearly label the action as preview/sample until connected. |
| H18 | Quality / Workflow | data-integrity, workflow-edge-case | `project_service.py::add_member`, `task_service.py::add_dependency`, `opportunity_service.py::create_stage`, `proposal_service.py::create_proposal`, `invitation_service.py::accept_invitation`, `user_service.py::create_admin` | Classic check-then-insert races on unique constraints (project members, task deps, pipeline stage codes, proposal references, invite-accept/admin-bootstrap emails) degrade to unhandled 500s instead of clean 409s under concurrency — the DB stops corruption but the user sees a broken-looking error. Only `time_service.start_timer` does this correctly. | Apply the `start_timer` pattern (catch `IntegrityError` → domain 409) to all six paths, or add a global unique-violation (`sqlstate 23505`) → 409 mapper as a backstop. |
| H19 | Workflow | workflow-edge-case | `backend/app/services/phase_service.py::_assert_phase_completable:204-211` | A phase with **zero** non-archived tasks satisfies `total==done` vacuously (`0>0` is false) — "Concluir fase" succeeds instantly with no work ever recorded, undermining the r2 "no waiver" resolution (C2). | Require `total > 0` in addition to `total==done`. |
| H20 | Quality | dead-code, consistency | `frontend/.verify.mjs`, `frontend/.verify2.mjs` | Two unused, untracked ad-hoc Playwright verification scripts left in the repo root, referenced by neither package.json nor CI. Flagged independently by dead-code-hunter and consistency-auditor. | Delete both; if verification scripts are still needed, put them under `frontend/tests/` or `frontend/scripts/`. |
| H21 | Quality | missing-impl | `backend/app/services/user_service.py:117` | TODO: time entries are ended via a direct `_now()` call instead of routing through a time service for consistent rounding. | Implement the time-service abstraction and route all time-entry closures through it. |

---

## Health Scorecards

### Quality

| Area | Score | Details |
|------|-------|---------|
| Dead Code | 8/10 | 11 findings, all cosmetic (unused exports, 2 stray verify scripts); 0 critical, backend fully clean. |
| Missing Impl | 4/10 | 14 findings incl. 4 CRITICAL (email stub, upload validation, no frontend deploy config, no CI/CD) — real ship-blockers. |
| Data Integrity | 6/10 | 8 findings (post-dedup 5 standalone + 3 merged into Workflow), 0 critical standalone but a genuine race-condition class (check-then-insert) and a CASCADE/RESTRICT schema mismatch on soft-delete parents. |
| Security | 4/10 | 10 findings incl. 2 CRITICAL (financial-data leak via `ProjectResponse`, upload validation) against an otherwise strong baseline (no SQLi/XSS, solid JWT/cookie handling, correct 404-not-403 discipline). |
| Consistency | 6/10 | 14 findings, 0 critical but 4 HIGH incl. a real financial-calc bug (inflated margin) from duplicated report logic, plus a god-service. Architecture itself (layering, error envelope, permissions) is well-executed. |
| SaaS Pages | 6/10 | 49/~48 spec pages present, 31 error boundaries, 30 loading states — but logout doesn't revoke sessions (2 CRITICAL) and company edit page is missing. |

### UX

| Area | Score | Details |
|------|-------|---------|
| Navigation Flows | 10/10 | 0 broken links across 111 targets, 49 pages, 0 dead ends — every critical journey chains end-to-end. |
| Interactions | 7/10 | 1 CRITICAL (proposal PDF stub) plus a fake-success export button and an inconsistent timer-switch confirmation; drag-and-drop and most dialogs verified genuinely wired. |
| UI States | 9/10 | 96%+ loading/error boundary coverage, 100% mutation feedback, 100% destructive-action confirmation *except* the catalog-archive CRITICAL caught by ux-consistency, not ux-state. Only 2 LOW gaps found directly. |
| UX Consistency | 5/10 | 1 CRITICAL (catalog archive) + 4 HIGH (missing Contact CRUD, duplicated company-create, no dialog/page convention, missing Edit for Opportunity/Proposal) — CRUD-pattern consistency is the weakest UX area. |

### Workflow

| Metric | Value |
|--------|-------|
| Features in spec (F1-F20) | 20 |
| Fully implemented | 6 (F2, F8, F16, F17, F18, F19) |
| Partially implemented | 14 (2 of which — F9 Templates, F20 Settings — are CRITICAL-grade partials) |
| Not implemented (whole feature) | 0 (but Meeting entity and Template phase/task editor are functionally dead for real users) |
| Critical flows (of 25) | 15 complete / 10 partial / 0 missing |
| Business rules examined (workflow-logic's scoped BR-00x list) | 42 |
| Rules enforced | 40 (95%) |
| Rules partially enforced | 0 |
| Rules not enforced | 2 (both BR-035, merged into finding C9) |
| Additional rules broken only under concurrency (workflow-edge-case, not in the 42-rule count) | 4 (BR-005, BR-013, won→project uniqueness, cancel-grant) |
| Edge cases unhandled | 11 (4 CRITICAL, 2 HIGH, 4 MEDIUM, 1 LOW) |

### Overall

**6/10** — A well-architected, mostly-enforced backend (95% of checked business rules hold up under direct inspection, navigation is flawless) undermined by concurrency races that can corrupt core state (zero admins, duplicate projects, illegal state transitions), one real financial-data leak, and a cluster of features — proposal PDFs, project templates, task checklist/archive, settings export/roles — that look finished in the UI but silently don't persist. None of these are architectural rewrites; all are scoped, fixable gaps.

---

## Medium Findings

| # | Domain | Category | File | Description |
|---|--------|----------|------|-------------|
| M1 | Quality | data-integrity | `backend/app/models/task.py`, `project.py`, `finance.py` | `ON DELETE CASCADE` from tasks/phases/milestones/payment_milestones/costs to `projects` contradicts the soft-delete-only (BR-060) philosophy — latent mass-data-loss risk if a hard delete ever fires. Change to `RESTRICT`. |
| M2 | Quality | data-integrity | `backend/app/api/routes/attachments.py:50-87` | `Attachment` row committed before the client's presigned upload completes — a failed/abandoned upload leaves a permanent orphan row with no reconciliation job. |
| M3 | Quality | consistency | `crm-format.ts:19`, `pipeline-format.ts:27`, `proposal-format.ts:51`, `task-meta.tsx:48`, `project-format.ts:15` | `initials(name)` copy-pasted into 4 files, reimplemented differently in a 5th — consolidate into `lib/utils.ts`. |
| M4 | Quality | consistency | `reports-format.ts:14`, `time-format.ts:16` | Two `formatHours()` functions with **incompatible unit semantics** (hours vs. minutes) and identical signatures — a wrong import silently produces a 60x-off value. |
| M5 | Quality | consistency | `financeiro-tab.tsx`, `comercial-reports.tsx`, etc. | Inconsistent pt-PT vs. English component/file naming within the same directories — cosmetic but a maintenance foot-gun. |
| M6 | Quality | consistency | `frontend/src/messages/en.json` (multiple) | Toast/feedback i18n keys use 4 different naming conventions across features — standardize on one going forward. |
| M7 | Quality | consistency | `app/api/auth/login/route.ts:21,52`, `refresh/route.ts:21` | Next.js BFF error envelopes use hardcoded **English** messages in an otherwise pt-PT-canonical error path. |
| M8 | Quality | consistency | `frontend/src/components/conversion/convert-wizard.tsx` | 1042-line file — the largest on the frontend — should split each wizard step into its own file. |
| M9 | Quality | consistency | `backend/app/api/routes/attachments.py:116-133` | `list_attachments` is the only route in the backend issuing a raw `db.execute` instead of delegating to a service — minor layering inconsistency. |
| M10 | Quality | dead-code | `frontend/src/lib/api/proposals-types.ts:115-132` | Unused exported type guards `isTerminal()`/`canSend()` — safe to remove. |
| M11 | UX | ux-consistency | `archive-company-dialog.tsx`, `reason-dialog.tsx`, `lost-dialog.tsx` | Each re-implements the confirm-dialog layout from scratch instead of composing the shared `ConfirmDialog`'s documented `children` extension point — exactly how confirmation-copy drift (see C7) happens over time. |
| M12 | UX | ux-consistency | `finance-format.ts:28-32` vs `crm-format.ts`, `time-format.ts` | `formatDate` ignores locale (always `dd/mm/yyyy`) while sibling `formatDateTime`/`formatDateShort` correctly localize — an English-locale user sees contradictory day/month ordering on the same page. |
| M13 | UX | ux-interaction | `frontend/src/components/catalog/catalog-detail-view.tsx:69-77` | Catalog "Restore" has no success toast and no error handling, unlike the adjacent "Archive" — failures are silently swallowed. |
| M14 | UX | ux-interaction | `frontend/src/components/shell/quick-create.tsx:27-33` | Global Quick Create menu implies immediate creation, but only "Company" actually opens a create form — the rest just navigate to a list/board. |
| M15 | Workflow | workflow-completeness | `frontend/src/lib/api/settings.ts` (multiple) | 5 Settings sub-areas (org profile, org notification prefs, priority colors, unified Archive, export-dataset catalog) are entirely frontend-mock with `INTEGRATION-GAP` comments — appear to save, persist nothing. |
| M16 | Workflow | workflow-completeness | `frontend/src/lib/api/time.ts:260-279,365-369` | Time-entry rollups lack task/project/phase names from the backend response; `restoreEntry` (undo delete) is mock-only. |
| M17 | Workflow | workflow-completeness | `frontend/src/lib/api/crm.ts:907-1044` | Company/contact/opportunity relationship views show blank owner/last-interaction/próxima-ação/contracted-value fields — no enrichment join in the backend response. |
| M18 | Workflow | workflow-completeness | `frontend/src/lib/api/notifications.ts:218-224` | No mark-unread endpoint — "undo mark-all-read" is a documented no-op. |
| M19 | Workflow | workflow-completeness | `frontend/src/lib/api/finance.ts:360-435` | No restore endpoint for payment milestones/costs; cancellation/write-off reason (required by H3) is captured in the UI but dropped before the API call. |
| M20 | Workflow | workflow-edge-case | `backend/app/services/project_service.py::_assert_can_start:373-392` | `planning→active` payment-milestone guard (BR-037/H5) passes vacuously when **zero** milestones exist — a project can go live having never had financial tracking reviewed at all. |
| M21 | Workflow | workflow-edge-case | `backend/app/services/finance_service.py::update_milestone:182-213` | Editing a milestone's `amount` after a partial payment isn't re-validated against `received_amount`, risking `received_amount > amount`. |
| M22 | Workflow | workflow-edge-case | `backend/app/services/company_service.py::_assert_can_manage:168-177` | A company created with no `owner_id` (nullable, not defaulted) can never be archived by any Gestor — with a misleading error message. |
| M23 | Workflow | workflow-edge-case | `backend/app/services/project_service.py::_assert_can_archive:406-413` | Archiving a project silently force-stops another user's running timer with no notification to them. |

---

## Low Findings

| # | Domain | Category | File | Description |
|---|--------|----------|------|-------------|
| L1 | Quality | dead-code | `frontend/src/lib/api/dashboard.ts`, `team-types.ts`, `crm-types.ts`, `dashboard-types.ts`, `tasks-types.ts`, `case.ts`, `team.ts:305` | 7 unused exported utility functions (`assertDashboardAccess`, `deriveAvailability`, `isScopedCrm`, `isScopedDashboard`, `priorityRank`, `keysToCamel`/`keysToSnake`, `__resetTeamConfigs`) — safe to remove. |
| L2 | Quality | data-integrity | `backend/app/models/task.py:68-82` | `task_assignees` table + constraints exist but have no application write path (only seed data) — a fully-migrated but functionally dead schema object. |
| L3 | Quality | data-integrity | `backend/app/services/comment_service.py:172,212,240` | Explicit `db.commit()` calls inside the service layer break the single request-scoped transaction boundary every other service relies on. |
| L4 | Quality | data-integrity | `backend/app/services/task_service.py:516-571` | BR-045/047 no-cycle check has a narrow race window (two concurrent, individually-acyclic-but-jointly-cyclic `add_dependency` calls) since it isn't backed by a row/advisory lock. Acceptable given SQL can't express acyclicity; consider `pg_advisory_xact_lock`. |
| L5 | Quality | security | (repo-wide) | `npm audit`/`pip-audit` could not be run in this offline sandbox — a coverage gap, not a confirmed finding. Run in CI. |
| L6 | Quality | security, missing-impl | `backend/app/core/rate_limit.py` | Rate limiter is process-local/in-memory only — bypassed proportionally on any multi-instance/multi-worker deployment. |
| L7 | UX | ux-consistency | `frontend/src/messages/pt-PT.json:1181-1191` | `crm.status.company.*` uses Portuguese enum keys while sibling `crm.status.contact.*` uses English keys for the same active/inactive concept — not user-visible today, but a translation-maintenance risk. |
| L8 | UX | ux-interaction | `frontend/src/components/reports/report-section.tsx:71-80` | Disabled CSV export button has no tooltip explaining why (no data) — inconsistent with other disabled-button patterns in the app. |
| L9 | UX | ux-interaction | `frontend/src/components/projects/simple-tabs.tsx:176-229` | Project "Ficheiros" tab renders a hardcoded 2-file mock array for every non-planning project regardless of real content — self-labeled "coming soon" but could mislead a user about their actual files. |
| L10 | Workflow | workflow-completeness | `frontend/src/lib/api/crm.ts:1171-1173,1376` | Company detail Files/collaboration composite falls back to seeded mock activity for companies outside the demo dataset — cosmetic, not a missing feature (real attachments/comments clients exist and are used elsewhere). |
| L11 | Workflow | workflow-completeness | `frontend/src/lib/api/tasks.ts:840-853` | Kanban drag-reorder position and task "duplicate" are UI-only, reverting on reload. |
| L12 | Workflow | workflow-edge-case | `backend/app/services/time_service.py::update_entry:205-244` | BR-044 interval validation is skipped when only `started_at` is edited on a still-running timer (blast radius limited — `stop_timer` clamps the result). |
| L13 | UX | ux-state | `frontend/src/components/catalog/catalog-form-dialog.tsx` | Form submit errors handled by parent with no inline feedback in the dialog itself. |
| L14 | UX | ux-state | `frontend/src/components/dashboard/dashboard-view.tsx:24` | Dashboard uses one generic loading state rather than per-stat-tile skeletons. |
| L15 | Workflow | workflow-logic | `backend/app/services/opportunity_service.py:389-392` | Related to C9: silently defaulting `contracted_value` to `opportunity.estimated_value` on a verbal close partially defeats BR-035/C1's intent of forcing deliberate manual entry, even where the 422 (once added) wouldn't technically fire. Consider leaving it `None` instead of defaulting. |

---

## Fix Priority Roadmap

### Immediate (CRITICAL — fix before next deploy)

1. C1 — Redact financial fields from `ProjectResponse` for non-finance roles (BR-008). Effort: S.
2. C15/C16/C14 — Add row locks / unique constraints for the three concurrency races: last-Admin deactivation, won/lost, duplicate-project-from-opportunity. Effort: M.
3. C17 — Gate project cancellation behind a grant flag per the permission matrix. Effort: S.
4. C2 — Add upload MIME allowlist + size cap. Effort: S.
5. C3 — Wire logout to actually revoke sessions. Effort: S.
6. C7 — Add confirmation to catalog archive. Effort: S.
7. C8 — Fix proposal PDF download resolution (or gate the feature off). Effort: S/M.
8. C9 — Add the missing BR-035 backend 422 guard. Effort: S.
9. C6 — Wire real email delivery (Resend). Effort: M.
10. C4/C5 — Frontend deploy config + CI/CD pipelines. Effort: M.
11. C10/C11/C12/C13 — Either ship real backend persistence for templates, meetings, task checklist, and task archive, or clearly mark these UI surfaces "coming soon" so users don't lose data believing it saved. Effort: L (all four together).

### Short-term (HIGH — fix this sprint)

1. H1/H2 — Expand rate limiting; tighten CORS. Effort: S.
2. H4 — Unique constraint on accepted-proposal-per-opportunity. Effort: S.
3. H5/H6 — Point Reports at the backend endpoints; fix the margin calculation. Effort: M.
4. H7 — Consolidate `parseEuroToCents`. Effort: S.
5. H8 — Split `project_service.py`. Effort: M.
6. H9-H12 — CRM CRUD consistency pass (Contact CRUD, dedupe company create, pick one dialog-vs-page rule, decide Opportunity/Proposal edit story). Effort: M/L.
7. H13 — Add timer-switch confirmation to task side panel. Effort: S.
8. H14/H15/H16 — Wire pipeline-stage editing, role management, and capacity config to real backend endpoints. Effort: M.
9. H17 — Fix or clearly label the fake Settings export. Effort: S.
10. H18 — Apply the `IntegrityError→409` pattern across the 6 identified check-then-insert races. Effort: M.
11. H19 — Require `total>0` in phase-completion guard. Effort: S.
12. H20/H21 — Delete stray verify scripts; route time-entry closure through the time service. Effort: S.

### Backlog (MEDIUM + LOW)

- **Data model hardening** (M1, M2, L2, L3, L4): CASCADE→RESTRICT on soft-delete children, attachment-orphan reconciliation, drop or wire `task_assignees`, fix comment-service transaction boundary, advisory lock for dependency-cycle check. Effort: M.
- **Frontend format/util consolidation** (M3, M4, H7 follow-on): merge `initials()`, disambiguate the two `formatHours()`, one `currency.ts`. Effort: S.
- **i18n/naming cleanup** (M5, M6, M7, L7): standardize toast-key convention, translate BFF error strings, rename pt-PT-named component files, align `crm.status.*` enum key casing. Effort: M.
- **Settings/backend-integration gaps** (M15-M19): wire the remaining 5 mock Settings sub-areas, time-rollup joins, CRM enrichment fields, notification mark-unread, payment-milestone restore + cancellation reason. Effort: L.
- **Workflow edge-case hardening** (M20-M23, L12): require ≥1 milestone before activation, re-validate milestone amount vs. received, default company `owner_id`, notify on forced timer-stop, validate `started_at` on open entries. Effort: M.
- **UX polish** (M11-M14, L8, L9, L13, L14): refactor 3 hand-rolled confirm dialogs onto the shared component, fix `formatDate` locale-awareness, catalog restore feedback, Quick Create honesty, disabled-button tooltips, mock Files-tab labeling, dialog inline errors, dashboard stat-tile skeletons. Effort: M.
- **Dead-code cleanup** (L1, M10): remove ~9 unused exported functions. Effort: S.
- **Known, intentional, not itemized further**: backend still uses legacy "Aurea" naming across ~45 files while the frontend was rebranded to "LeiriTech" this session — tracked separately, not a code-quality defect.

---

## Appendix — Per-Category Audit Files

**Quality**
- [AUDIT_DEAD_CODE.md](./AUDIT_DEAD_CODE.md)
- [AUDIT_MISSING_IMPL.md](./AUDIT_MISSING_IMPL.md)
- [AUDIT_DATA_INTEGRITY.md](./AUDIT_DATA_INTEGRITY.md)
- [AUDIT_SECURITY.md](./AUDIT_SECURITY.md)
- [AUDIT_CONSISTENCY.md](./AUDIT_CONSISTENCY.md)
- [AUDIT_SAAS_PAGES.md](./AUDIT_SAAS_PAGES.md)

**UX**
- [AUDIT_UX_FLOWS.md](./AUDIT_UX_FLOWS.md)
- [AUDIT_UX_INTERACTIONS.md](./AUDIT_UX_INTERACTIONS.md)
- [AUDIT_UX_STATES.md](./AUDIT_UX_STATES.md)
- [AUDIT_UX_CONSISTENCY.md](./AUDIT_UX_CONSISTENCY.md)

**Workflow**
- [AUDIT_WORKFLOW_COMPLETENESS.md](./AUDIT_WORKFLOW_COMPLETENESS.md)
- [AUDIT_WORKFLOW_LOGIC.md](./AUDIT_WORKFLOW_LOGIC.md)
- [AUDIT_WORKFLOW_EDGE_CASES.md](./AUDIT_WORKFLOW_EDGE_CASES.md)
