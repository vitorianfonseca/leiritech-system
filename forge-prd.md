# Product Requirements Document: Aurea System

**Generated**: 2026-07-16
**Domain research**: [DOMAIN_RESEARCH.md](./DOMAIN_RESEARCH.md)
**Workflow specification**: [WORKFLOW_SPEC.md](./WORKFLOW_SPEC.md) (revision r2)
**Validation report**: [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md)
**Source context**: [forge-context.md](./forge-context.md)

---

## 1. Product Overview

**App name**: Aurea System
**Tagline**: *O sistema operativo interno da Aurea.*

**Problem statement**: Aurea, a software development company, needs a single internal
operating system to run its full commercial and delivery lifecycle — from first client
contact through opportunity, proposal, won deal, project execution, time tracking, and
payment — without the bloat and duplicate data entry of ClickUp/Notion/Monday/Jira/
Salesforce. Information should never be entered twice; when an opportunity is won, a
project is created with commercial data already filled in.

**Industry domain**: Internal **Professional Services Automation (PSA)** for a software
house. This is a private, invite-only, single-company tool — explicitly **not** a SaaS
product (no multi-tenancy, plans, billing of users, or public signup). The closest
functional analogue is Productive.io (resourcing/utilization/time/profitability core with
a deliberately lean CRM); Aurea's narrow scope mirrors PSA vendors that separate delivery
operations from a distinct accounting system.

**Success metrics**:
- Zero duplicate data entry across the won→project handoff (the core differentiator).
- Every open opportunity carries a próxima ação (measurable via the Atenção panel count → 0).
- Project health is human-confirmed daily; at-risk projects surface before deadlines slip.
- Time is logged same-day; single active timer per user; billable vs non-billable split visible.
- Payment milestones and margin are tracked live per project, visible only to authorized roles.

**Key industry standards / boundaries that apply**:
- **Portugal SAF-T / certified invoicing (hard scope boundary)**: any *legal* invoice in
  Portugal must be issued by AT-certified software (non-compliant software carries fines of
  €3,000–€18,750). Aurea therefore **never** issues an invoice, invoice number, VAT
  breakdown, ATCUD, or QR code. `payment_milestones` are strictly **internal tracking /
  forecasting**; the real fiscal invoice lives in Aurea's external certified accounting
  software. Enforced by BR-070..BR-073.
- **GDPR** (EU/Portugal): data-minimisation and storage-limitation apply to stored
  contact/company personal data and internal time/workload data (BR-063, BR-064).
- No regulatory certification is required for the tool itself (it is internal, not a
  medical/financial system of record).

---

## 2. User Personas

Three roles only; permissions are backend-enforced (BR-001) and defined by the single
authoritative matrix in §9. There are **no** per-project or custom permissions.

### 2.1 Administrador (Administrator)
- **Goals**: Govern the whole operation; keep the business healthy and staffed.
- **Industry-standard responsibilities**: member management, system configuration,
  full financial visibility, pipeline/template governance, resource oversight.
- **Key actions**: invite/deactivate members, manage roles, configure pipeline stages &
  probabilities, manage templates, set role utilization targets & internal cost rates,
  view/override all project health, view all financials & reports, grant payment/invite rights.
- **Pain points solved**: no single place to see at-risk projects, overdue payments, and
  over-allocated people at once → solved by the Dashboard "Atenção necessária" panel.
- **Permission level**: full (✅ across the matrix).

### 2.2 Gestor (Manager)
- **Goals**: Win deals and deliver projects on time and on margin.
- **Industry-standard responsibilities**: own the commercial pipeline and delivery
  management for their accounts/projects.
- **Key actions**: manage CRM, run the pipeline (create/move/win/lose opportunities),
  create/send/decide proposals, convert won→project, manage phases/tasks/milestones,
  approve tasks, publish project health, manage own project members and workload; manage
  payments and invites **only with an explicit per-user grant** (BR-003).
- **Pain points solved**: re-entering commercial data into a new project → solved by the
  won→project spin-up (BR-035); losing track of next actions → enforced by BR-010.
- **Permission level**: broad within own scope (👤 own; 🔒 grant for financial/invites).

### 2.3 Membro (Member)
- **Goals**: Execute delivery work with minimal admin overhead.
- **Industry-standard responsibilities**: individual contributor on assigned projects.
- **Key actions**: see only own projects/clients (BR-002), update own tasks up to
  `em revisão`, comment/@mention, attach files, log time (single active timer — BR-040),
  see own workload; update own profile/preferences.
- **Pain points solved**: unclear daily priorities → solved by the "O meu trabalho" hub with
  a contextual greeting drawn from real data.
- **Permission level**: own/assigned scope only (👤); no financial visibility (BR-008);
  cannot approve tasks (C3).

---

## 3. Domain Context

**Category**: PSA / agency-operations "quote-to-cash" lifecycle
(opportunity → proposal → project → delivery → payment), minus invoicing/CPQ/client-portal.

**Terminology glossary** (English key · pt-PT label):
- *Pipeline stage* · etapa — buyer-progress step, not rep activity.
- *Opportunity* · oportunidade — a potential deal in the pipeline.
- *Win probability* · probabilidade — per-stage attribute, never a transition gate.
- *Proposal* · proposta — metadata + PDF; not a document editor.
- *Project health (RAG)* · saúde — Red/Amber/Green; auto-suggested, human-confirmed.
- *Phase* · fase; *Milestone* · marco (delivery) vs *payment milestone* · marco de pagamento.
- *Utilization* · utilização — billable ÷ available hours, vs role target.
- *Capacity / availability* · capacidade / disponibilidade — disponível/equilibrado/sobrecarregado.
- *Margin* · margem — contracted − logged-hours cost − other project costs.
- *Billable* · faturável — set at time-entry, not backfilled.

**How competing products handle the key workflows** (from DOMAIN_RESEARCH):
- **Pipeline**: mature PSAs encode buyer progress and tune win-probability from history
  (not rep-activity stages). Aurea follows this (BR-012, BR-020).
- **Won→project**: Scoro/Productive carry commercial data into delivery to avoid re-entry;
  Aurea makes this the core differentiator with a graceful manual fallback for verbal closes.
- **Health**: best practice is *auto-suggest, human-confirm* — Aurea splits `suggested_health`
  (daily cron) from `published_health` (human) so automation never publishes (BR-030).
- **Time**: single active timer is the industry-correct UX (multi-timer is a data-integrity
  anti-pattern) — enforced at DB level (BR-040).
- **Utilization**: role-dependent targets (engineers ~75–80%, managers ~35–50%), never a flat %.

**Design decisions & rationale** (full list in WORKFLOW_SPEC §7):
- The "12 fixed automations" were never enumerated in the brief; the canonical set is defined
  in §6.1 of the spec and kept non-configurable (Non-Goal).
- `invoiced` payment-milestone state means "external certified system issued the invoice; we
  recorded a reference" — never Aurea generating a fiscal document (SAF-T boundary).
- Meeting `no_show` state added as a distinct commercial outcome for pipeline hygiene.

**Common pitfalls to avoid** (from DOMAIN_RESEARCH): rep-activity pipeline stages, duplicate
entry at won→project, flat utilization targets, unreviewed auto health, vague payment
milestones without completion criteria, delayed time logging, multi-timer, hidden blockers,
invoice/payment-milestone conflation, over-building CRM/quoting, indefinite stale-contact retention.

---

## 4. Workflow Specifications

The authoritative state machines, business rules, permission matrix, journeys, cross-workflow
dependencies, and notification map live in **[WORKFLOW_SPEC.md](./WORKFLOW_SPEC.md)** (r2,
validated to zero critical issues). Summary of the major workflows below; each references its
governing rules.

### 4.1 Opportunity pipeline (WORKFLOW_SPEC §1.1)
- **States**: new_contact → qualification → meeting_scheduled → proposal_drafting →
  proposal_sent → negotiation; terminal: won / lost.
- **Key rules**: movement between any active stages allowed (deals regress); every open
  opportunity needs a `next_action` (BR-010); `lost` requires `lost_reason` (BR-011); won is
  committed and cannot revert (BR-013). Probability is an attribute (BR-020).
- **Edge cases**: won without a sent proposal → soft warning, allowed (verbal close).
  Won opp archivable only after its project is cancelled/archived (H1/BR-013).

### 4.2 Proposal (WORKFLOW_SPEC §1.2)
- **States**: draft → sent → viewed → accepted / rejected / expired.
- **Key rules**: cannot send without PDF + value + valid_until (BR-025); accepted/rejected
  are terminal (BR-026); auto-expire past validity (AUTO-04/BR-027); non-accepted proposals
  archivable, accepted ones are not (BR-028/H2).

### 4.3 Won → Project conversion (WORKFLOW_SPEC §5, BR-035..038) — **core differentiator**
- Pre-fills company, contacts, and (if an accepted proposal exists) scope/value/payment terms
  with zero re-entry (BR-035). **Verbal-close fallback**: no proposal → still pre-fills
  company/contacts, user manually enters contracted value (BR-035/C1).
- Payment milestones default from the proposal (or entered manually) and MUST be confirmed
  before `planning`→`active` (BR-037/H5). Company becomes "cliente ativo" (BR-038). Source
  opportunity/proposal remain permanently linked, read-only (BR-036).

### 4.4 Project + health (WORKFLOW_SPEC §1.3, §1.4)
- **Lifecycle**: planning → active → on_hold → completed / cancelled / archived.
- **Health (orthogonal RAG)**: `suggested_health` computed daily (AUTO-05); `published_health`
  human-only, override needs reason (BR-030/031).
- **Cascade (BR-053/C4)**: cancel/archive freezes child phases/tasks/milestones and stops
  timers; pause freezes forward transitions; complete requires all non-archived phases done.
- **Automation scope (BR-054/C4)**: project-linked crons run only for live
  (planning/active/on_hold) projects; AUTO-02 excepted for external reconciliation.

### 4.5 Phase & Task (WORKFLOW_SPEC §1.5, §1.6)
- **Phase**: not_started → in_progress → blocked → completed; completes when all non-archived
  tasks are `concluída` (BR-051, no waiver — C2); progress derived, not typed (BR-050).
- **Task**: todo → in_progress → in_review → blocked → done. Forward transitions require an
  active project (H4). Approval (in_review→done) is Gestor+/Admin only (C3); a Membro can only
  move up to `em revisão`. Dependency gating (BR-045), no cycles (BR-047).

### 4.6 Time tracking (WORKFLOW_SPEC Time rules, BR-040..044)
- Exactly one active timer per user (DB partial unique index — BR-040). Every entry attributed
  to a task/project (BR-041). Timers stop on project pause/close/task archive (BR-042).
  Billable set at entry (BR-043); manual entries validated (BR-044).

### 4.7 Payment milestone & margin (WORKFLOW_SPEC §1.7, BR-065..073) — **internal only**
- **States**: planned → invoiced → partially_paid → paid / overdue / cancelled.
  `partially_paid`→`cancelled` allowed for write-off (H3).
- Every milestone needs `completion_criteria` + confirmer (BR-071). No fiscal fields (BR-070).
  Margin = contracted − (Σ logged hours × internal rate) − Σ project_costs (BR-065/BR-069/H8).
  Financials invisible to Membro (BR-008).

### 4.8 Capacity / workload (WORKFLOW_SPEC BR-080..084)
- Net capacity uses role-dependent utilization targets (BR-081). Availability derived, not
  toggled: <70% disponível, 70–100% equilibrado, >100% sobrecarregado (BR-082). Over-allocation
  warns the assigning Gestor daily (AUTO-09/BR-084).

---

## 5. Feature Specifications

Priorities: **P0** = required for MVP critical flows; **P1** = important; **P2** = nice-to-have.

### F1 — Authentication & Invitations (P0)
- **Description**: JWT auth (short access + refresh), login/logout, password reset (Resend),
  invite/accept, no public signup, first admin via seed/CLI.
- **User stories**: *As an Admin, I want to invite a member by email so that only authorized
  people access the system.* *As any user, I want to reset my password so that I can regain access.*
- **Acceptance criteria**: passwords hashed with Argon2; login rate-limited; deactivated users
  cannot authenticate (§1.11); deactivation revokes sessions + stops timers (BR-006); last admin
  cannot be deactivated (BR-005).
- **Related BRs**: BR-001, BR-005, BR-006, BR-007; invitation §1.10.

### F2 — Dashboard + "Atenção necessária" (P0)
- **Description**: management dashboard with actionable "needs attention" panel + useful charts
  (pipeline evolution, projects by state, tasks done vs overdue, contracted vs received, team load).
- **User stories**: *As an Admin/Gestor, I want a grouped list of things needing action so that
  nothing slips.* Each item links directly to its record.
- **Acceptance criteria**: panel shows critical overdue tasks, projects at-risk/stale, opportunities
  missing próxima ação, proposals awaiting/expiring, overloaded members, overdue payments, low-progress
  near deliveries, blocked tasks; each opens the source record; role-scoped visibility (BR-002/008).
- **Related BRs**: BR-010, BR-014, BR-046, BR-048, BR-068, BR-082; AUTO-01..12.

### F3 — "O meu trabalho" daily hub (P0)
- **Description**: member's daily work page with contextual greeting from real data.
- **User stories**: *As a Membro, I want my today/overdue/this-week tasks and messages in one
  place so that I can plan my day.*
- **Acceptance criteria**: shows today/overdue/this-week/no-date tasks, upcoming meetings,
  comments/mentions, blocked tasks, review requests, own projects, recent time entries; inline
  actions (complete/status/priority/deadline/timer/comment/side-panel); greeting uses real counts.
- **Related BRs**: BR-002, BR-040, BR-043, BR-046.

### F4 — CRM: Companies, Contacts, Interactions (P0)
- **Description**: company & contact records with full relationship view + interaction logging.
- **User stories**: *As a Gestor, I want a company page showing contacts, opportunities,
  proposals, projects, meetings, interactions, files, payments, and a timeline.*
- **Acceptance criteria**: list with search/filter/sort/pagination/quick-create/archive; company
  cannot be archived while it has a live project, open opp, or unconverted won opp (BR-062/H6);
  interactions link to company/contact/opportunity/project; company derived-flagged "cliente ativo"
  on win (BR-038).
- **Related BRs**: BR-002, BR-038, BR-060, BR-062, BR-063.

### F5 — Commercial pipeline (Kanban) (P0)
- **Description**: drag-and-drop opportunity board across buyer-progress stages, with won/lost flows.
- **User stories**: *As a Gestor, I want to drag an opportunity between stages so that the pipeline
  reflects reality.*
- **Acceptance criteria**: move requires/updates próxima ação (BR-010); lost needs reason (BR-011);
  won shows confirmation + subtle animation, marks company active, offers project conversion; stages
  admin-configurable (BR-012); probability admin-editable, not a gate (BR-020).
- **Related BRs**: BR-010, BR-011, BR-012, BR-013, BR-020.

### F6 — Proposals (P0)
- **Description**: proposal metadata + PDF upload lifecycle (no document editor).
- **User stories**: *As a Gestor, I want to record a proposal, attach the PDF, and track its status.*
- **Acceptance criteria**: send requires PDF + value + valid_until (BR-025); auto-expire (BR-027);
  accepted/rejected terminal (BR-026); archive rules per BR-028.
- **Related BRs**: BR-025, BR-026, BR-027, BR-028.

### F7 — Won → Project spin-up (P0) — **differentiator**
- **Description**: one-click project creation from a won opportunity reusing commercial data + a template.
- **User stories**: *As a Gestor, when I win a deal I want a project created with company, contacts,
  scope, value, payment terms, and template phases/tasks already filled in.*
- **Acceptance criteria**: zero re-entry when accepted proposal exists; manual contracted-value entry
  when none (BR-035/C1); payment milestones confirmed before activation (BR-037); links preserved
  read-only (BR-036); template phases/tasks/milestones instantiated; activity logged.
- **Related BRs**: BR-035, BR-036, BR-037, BR-038.

### F8 — Projects (list, detail, tabs) (P0)
- **Description**: project list + detail with tabs (Visão geral, Tarefas, Fases, Calendário,
  Ficheiros, Atividade, Financeiro), health, progress, budget/hours.
- **User stories**: *As a Gestor, I want a project overview with milestones, overdue/blocked tasks,
  phase progress, team, hours vs budget, and risks.*
- **Acceptance criteria**: lifecycle transitions guarded (§1.3); health publish needs reason on
  override (BR-031); cascade on cancel/archive (BR-053); financials tab hidden from Membro (BR-008).
- **Related BRs**: BR-030..032, BR-050..054, BR-065..069.

### F9 — Project templates (P1)
- **Description**: reusable templates (phases, tasks, order, durations, roles, estimates, milestones)
  with demo templates for website, app, consulting, monthly maintenance.
- **User stories**: *As an Admin, I want to define a canonical template so that new projects start
  consistently.*
- **Acceptance criteria**: template instantiation on spin-up; Admin creates canonical, Gestor uses.
- **Related BRs**: matrix §9 (templates), BR-035.

### F10 — Tasks (list / Kanban / calendar + side panel) (P0)
- **Description**: task management with three views, side-panel detail, checklist, blockers, comments.
- **User stories**: *As a member, I want to update a task inline and log time without leaving the board.*
- **Acceptance criteria**: transitions per §1.6; approval Gestor+/Admin only (C3); blocked visually
  distinct + in Atenção panel (BR-046); dependency gating (BR-045); no dependency cycles (BR-047);
  Membro creates/edits only on member projects (H7). No Gantt (Non-Goal).
- **Related BRs**: BR-045, BR-046, BR-047, BR-048, BR-049.

### F11 — Time tracking (P0)
- **Description**: single-timer + manual entries with billable flag and time rollups.
- **User stories**: *As a member, I want to start/stop a timer on a task and mark it billable.*
- **Acceptance criteria**: one active timer (BR-040); attributed to task (BR-041); timers stop on
  project pause/close (BR-042); manual entry validation (BR-044); forgotten-timer nudge (AUTO-12).
- **Related BRs**: BR-040, BR-041, BR-042, BR-043, BR-044.

### F12 — Calendar (aggregate) (P1)
- **Description**: read-only internal calendar aggregating tasks (deadlines), meetings, milestones,
  deliveries, commercial next-actions, expiring proposals, expected payments; month/week/agenda views.
- **User stories**: *As any user, I want one calendar of everything with a deadline so that I see
  what's coming.*
- **Acceptance criteria**: consistent event colors; clicking an event opens its record; no external
  calendar sync in MVP (architecture-ready).
- **Related BRs**: cross-cutting projection (WORKFLOW_SPEC §5, calendar row).

### F13 — Team & workload (P1)
- **Description**: team page + weekly workload heatmap with availability states.
- **User stories**: *As an Admin/Gestor, I want to see who is overloaded so that I can rebalance.*
- **Acceptance criteria**: availability derived (BR-082); role utilization targets configurable
  (BR-081); over-allocation warns (AUTO-09/BR-084); Membro sees own load only (BR-002).
- **Related BRs**: BR-080, BR-081, BR-082, BR-083, BR-084.

### F14 — Financial ops (P0, gated) (P0)
- **Description**: per-project contracted/received/pending, payment milestones, project_costs, margin;
  financial dashboard.
- **User stories**: *As an authorized user, I want to track payment milestones and live margin.*
- **Acceptance criteria**: no fiscal fields/terminology (BR-070/072); completion_criteria required
  (BR-071); margin live (BR-065); project_costs Admin/grant-only (BR-069); all financial data hidden
  from Membro (BR-008/066); overdue/due-soon notifications (AUTO-02/08).
- **Related BRs**: BR-008, BR-065..073.

### F15 — Notifications center (P0)
- **Description**: in-app notification center + the 12 fixed automations + event notifications.
- **User stories**: *As a user, I want grouped notifications that link to the record and respect my role.*
- **Acceptance criteria**: mark read/all-read/archive; grouping collapses same-entity events; role
  visibility respected (BR-002/008); preferences in `user_preferences`; the 12 automations per §6.1.
- **Related BRs**: BR-002, BR-008; AUTO-01..12.

### F16 — Comments, mentions, activity log (P0)
- **Description**: comments with @mentions/attachments on companies/opportunities/projects/tasks;
  append-only activity log.
- **Acceptance criteria**: mentions notify; comments editable/deletable with edited indicator;
  activity_logs append-only, non-editable by regular users (BR-064).
- **Related BRs**: BR-064.

### F17 — Files / attachments (P0)
- **Description**: attach files (Cloudflare R2) to companies/contacts/opportunities/proposals/
  projects/tasks/comments; metadata in Postgres; signed URLs.
- **Acceptance criteria**: upload/download/remove; validate size, extension, dangerous files;
  signed URLs; role-scoped access; abstraction layer to swap provider.
- **Related BRs**: BR-002 (visibility); NFR §10 security.

### F18 — Global search (Cmd/Ctrl+K) (P0)
- **Description**: command palette searching companies/contacts/opportunities/proposals/projects/
  tasks/notes/interactions, grouped by category, keyboard-navigable, with recent + create shortcuts.
- **Acceptance criteria**: executed via API; Postgres indexes; role-scoped results (BR-002).
- **Related BRs**: BR-002; NFR §10 performance.

### F19 — Reports + CSV export (P1)
- **Description**: commercial, projects, team, financial reports with date/client/project/member/state
  filters; CSV export; no custom report builder (Non-Goal).
- **Acceptance criteria**: reports use real data; financial reports gated (BR-008); conversion rate,
  win/loss value, avg time-to-close, utilization, margin per project, monthly evolution.
- **Related BRs**: BR-002, BR-008, BR-065, BR-083.

### F20 — Settings (P1)
- **Description**: Aurea data/logo, members, roles, pipeline stages, states, priorities, tags,
  templates, weekly capacity, internal costs, notifications, theme, archive, data export.
- **Acceptance criteria**: Admin-only config areas per matrix §9; no workspaces, no custom fields (Non-Goals).
- **Related BRs**: BR-001, BR-004, BR-012, BR-020, BR-081.

---

## 6. Data Model

All tables use `id` UUID PK, `created_at`, `updated_at`, `created_by`, and `archived_at` where
applicable. Soft-delete/archive only for companies, opportunities, projects, tasks, proposals
(BR-060). Enum/state fields store stable English keys; pt-PT labels are rendered client-side.
FKs, indexes, unique constraints, and transactions on critical operations are required.

| Entity | Key fields (beyond audit) | State field (valid values) | Notes / FKs |
|---|---|---|---|
| users | name, email(unique), password_hash(Argon2), role(admin/gestor/membro), payments_grant(bool), invites_grant(bool), weekly_capacity_hours, internal_cost_rate, availability_override | status: active/deactivated (§1.11) | BR-001, BR-005..008 |
| user_sessions | user_id FK, refresh_token_hash, expires_at, revoked_at | — | BR-006 |
| user_preferences | user_id FK, locale(default pt-PT), theme(light default), notification_channels(json) | — | i18n, theme |
| invitations | email, role, token_hash, expires_at, invited_by FK | status: pending/accepted/expired/revoked (§1.10) | BR-007 |
| companies | name, logo_url, sector, website, email, phone, address, owner_id FK, description, source, is_active_client(derived) | status: potential/active/inactive/partner + archived_at | BR-038, BR-060, BR-062 |
| contacts | company_id FK, name, photo_url, role_title, email, phone, owner_id FK, notes | status | BR-002 |
| pipeline_stages | name, code, color, order_index, win_probability | — | BR-012, BR-020 (admin) |
| opportunities | company_id FK, primary_contact_id FK, owner_id FK, title, estimated_value(EUR), probability, expected_close_date, source, description, next_action, next_action_due, lost_reason, lost_at | stage FK + won/lost + archived_at | BR-010..014 |
| proposals | opportunity_id FK, company_id FK, contact_id FK, reference, value(EUR), created_date, sent_date, valid_until, pdf_attachment_id FK, notes | status: draft/sent/viewed/accepted/rejected/expired + archived_at | BR-025..028 |
| interactions | type(call/meeting/email/message/note/followup), company_id?/contact_id?/opportunity_id?/project_id? FK, body, occurred_at, user_id FK | — | §1.9 |
| meetings | title, start_at, end_at, organizer_id FK, company_id?/opportunity_id?/project_id? FK, outcome_note | status: scheduled/held/cancelled/no_show (§1.9) | AUTO-10 |
| projects | company_id FK, opportunity_id FK(nullable), accepted_proposal_id FK(nullable), name, manager_id FK, description, start_date, deadline, contracted_value(EUR), hours_budget, internal_cost_rate | status: planning/active/on_hold/completed/cancelled/archived; suggested_health; published_health (healthy/attention/at_risk) | BR-030..032, 035..038, 053, 054, 065 |
| project_members | project_id FK, user_id FK, role_in_project | — | BR-002, H7 |
| project_phases | project_id FK, name, description, owner_id FK, start_date, deadline, order_index, progress(derived), final_milestone_id FK | status: not_started/in_progress/blocked/completed | BR-050, BR-051 |
| project_templates | name, description, expected_duration | — | F9 |
| template_phases | template_id FK, name, order_index, expected_duration | — | F9 |
| template_tasks | template_phase_id FK, title, order_index, role_responsible, estimate_hours | — | F9 |
| tasks | project_id FK, phase_id FK, title, description, primary_assignee_id FK, priority(low/normal/high/urgent), start_date, due_date, estimate_hours | status: todo/in_progress/in_review/blocked/done + archived_at | BR-045..051 |
| task_assignees | task_id FK, user_id FK (collaborators) | — | §1.6 |
| task_checklist_items | task_id FK, text, done(bool), order_index | — | F10 |
| task_dependencies | task_id FK, depends_on_task_id FK | — | BR-045, BR-047 (no cycles) |
| comments | entity_type, entity_id, author_id FK, body, edited_at | — | BR-064 (log) |
| mentions | comment_id FK, mentioned_user_id FK | — | §6.2 |
| attachments | entity_type, entity_id, filename, mime_type, size_bytes, r2_key, uploaded_by FK | — | F17, R2 |
| time_entries | user_id FK, task_id FK, started_at, ended_at(null=running), description, billable(bool) | — | BR-040 (partial unique idx where ended_at IS NULL), BR-041..044 |
| milestones | project_id FK, phase_id FK, name, description, due_date, owner_id FK | status: pending/achieved/missed/cancelled (§1.8) | BR-052 |
| payment_milestones | project_id FK, company_id FK, description, amount(EUR), expected_date, invoiced_date, paid_date, received_amount, completion_criteria, confirmer_id FK, external_invoice_ref, reference, notes | status: planned/invoiced/partially_paid/paid/overdue/cancelled (§1.7) | BR-065..073 (NO fiscal fields) |
| project_costs | project_id FK, description, amount(EUR), date, created_by FK | — | BR-069 (H8); Admin/grant only |
| notifications | user_id FK, type, entity_type, entity_id, body, read_at, archived_at, group_key | — | AUTO-01..12, §6.2 |
| activity_logs | entity_type, entity_id, actor_id FK, action, before/after(json), occurred_at | — | BR-064 (append-only) |
| tags | name, color | — | F20 |
| entity_tags | tag_id FK, entity_type, entity_id | — | F20 |

**Indexes**: FK columns; `opportunities(stage, owner_id)`, `tasks(project_id, status, due_date)`,
`time_entries(user_id) WHERE ended_at IS NULL` (partial unique — BR-040), `notifications(user_id, read_at)`,
full-text/`pg_trgm` indexes on searchable name/title/body columns for global search (F18).

---

## 7. API Design

REST, versioned under `/api/v1/`. Pagination, filtering, sorting, search on list endpoints.
Consistent error envelope; OpenAPI docs; every route protected and permission-checked (BR-001).

**Error format**:
```json
{ "error": { "code": "TASK_NOT_FOUND", "message": "A tarefa indicada não existe.", "details": {} } }
```

| Resource | Endpoints (representative) | Auth / BR enforced |
|---|---|---|
| auth | POST /auth/login, /auth/logout, /auth/refresh, /auth/password/forgot, /auth/password/reset, /auth/invitations/accept | public tokenized where noted; BR-006, BR-007 |
| users | GET/POST /users, PATCH /users/{id}, POST /users/{id}/deactivate, /users/{id}/activate, POST /users/invitations | Admin (invite 🔒 Gestor); BR-003..005 |
| companies | GET/POST /companies, GET/PATCH /companies/{id}, POST /companies/{id}/archive | BR-002, BR-060, BR-062 |
| contacts | GET/POST /contacts, GET/PATCH /contacts/{id} | BR-002 |
| pipeline-stages | GET /pipeline-stages, POST/PATCH (Admin) | BR-012, BR-020 |
| opportunities | GET/POST, GET/PATCH /{id}, POST /{id}/move, /{id}/win, /{id}/lose, /{id}/convert | BR-010..014, BR-035..038 |
| proposals | GET/POST, PATCH /{id}, POST /{id}/send, /{id}/accept, /{id}/reject | BR-025..028 |
| interactions / meetings | GET/POST, PATCH /{id}, meeting state actions | §1.9 |
| projects | GET/POST, GET/PATCH /{id}, POST /{id}/state, /{id}/health, /{id}/members | BR-030..032, 037, 053, 054 |
| phases / milestones | GET/POST, PATCH, POST /{id}/complete | BR-050..052 |
| tasks | GET/POST, GET/PATCH /{id}, POST /{id}/transition, /{id}/block, /{id}/dependencies | BR-045..049 (approval Gestor+) |
| time-entries | GET/POST, PATCH/DELETE /{id}, POST /timer/start, /timer/stop | BR-040..044 |
| payment-milestones | GET/POST, PATCH /{id}, POST /{id}/status | BR-065..073; 🔒 grant |
| project-costs | GET/POST, PATCH/DELETE /{id} | BR-069; 🔒 grant |
| notifications | GET, POST /{id}/read, /read-all, /{id}/archive | §6, BR-002/008 |
| reports | GET /reports/{commercial|projects|team|financial}?filters, GET .../export.csv | BR-002, BR-008 |
| search | GET /search?q= | BR-002; grouped results |
| attachments | POST /attachments (signed upload), GET /{id}/download-url, DELETE /{id} | F17 |

**Validation**: Pydantic 2 request/response models; 422 on validation; 403 on permission; 404 on
non-owned records for Membro (BR-002); 409 on illegal state transitions.

---

## 8. Frontend Pages & Components

Next.js 16 App Router, TypeScript, shadcn/ui deeply customized (Aurea design system), Tailwind,
TanStack Query, React Hook Form + Zod, Framer Motion, dnd-kit, Recharts. **Locale never in URL**
(`localePrefix: "never"`, resolved profile→cookie→Accept-Language→pt-PT). **Light mode default**;
dark mode designed separately. Every page has loading/skeleton/empty/error/no-results/success states
and destructive-action confirmation.

| Route | Purpose | Key components | Data | Permission |
|---|---|---|---|---|
| /login, /forgot-password, /reset-password, /invite/[token] | Auth flows | Auth forms | — | public |
| / (dashboard) | Management dashboard + Atenção panel + charts | AttentionPanel, StatTiles, Recharts | dashboard aggregate | all (scoped) |
| /my-work | Daily hub + contextual greeting | GreetingHeader, TaskGroups, TimerBar | own tasks/meetings/mentions | all |
| /crm/companies, /crm/companies/new, /crm/companies/[id], /.../[id]/edit | Company CRUD + relationship view | SmartTable, CompanyTabs, Timeline | companies, related | Gestor+ (Membro scoped) |
| /crm/contacts + [id] | Contact CRUD | SmartTable, ContactCard | contacts | Gestor+ |
| /crm/pipeline | Opportunity Kanban | dnd-kit Board, OpportunityCard, WonDialog, LostDialog | opportunities | Gestor+ |
| /crm/opportunities/[id] | Opportunity detail + activity | DetailPanel, ActivityFeed | opportunity | Gestor+ |
| /crm/proposals + [id] | Proposal list/detail + PDF | ProposalTable, PdfUpload | proposals | Gestor+ |
| /projects, /projects/new, /projects/[id] (tabs) | Project list + detail tabs | SmartTable, ProjectHeader, HealthBadge, PhaseBoard, FinancialTab | projects | Gestor+ (Membro member) |
| /projects/[id]/convert (spin-up) | Won→project conversion wizard | ConversionForm (prefilled) | opportunity+proposal+template | Gestor+ |
| /tasks | Tasks list/Kanban/calendar + side panel | ViewSwitcher, TaskBoard, TaskSidePanel, Checklist | tasks | all (scoped) |
| /calendar | Aggregate calendar | CalendarViews, EventChip | tasks/meetings/milestones/payments | all (scoped) |
| /team | Team + workload heatmap | WorkloadHeatmap, AvailabilityBadge | members, load | Admin/Gestor (own for Membro) |
| /finance | Financial dashboard + payment milestones | FinancialStatTiles, PaymentMilestoneTable, MarginCard | financial | Admin/Gestor(grant) |
| /reports | Reports + CSV export | ReportFilters, Charts, ExportButton | report aggregates | scoped |
| /settings/* | Config areas | SettingsNav, forms | settings | Admin (some Gestor) |
| /notifications | Notification center | NotificationList | notifications | all |
| /profile | Own profile/preferences | ProfileForm, ThemeToggle, LocaleSwitcher | own user | all |

**Shared components** (customized): SmartTable (search/filter/sort/paginate/column-select),
SearchableCombobox, CommandPalette (Cmd/Ctrl+K), QuickCreate menu, DetailSidePanel, ConfirmDialog,
EmptyState, Skeletons, Toast (with undo for archive/move/state-change/remove), Badges, Avatars,
ProgressBar, AnimatedCounter.

---

## 9. Authentication & Authorization

- **Auth method**: JWT — short-lived access token + secure refresh token; HttpOnly cookies where
  appropriate; Argon2 password hashing; login rate limiting; refresh rotation; no public signup;
  first admin via seed/CLI (BR-007).
- **Roles**: Administrador, Gestor, Membro (BR-001). Financial and invite capabilities for Gestor are
  gated by explicit per-user grant flags (BR-003) — this is NOT a custom-permission system.
- **Permission matrix**: the single authoritative model is **WORKFLOW_SPEC.md §3** (reproduced in
  summary in §2 of this PRD). Enforced backend-side on every request; frontend role never trusted.
- **Protected routes**: all app routes require an authenticated session; Membro requests are filtered
  to member/owned records (BR-002) — non-owned records return 404, not 403, to avoid enumeration.
- **Role hierarchy**: Admin ⊃ Gestor(+grants) ⊃ Membro (scope-limited), but enforced via explicit
  matrix checks, not inheritance shortcuts.

---

## 10. Non-Functional Requirements

- **Performance**: backend pagination on all lists; Postgres indexes (incl. trigram/full-text for
  search); TanStack Query caching + correct invalidation; server/client component separation; lazy
  loading; no full-list loads where pagination suffices; prevent duplicate in-flight requests.
- **Security**: backend validation is authoritative (frontend validation is UX only); role authorization
  on every endpoint; Argon2 hashing; secure tokens; login rate limiting; restricted CORS; content
  sanitization; upload validation (size/extension/dangerous files); ORM parameterization (no SQL
  injection); secrets via env vars only; horizontal-access prevention (BR-002); user-enumeration
  protection; audit logging of important actions (BR-064).
- **Accessibility**: WCAG AA minimum — keyboard navigation, visible focus states, adequate contrast,
  labels/aria, screen-reader support, comfortable hit areas, accessible error messages,
  `prefers-reduced-motion`, coherent tab order; never rely on color alone for state.
- **Regulatory / compliance**: SAF-T boundary — no fiscal document generation (BR-070..073); GDPR
  data-minimisation + storage-limitation hygiene for contacts/time data (BR-063); append-only audit
  trail (BR-064).
- **Responsiveness**: desktop-first, excellent on tablet/mobile; mobile prioritizes My Work, tasks,
  comments, timer, contacts, opportunities, notifications; tables adapt via priority columns / compact
  cards / controlled scroll.
- **Internationalization**: all UI strings via translation keys; canonical pt-PT; EUR currency;
  dd/mm/yyyy; locale never in URL.
- **Theming**: light default; dark mode designed separately with full token set and adapted charts.
- **Animations**: Framer Motion, mostly 150–300ms; never delaying frequent actions; respect reduced-motion.

---

## 11. Validation Issues & Trade-offs

The workflow validator found **22 issues (4 Critical, 8 High, 5 Medium, 5 Low)**. All 4 Critical and
8 High were resolved in WORKFLOW_SPEC r2 (verified on disk) before this PRD was written:

| ID | Issue | Resolution |
|---|---|---|
| C1 | Won→project assumed an accepted proposal; verbal closes had no data path | BR-035 manual contracted-value fallback |
| C2 | "Waived" completion referenced but never defined | Dropped; phase completes when all non-archived tasks done (BR-051) |
| C3 | Task self-approval contradicted matrix + implied per-project permissions (Non-Goal) | Carve-out deleted; approval Gestor+/Admin only (BR-049) |
| C4 | No cascade for cancelled/completed projects; crons fired on dead projects | BR-053 cascade + BR-054 automation scoping |
| H1 | Won opp couldn't archive after project cancel | Transition added (BR-013) |
| H2 | Rejected/expired proposals couldn't archive | BR-028 allows non-accepted archive |
| H3 | partially_paid couldn't be cancelled/written off | Transition added (§1.7) |
| H4 | Task lacked "project active" guard Phase had | Guard + pause parity added (BR-049) |
| H5 | planning→active omitted payment-milestone confirmation | Guard aligned with BR-037 |
| H6 | Company archive ignored won-not-converted opps | BR-062 extended |
| H7 | Membro task create/edit gated by undefined "if allowed" | Defined as project_member scope |
| H8 | Margin referenced "other costs" with no entity | Added `project_costs` (BR-069) |

**Known trade-offs (Medium/Low, deferred)**: optimistic-locking/concurrency for simultaneous edits is
minimal in MVP (last-write-wins with activity log); availability thresholds (<70/70–100/>100%) are a
reasonable default, flagged Admin-tunable; calendar is a read-only projection (no external sync); a
single English key tree is deferred (pt-PT only at launch).

---

## 12. GitHub Issue Breakdown

**phase:architecture**
- [ ] Monorepo scaffold (frontend/ + backend/) with UV, env config, `.env.example` — F0
- [ ] Storage abstraction layer (Cloudflare R2, swappable) — F17
- [ ] Email service abstraction (Resend, swappable) — F1
- [ ] Railway deploy config (health check, CORS, logs, migrations) + frontend deploy config

**phase:design**
- [ ] Aurea design system: OKLCH tokens (warm neutrals + subtle amber accent), typography, dark mode — §5/§10
- [ ] App shell: collapsible sidebar (state-persisted), top bar (search/command palette/quick-create/notifications/profile) — nav spec §11
- [ ] Customized shadcn primitives + shared components (SmartTable, CommandPalette, SidePanel, ConfirmDialog, EmptyState, Skeletons, Toast+undo)

**phase:database** (PostgreSQL + Alembic)
- [ ] Alembic setup + base; all 33 entities with FKs/indexes/constraints — §6, BR-060
- [ ] Partial unique index on time_entries (single active timer) — BR-040
- [ ] Trigram/full-text indexes for global search — F18
- [ ] Seed script: first admin (CLI) + realistic Aurea demo data — F0/§36

**phase:backend** (FastAPI)
- [ ] Auth: login/logout/refresh/password-reset/invite/accept, Argon2, rate limiting — F1, BR-005..007
- [ ] Permissions layer (matrix §9, backend-authoritative) + dependency guards — BR-001..004
- [ ] CRM: companies/contacts/interactions + archive guards — F4, BR-062
- [ ] Pipeline & opportunities: move/win/lose/convert + próxima-ação/lost-reason enforcement — F5/F7, BR-010..014, 035..038
- [ ] Proposals: lifecycle + PDF metadata + expiry cron — F6, BR-025..028, AUTO-04
- [ ] Projects: lifecycle + health (suggested/published) + cascade + template instantiation — F8/F9, BR-030..032, 053, 054
- [ ] Phases/milestones/tasks: transitions, dependency gating, approval rule — F10, BR-045..052
- [ ] Time tracking: timer start/stop, manual entries, validation — F11, BR-040..044
- [ ] Financial ops: payment milestones (no fiscal fields), project_costs, margin — F14, BR-065..073
- [ ] Workload/capacity computation + availability derivation — F13, BR-080..084
- [ ] Notifications service + the 12 automations (Railway Cron) + event notifications — F15, AUTO-01..12, §6.2
- [ ] Global search endpoint (grouped, scoped) — F18
- [ ] Reports aggregates + CSV export (financial gated) — F19

**phase:frontend** (Next.js)
- [ ] Auth pages + invite/reset flows — F1
- [ ] Dashboard + Atenção panel + charts — F2
- [ ] My Work hub + contextual greeting + timer bar — F3
- [ ] CRM: companies/contacts pages + relationship tabs + timeline — F4
- [ ] Pipeline Kanban (dnd-kit) + won/lost dialogs + won animation — F5
- [ ] Proposals list/detail + PDF upload — F6
- [ ] Won→project conversion wizard (prefilled, manual fallback) — F7
- [ ] Projects list + detail tabs + health + financial tab (gated) — F8
- [ ] Templates management — F9
- [ ] Tasks list/Kanban/calendar + side panel + checklist/blockers — F10
- [ ] Time tracking UI + rollups — F11
- [ ] Calendar aggregate views — F12
- [ ] Team + workload heatmap — F13
- [ ] Finance dashboard + payment milestones — F14
- [ ] Notifications center — F15
- [ ] Comments/mentions/activity feed — F16
- [ ] Reports + CSV export — F19
- [ ] Settings areas — F20
- [ ] Profile + theme toggle + locale switcher (no URL locale) — §8

**phase:integration**
- [ ] API client (typed) + TanStack Query hooks + cache invalidation — §10
- [ ] Env-var-driven backend URL wiring; CORS validation end-to-end
- [ ] Signed-URL upload/download flow (R2) — F17

**phase:security**
- [ ] Upload validation (size/extension/dangerous) + signed URLs — F17
- [ ] Rate limiting, CORS restriction, secret management audit — §10
- [ ] Horizontal-access + enumeration tests (Membro scoping) — BR-002
- [ ] Financial-data access restriction verification — BR-008

**phase:i18n**
- [ ] next-intl config `localePrefix:"never"`, pt-PT key tree, EUR/date formatting — §8/§10

**phase:testing**
- [ ] Backend: auth, permissions, opportunity win/lose, won→project conversion, task transitions, single-timer, payment milestones, margin calc, automations — §38
- [ ] Frontend: forms/validation, loading/error/empty states, navigation, drag-and-drop, permission-scoped UI, responsiveness — §38
- [ ] E2E: the 25 critical flows (WORKFLOW_SPEC §4.4) — §39

---

## Reference Documents
- [DOMAIN_RESEARCH.md](./DOMAIN_RESEARCH.md) — Industry research (PSA, SAF-T boundary, pitfalls)
- [WORKFLOW_SPEC.md](./WORKFLOW_SPEC.md) — 11 state machines, business rules, permission matrix, journeys, automations (r2)
- [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md) — Validation report (22 issues; 4C+8H resolved)
- [forge-context.md](./forge-context.md) — Original structured spec
