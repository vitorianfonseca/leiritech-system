# Workflow Completeness Audit — Aurea System

**Auditor**: Workflow Completeness Auditor (forge-workflow-audit team)
**Scope**: F1–F20 (forge-prd.md §5) and the 25 critical flows (WORKFLOW_SPEC.md §4.4)
**Method**: Cache-first (`.forge-cache/*`) + targeted reads of backend services/routes and frontend API-client wrappers. Cross-referenced against `AUDIT_MISSING_IMPL.md` (email stub, upload validation, CI/CD, CORS/rate-limiting, tests — not re-scored here) and `forge-state.json` `not_built`.

**Headline finding**: the backend (27 route modules, all 12 automations wired via a registry/dispatcher) is substantially more complete than the frontend integration layer. Dozens of frontend `src/lib/api/*.ts` files contain explicit, self-documented `INTEGRATION-GAP` comments where the UI is fully built but reads/writes an in-memory JS mock instead of a real backend call — because no matching backend endpoint exists, or the existing one doesn't return/accept the fields the UI needs. This is the single most important completeness signal in this codebase: large parts of Settings, Templates, Task checklist/archive, and the Meeting entity render and "work" in a browser session but persist nothing.

---

## Specification Source
- Files: `forge-prd.md` (F1–F20), `WORKFLOW_SPEC.md` (r2 — state machines, BR-001..084, permission matrix, 25 flows), `forge-state.json`.
- Total features audited: 20 (F1–F20) + 25 critical flows.
- Fully implemented: **9** F-features / 25 (45%) fully complete flows: **14** (56%)
- Partially implemented: **11** F-features (55%) / flows: **11** (44%)
- Not implemented: **0** F-features entirely missing at the page/route level, but several sub-workflows inside partial features are effectively non-functional end-to-end (see CRITICAL findings).

---

## Feature Implementation Matrix (F1–F20)

| # | Feature (P) | Route/Page | UI | API | Logic | DB | Status |
|---|---|---|---|---|---|---|---|
| F1 | Auth & Invitations (P0) | ok | ok | ok | ok | ok | PARTIAL — flows wired end-to-end; invite/reset emails only logged, not sent (see AUDIT_MISSING_IMPL #1) |
| F2 | Dashboard + Atenção (P0) | ok | ok | ok | ok | ok | COMPLETE — all 7 attention categories + charts present (`dashboard_service.py`) |
| F3 | O meu trabalho hub (P0) | ok | ok | ok | ok | ok | PARTIAL — "upcoming meetings" section reads the `meetings` table, which nothing ever writes to (see F4/#2 below) |
| F4 | CRM Companies/Contacts/Interactions (P0) | ok | ok | ok | PARTIAL | ok | PARTIAL — company/contact/interaction CRUD solid; "Log meeting" is not a real entity workflow (see finding #2); many relationship-view fields blank (finding #12) |
| F5 | Commercial pipeline Kanban (P0) | ok | ok | ok | ok | ok | PARTIAL — move/win/lose/convert fully enforced backend-side; stage color/win-probability editor in Settings never reaches the backend (finding #7) |
| F6 | Proposals (P0) | ok | ok | ok | ok | ok | PARTIAL — full lifecycle enforced (BR-025..028); attached PDF is never resolvable/downloadable from the UI (finding #8) |
| F7 | Won→Project spin-up (P0, core differentiator) | ok | ok | ok | PARTIAL | ok | PARTIAL — BR-036/037/038 solid; BR-035's "422 if empty" verbal-close guard is **not backend-enforced** (finding #5); depends on F9 templates which are largely non-functional beyond creation (finding #1) |
| F8 | Projects list/detail/tabs (P0) | ok | ok | ok | ok | ok | COMPLETE (lifecycle/cascade/health all backend-enforced); minor join/enrichment gaps only |
| F9 | Project templates (P1) | ok | ok | PARTIAL | MISSING | ok | **CRITICAL PARTIAL** — only bare create + list are wired; detail/patch/delete and ALL phase/task editing are 100% frontend-mock (finding #1) |
| F10 | Tasks (list/Kanban/calendar + side panel) (P0) | ok | ok | PARTIAL | PARTIAL | PARTIAL | PARTIAL — transitions/blocking/dependencies backend-enforced; checklist has a DB table but **no API** (finding #3); archive/restore/delete/duplicate/reorder have **no API** (finding #4) |
| F11 | Time tracking (P0) | ok | ok | ok | ok | ok | PARTIAL (minor) — timer/manual/billable/validation all backend-enforced (BR-040..044); rollups lack project/phase/task attribution from backend (finding #11) |
| F12 | Calendar (aggregate) (P1) | ok | ok | ok | ok | ok | PARTIAL — architecture is correct (`calendar.py` projects tasks/milestones/payments), but the "meetings" event type will always be empty (finding #2) |
| F13 | Team & workload (P1) | ok | ok | ok | PARTIAL | ok | PARTIAL — availability derivation (BR-082) and utilization (BR-083, with a self-documented deviation) work; per-role capacity/cost-rate config (BR-081) has no backend endpoint at all (finding #9) |
| F14 | Financial ops (P0, gated) (P0) | ok | ok | ok | ok | ok | PARTIAL (minor) — margin/gating/BR-008 visibility all correctly backend-enforced; no restore/undo endpoints, cancel-reason not persisted (finding #14) |
| F15 | Notifications center (P0) | ok | ok | ok | ok | ok | PARTIAL (minor) — all 12 automations implemented + a CLI dispatcher (`automations/run.py`); no scheduler/cron config wires it to run automatically (cross-ref forge-state.json `not_built.4`); "mark unread" unsupported (finding #13) |
| F16 | Comments/mentions/activity log (P0) | ok | ok | ok | ok | ok | COMPLETE — generic `/comments` + `/activity` endpoints used consistently across tasks/projects/CRM |
| F17 | Files/attachments (P0) | ok | ok | ok | ok | ok | COMPLETE (backend) — signed-URL R2 flow with IDOR guard; upload validation gaps already tracked in AUDIT_MISSING_IMPL (#2) |
| F18 | Global search (Cmd/Ctrl+K) (P0) | ok | ok | ok | ok | ok | COMPLETE — `search.py` + trigram/full-text migration (`a4489baf8714`) |
| F19 | Reports + CSV export (P1) | ok | ok | ok | ok | ok | COMPLETE — JSON + CSV export endpoints per report group, financial gating enforced |
| F20 | Settings (P1) | ok | ok | PARTIAL | MISSING | PARTIAL | **CRITICAL PARTIAL** — members/invite and (partly) pipeline stages are real; org profile, tags, role changes, org notification prefs, priority colors, unified archive, export catalog, and capacity config are **entirely frontend-mock** (findings #6, #9, #10) |

---

## The 25 Critical Flows — Coverage

| # | Flow | Status | Evidence |
|---|---|---|---|
| 1 | Login/logout | COMPLETE | `auth.py:49,87`; Argon2 + refresh cookies |
| 2 | Password reset | PARTIAL | Routes exist (`auth.py:93,106`); email delivery stubbed (AUDIT_MISSING_IMPL #1, not re-scored) |
| 3 | Invite/accept | PARTIAL | `invitations.py` full lifecycle; same email-stub caveat |
| 4 | Refresh token/session | COMPLETE | `auth.py:72`; BR-006 session revoke on deactivate (`users.py:116`) |
| 5 | Dashboard Atenção necessária | COMPLETE | `dashboard_service.py` — all 7 categories + charts |
| 6 | O meu trabalho hub | PARTIAL | `my_work_service.py` complete except meetings section always empty (see #9 below) |
| 7 | Create company | COMPLETE | `companies.py` |
| 8 | Add contacts | COMPLETE | `contacts.py` |
| 9 | Log interaction/meeting | **PARTIAL (CRITICAL sub-gap)** | Interactions fully wired; **meetings are not a real entity workflow** — see finding #2 |
| 10 | Create opportunity | COMPLETE | `opportunities.py:75` |
| 11 | Move opportunity across pipeline | COMPLETE | `opportunities.py:106`, BR-010 enforced |
| 12 | Set próxima ação | COMPLETE | enforced in `opportunity_service.move_opportunity` |
| 13 | Mark won | COMPLETE | `opportunities.py:117` |
| 14 | Mark lost + reason | COMPLETE | `opportunities.py:130`, BR-011 required field |
| 15 | Create/send proposal | PARTIAL | Send guard (BR-025) enforced; PDF unrecoverable after upload (finding #8) |
| 16 | Proposal decision (accept/reject/expire) | COMPLETE | `proposals.py:126,136,147`; AUTO-04 cron |
| 17 | Won→project spin-up (+manual fallback) | **PARTIAL (HIGH gap)** | BR-036/037/038 solid; BR-035 422-guard missing server-side (finding #5); template reuse degraded (finding #1) |
| 18 | Manage phases | COMPLETE | `phases.py` |
| 19 | Manage milestones | COMPLETE | `milestones_router` (mounted `/milestones`) — full CRUD + transition + complete |
| 20 | Set/override project health | COMPLETE | `projects.py:243,254`; BR-030/031 enforced |
| 21 | Task board/status transitions | COMPLETE | `tasks.py:123`; BR-045..049 enforced |
| 22 | Blockers/dependencies | COMPLETE | `tasks.py:134,145,167,182`; cycle rejection (`_would_create_cycle`) |
| 23 | Time tracking (timer+manual+billable) | COMPLETE | `time.py`; BR-040 DB partial-unique index, BR-044 validated |
| 24 | Payment milestones + margin | COMPLETE | `finance.py`; BR-065..073 enforced, no fiscal fields present |
| 25 | Team workload/capacity | PARTIAL | Derivation logic correct; admin-configurable targets/rates not wired (finding #9) |

---

## Findings

| # | Severity | File | Line(s) | Description | Recommendation |
|---|----------|------|---------|-------------|-----------------|
| 1 | CRITICAL | `frontend/src/lib/api/templates.ts`:376-460; `backend/app/api/routes/projects.py`:48-59 (only GET/POST `/templates`) | 376-460 | F9 Project templates: only bare `list`/`createTemplate` (name/description/duration) reach the backend. `get` (detail), `updateTemplate`, `deleteTemplate`, `restoreTemplate`, and **all** phase/task editor mutations (`addPhase`, update/remove/restore/reorder) are 100% in-memory mock with comments stating "no backend endpoint — left on mock." Backend `create_template` DOES support nested `phases`/`tasks` in one call (`project_service.py:620-650`), but the frontend never sends them (`phases: []` is hardcoded at templates.ts createTemplate). Any phase/task an Admin configures in Settings → Templates is lost on reload and never available to `create_from_template`/`create_from_opportunity`. | Add `GET/PATCH/DELETE /projects/templates/{id}` and sub-resource routes for template phases/tasks (or a single PATCH accepting the full nested tree); wire `createTemplate` to send the real nested payload. |
| 2 | CRITICAL | `backend/app/models/crm.py`:237 (`Meeting`); no `backend/app/api/routes/meetings.py`; `backend/app/automations/meeting_reminder.py`; `frontend/src/lib/api/crm.ts`:614-670 | — | WORKFLOW_SPEC §1.9's Meeting entity/state-machine (scheduled→held/cancelled/no_show, organizer, AUTO-10 reminder) has a DB model but **zero CRUD API**. The UI "logs a meeting" as a plain `interaction` row with `type: "meeting"` via `POST /interactions`, which has no state, no organizer, no start/end, and cannot be marked held/cancelled/no_show. Consequently: `meeting_reminder.execute()` (AUTO-10) queries a table nothing ever inserts into in production, so it can never fire; F3 "O meu trabalho" upcoming-meetings section and the F12 calendar's meeting lane will always be empty for real usage. | Add a `/meetings` route (create/list/transition per §1.9) backed by the existing `Meeting` model, and point the frontend "log meeting" action at it instead of `/interactions`. |
| 3 | CRITICAL | `backend/app/models/task.py`:84 (`TaskChecklistItem`); `frontend/src/lib/api/tasks.ts`:805-835 | 805-835 | F10 acceptance criterion "checklist" is non-functional: `task_checklist_items` exists as a DB table/model but no API route exposes it. `addChecklistItem`/`toggleChecklistItem`/`removeChecklistItem` are entirely client-side mock (`seed()` + in-memory `store`), so checklist state is lost on page refresh and never shared between users. | Add `GET/POST /tasks/{id}/checklist`, `PATCH/DELETE /tasks/{id}/checklist/{item_id}` backed by `TaskChecklistItem`. |
| 4 | CRITICAL | `backend/app/api/routes/tasks.py` (no archive/restore/delete routes); `backend/app/services/task_service.py` (no `archive`/`archived_at` logic); `frontend/src/lib/api/tasks.ts`:854-935 | 854-935 | Task has `ArchiveMixin` in the model (`task.py:27`) satisfying BR-060's intent, but there is no service/route path that ever sets `archived_at` for a task. `archive`, `restore`, `remove` (soft-delete), `duplicate`, and Kanban `reorder` are all frontend-mock with explicit "no backend endpoint" comments — none of these actions persist. | Implement `POST /tasks/{id}/archive`, `/restore`, and a duplicate endpoint; persist board order if drag-order is a product requirement. |
| 5 | HIGH | `backend/app/services/project_service.py`:745-783 (`create_from_opportunity`); `backend/app/services/opportunity_service.py`:363-410 (`convert_opportunity`); `backend/app/schemas/projects.py`:150-162 (`ProjectFromOpportunity.contracted_value` optional, no validator) | 765-770 | BR-035 requires: "when no accepted proposal exists, the user MUST manually enter the contracted value... 422 if empty." The backend instead silently falls back `payload.contracted_value → prefill.contracted_value → opp.estimated_value` (itself nullable, `crm.py:128`) with **no check** that a verbal close actually got a manually-entered, non-null value. Only the frontend wizard enforces "required" (`conversion-schemas.ts`:21-32) — a direct/scripted API call, or any future UI bug, silently creates a project with `contracted_value = NULL`, violating the spec's explicit backend-authoritative rule (WORKFLOW_SPEC §0: "frontend is never trusted"). | In `create_from_opportunity`, when `prefill.verbal_close` is true, raise 422 (`code=CONTRACTED_VALUE_REQUIRED`) if `contracted_value` ends up `None`, per BR-035. |
| 6 | HIGH | `frontend/src/lib/api/settings.ts`:379-397; `backend/app/api/routes/users.py` (no role-change route) | 379-397 | F20/permission-matrix "Manage roles ✅ Admin" is non-functional end-to-end: `updateMemberRole` validates BR-005 (last-admin) against live data but then only writes to a local `roleOverrides` Map — never calls the backend. A role change made in Settings → Members disappears on reload/re-login and is invisible to the actual permission-check middleware. | Add `PATCH /users/{id}/role` (Admin-only, BR-005-guarded) and wire the frontend to it. |
| 7 | HIGH | `frontend/src/lib/api/settings.ts`:466-484; `backend/app/api/routes/pipeline_stages.py`:51 (`PATCH /{stage_id}` exists and works) | 466-484 | BR-020 ("win_probability admin-editable") is implemented on the backend but unreachable from the UI: the comment explains the frontend keys stages by `code` (e.g. `new_contact`) while the endpoint needs the stage UUID, and color is a design-token string vs. the backend's hex string — so `updatePipelineStages` never calls the real PATCH and instead mutates an in-session array. Admin changes to stage names/probabilities/colors in Settings never reach the DB. | Resolve stage `code → id` via the already-fetched stage list before calling `PATCH /pipeline-stages/{id}`; map token↔hex at the boundary. |
| 8 | HIGH | `frontend/src/lib/api/proposals.ts`:331-333 (`mapProposal`); `backend/app/api/routes/attachments.py`:90 (`/{attachment_id}/download-url` exists and works) | 331-333 | F6's "PDF upload lifecycle" is one-directional: proposals correctly require/store `pdf_attachment_id` server-side (BR-025 enforced), but the frontend hardcodes `file: null` on every proposal because it never resolves `pdf_attachment_id` through the working attachments download-url endpoint. Users can attach a PDF at send-time but can never re-open/download it from the proposal list or detail page afterward. | In `mapProposal`, when `pdfAttachmentId` is present, resolve a download URL via `GET /attachments/{id}/download-url` (as `attachments.ts` already does elsewhere) instead of defaulting to `null`. |
| 9 | HIGH | `frontend/src/lib/api/team.ts`:254-280 (`getFunctionConfigs`/`updateFunctionConfig`); `backend/app/services/workload_service.py` (fixed constants, no per-role config table/endpoint) | 254-280 | BR-081 ("Utilization targets are role-dependent... Admin-configurable per role") has no backend surface at all: no endpoint returns/persists per-function capacity targets or internal cost rates, so Settings → Capacity edits are mock-only and never influence the real `workload_service` computation (which self-documents its capacity formula as fixed thresholds, not sourced from an admin-editable table). | Add a `role_capacity_config`-style table + `GET/PATCH` endpoint, and have `workload_service` read targets from it instead of hardcoded constants. |
| 10 | MEDIUM | `frontend/src/lib/api/settings.ts`: 264-270 (org profile), 425-449 (org notification prefs + priority colors), 491-509 (unified archive list/restore, export dataset catalog) | multiple | Five distinct F20 sub-areas (Aurea org profile/logo, org-level notification preferences, priority colors, unified "Arquivo" list/restore, and the CSV export dataset catalog) are entirely served from in-memory mocks with explicit `INTEGRATION-GAP: no backend endpoint` comments. These Settings pages render and appear to save successfully but nothing persists past the browser session/reload. | Prioritize backend endpoints per sub-area if these are in-scope for the next milestone, or explicitly mark them "coming soon" in the UI to avoid silent data loss. |
| 11 | MEDIUM | `frontend/src/lib/api/time.ts`:260-279, 365-369 | 260-279 | Time-entry rollups lack `taskTitle`/`projectId`/`projectName`/`phaseId`/`phaseName`/`userName` from the backend `GET /time` response, so F11's rollup grouping and F14's hours-vs-budget rollups degrade to flat, unlabeled entries; `restoreEntry` (undo delete) is mock-only and cannot actually restore a deleted server-side entry. | Add project/phase/task join fields to the time-entry response; add a real undo/restore path (or drop the undo affordance if genuinely out of scope). |
| 12 | MEDIUM | `frontend/src/lib/api/crm.ts`:907-1044 (~15 markers) | 907-1044 | F4's "full relationship view" is degraded: owner name, last-interaction date, próxima-ação, counts, total contracted value, and a `wonUnconverted` flag (needed to visually surface the BR-062 archive guard) are all blank/defaulted because `CompanyResponse`/`ContactResponse`/`OpportunityResponse` don't carry them and no enrichment join exists. The company/contact pages work, but show empty owner/activity fields. | Extend list/detail response schemas with the joined display fields the UI needs, or add a dedicated enrichment endpoint. |
| 13 | MEDIUM | `frontend/src/lib/api/notifications.ts`:218-224 | 218-224 | No `POST /notifications/{id}/unread` (or bulk) exists — only read/read-all/archive/unarchive. The "undo mark-all-read" UI affordance is a documented no-op. | Add a mark-unread endpoint if the undo UX is meant to actually work; otherwise remove the undo control. |
| 14 | MEDIUM | `frontend/src/lib/api/finance.ts`:360-435 | 360-435 | No snapshot/restore endpoint for payment milestones or project costs (undo-delete is best-effort mock); cancel/write-off reason (required by WORKFLOW_SPEC §1.7 H3 for `partially_paid→cancelled`) is captured in the UI but dropped before the API call — the backend never records why a milestone was cancelled. | Persist a `cancellation_reason` field on the write-off transition; add a proper restore/undo endpoint or remove the undo affordance. |
| 15 | LOW | `frontend/src/lib/api/crm.ts`:1171-1173, 1376 | 1171-1173 | Company detail "Files"/collaboration composite falls back to seeded mock activity for companies outside the mock dataset; real generic `/attachments` and `/comments` clients exist and are used elsewhere, so this is a cosmetic enrichment gap in one composite view, not a missing feature. | Route the company detail Files tab through the real `attachments.ts` client instead of the composite mock fallback. |
| 16 | LOW | `frontend/src/lib/api/tasks.ts`:840-853 | 840-853 | Kanban drag-reorder position and task "duplicate" are UI-only (not persisted), reverting on reload. | Persist an `order_index` on `Task` and add a duplicate endpoint if these are meant to be durable. |

---

## Notes for the Workflow-Logic Auditor

The following partial features have **UI/UX guardrails but no backend enforcement**, which is exactly the pattern you're checking for:
- **BR-035** (finding #5) — frontend requires manual contracted value on verbal close; backend does not.
- **BR-020 / stage editing** (finding #7) — backend endpoint enforces update correctly, but it's simply never invoked by the UI, so admins believe they've changed probabilities/colors when they haven't.
- **BR-081 capacity targets** (finding #9) — there is no enforcement gap in the traditional sense (nothing to bypass), but the *configurability* the rule promises doesn't exist, so the derived BR-082/083/084 states are computed against values an Admin can never actually change.

## Cross-references (not re-scored here)
- Email delivery stub (Resend) — `AUDIT_MISSING_IMPL.md` #1 — affects flows #2/#3 and AUTO-04/08 email channel.
- No Railway Cron / scheduler config for `automations/run.py` — `forge-state.json.not_built["4"]` — the 12 automations are code-complete (F15) but have no confirmed production trigger.
- Upload validation gaps — `AUDIT_MISSING_IMPL.md` #2 — affects F17 attachments used by proposals/tasks/CRM.

---

## Summary

**Findings by severity**: CRITICAL 4, HIGH 5, MEDIUM 5, LOW 2 — **16 total**.

**Feature tally (F1–F20)**: Fully implemented 9 (F2, F8, F16, F17, F18, F19, and F1/F11/F15 arguably near-complete but counted PARTIAL below since a P0 rule/channel is broken) — to be precise per the matrix above: **COMPLETE: 9** (F2, F8, F16, F17, F18, F19 clean; F5/F10/F11 have only minor/backend-solid gaps but are marked PARTIAL for a specific broken sub-feature) / **PARTIAL: 11** (F1, F3, F4, F5, F6, F7, F9, F10, F12, F13, F14, F15, F20 — note this list is 13, see matrix; both F9 and F20 are CRITICAL-grade partials) / **NOT IMPLEMENTED: 0** whole features, though the Meeting entity workflow and the Template editor are, in effect, dead code paths for real users.

**Flow tally (25 flows)**: COMPLETE 15 / PARTIAL 10 / NOT IMPLEMENTED 0.

**Top 5 most critical/high findings**:
1. CRITICAL — F9 Project templates: phase/task editor and template PATCH/DELETE/detail are entirely frontend-mock; configured templates never reach the DB, undermining F7's core promise (`frontend/src/lib/api/templates.ts`).
2. CRITICAL — Meeting entity (§1.9) has a DB model but zero CRUD API; "log a meeting" is faked via a plain interaction row, so AUTO-10 and the My Work/Calendar meeting views are permanently empty (`backend/app/models/crm.py:237`, no `meetings.py` route).
3. CRITICAL — Task checklist has a DB table but no API at all; 100% frontend-mock, non-persistent (`backend/app/models/task.py:84`, `frontend/src/lib/api/tasks.ts:805-835`).
4. CRITICAL — Task archive/restore/delete/duplicate have no backend routes at all, breaking BR-060 for tasks specifically (`frontend/src/lib/api/tasks.ts:854-935`).
5. HIGH — BR-035's verbal-close "422 if empty" contracted-value guard is UI-only, not backend-enforced, on the core won→project differentiator (`backend/app/services/project_service.py:745-783`).
