# Workflow Specification

**App**: Aurea System
**Based on**: forge-context.md + DOMAIN_RESEARCH.md
**Designed**: 2026-07-16
**Author**: Workflow Designer (forge-prd team)
**Revision**: r2 (2026-07-16) — resolves validator issues C1–C4, H1–H8; changes summarized in §7.

---

## 0. Reading Notes & Scope Guardrails

- **Enforcement layer convention**: `Backend` = FastAPI service/domain layer + DB constraints (authoritative). `Frontend` = UX affordance only (never the security boundary). Every security, state-transition, and financial rule is **backend-authoritative**; the frontend may mirror it for UX but is never trusted.
- **Compliance boundary (hard rule)**: `payment_milestones` are **internal tracking/forecasting only**. Aurea NEVER issues a legal invoice, invoice number, tax breakdown, ATCUD, or QR code. All UI/PDF copy uses "marco de pagamento" / "payment milestone", never "fatura/invoice". The real fiscal invoice lives in Aurea's external certified accounting software. This is a scope boundary, enforced as BR (see BR-070..BR-073).
- **Soft-delete only**: companies, opportunities, projects, tasks, proposals are **never hard-deleted** — only archived (`archived_at`). See BR-060..BR-064.
- **Locale**: pt-PT canonical. State labels below are shown in pt-PT (the DB stores stable English enum keys; UI renders translated labels). Enum keys are given in `code_format`.
- **Non-goals respected**: no configurable automations, no custom fields, no Gantt, no invoicing/accounting, no client portal, no chat, no AI, **no per-project / custom permissions** (the permission matrix in §3 is the single authoritative access model for all three roles). Nothing below introduces features outside forge-context.md MVP scope.

---

## 1. Entity Lifecycle State Machines

Every state machine lists **valid transitions** (with trigger + guard + role) AND **invalid transitions** (with reason + error message). DB enum key in parentheses.

### 1.1 Opportunity (pipeline)

The pipeline stages encode **buyer progress**, not rep activity (DOMAIN_RESEARCH Workflow 1). Stages are admin-configurable rows in `pipeline_stages`, but the canonical MVP set and their meaning are fixed below. `won` / `lost` are terminal outcome states, not draggable Kanban columns beyond the final commit.

**Stages (ordered, buyer-progress)**:
1. Novo contacto (`new_contact`)
2. Qualificação (`qualification`)
3. Reunião marcada (`meeting_scheduled`)
4. Proposta em preparação (`proposal_drafting`)
5. Proposta enviada (`proposal_sent`)
6. Negociação (`negotiation`)

**Outcome states (terminal)**: Ganha (`won`), Perdida (`lost`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| any active stage | any adjacent OR non-adjacent active stage | Drag card / stage change | Opportunity not archived; a `next_action` (próxima ação) is set or supplied on move | Gestor+, Admin |
| any active stage | `won` | "Marcar como ganha" | `proposal_sent` reached at least once (soft warning if skipped — verbal close allowed); linked company exists | Gestor+, Admin |
| any active stage | `lost` | "Marcar como perdida" | **`lost_reason` mandatory** (reason code or note) | Gestor+, Admin |
| `won` | (no stage change) → triggers project spin-up | Convert to project | Not already converted (single linked project unless admin explicitly adds another) | Gestor+, Admin |
| `lost` | any active stage | "Reabrir oportunidade" | Provide re-open note; company not archived | Gestor+, Admin |
| active/lost | archived (`archived_at` set) | Archive | Not `won` with active/on-hold/planning project | Gestor+ (own), Admin |
| `won` | archived (`archived_at` set) | Archive | Linked project is `cancelled` or `archived` (H1) | Gestor+ (own), Admin |

**Notes**: Moving between any active stages (forward or backward) is permitted — pipelines regress in reality. Probability % is a per-stage attribute (`pipeline_stages.win_probability`), admin-tunable (BR-020), never a transition guard.

**Invalid transitions (MUST be blocked)**

| From | To | Why blocked | Error message (pt-PT) |
|------|-----|------------|-----------------------|
| `won` | any active stage | Won deal is committed; reopening a won deal would desync the created project | "Esta oportunidade foi ganha e não pode voltar ao funil. Para alterações, use o projeto associado." |
| `won` | `lost` | Cannot lose an already-won deal | "Uma oportunidade ganha não pode ser marcada como perdida." |
| any | `lost` (without reason) | Loss reason is mandatory for pipeline tuning (Workflow 1 best practice) | "Indique o motivo da perda antes de continuar." |
| any active | another active stage (no `next_action`) | Every open opportunity must have a próxima ação (BR-010) | "Defina a próxima ação para esta oportunidade." |
| `won` | archived (project still live) | Won deal with a live delivery project must stay linked | "Não é possível arquivar: o projeto associado ainda está ativo." |
| archived | any | Archived opportunities are read-only until restored | "Oportunidade arquivada. Restaure-a para editar." |

---

### 1.2 Proposal

Proposals are metadata + PDF upload (no editor). Lifecycle tracks the buyer's engagement with the document.

**States**: Rascunho (`draft`), Enviada (`sent`), Visualizada (`viewed`), Aceite (`accepted`), Recusada (`rejected`), Expirada (`expired`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| `draft` | `sent` | "Enviar proposta" | PDF attached; value + `valid_until` set; linked opportunity active | Gestor+, Admin |
| `sent` | `viewed` | System (recipient open event) OR manual "marcar como visualizada" | — | System / Gestor+ |
| `sent` / `viewed` | `accepted` | "Marcar como aceite" | Linked opportunity not lost | Gestor+, Admin |
| `sent` / `viewed` | `rejected` | "Marcar como recusada" | Rejection note captured | Gestor+, Admin |
| `sent` / `viewed` | `expired` | AUTO-04 (past `valid_until`) OR manual | Past validity date | System / Gestor+ |
| `expired` | `sent` | "Reenviar" (extends validity) | New `valid_until` set | Gestor+, Admin |
| `draft` / `rejected` / `expired` | archived | Archive (any terminal or draft state — H2, BR-060) | — | Gestor+, Admin |

**Invalid transitions (MUST be blocked)**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `draft` | `viewed`/`accepted`/`rejected` | Cannot be viewed/decided before being sent | "A proposta tem de ser enviada antes de poder ser visualizada ou decidida." |
| `accepted` | any | Accepted is terminal (feeds won conversion); create a new proposal for renegotiation | "Proposta aceite não pode ser alterada. Crie uma nova proposta." |
| `accepted` | archived | Accepted proposal is permanently linked to its project (BR-036) and must remain queryable | "Proposta aceite está associada a um projeto e não pode ser arquivada." |
| `rejected` | `accepted` | Once rejected, re-issue as a new/resent proposal, don't flip | "Proposta recusada não pode ser aceite diretamente. Reenvie uma nova versão." |
| `sent` | `draft` | Sent document cannot silently revert to draft (audit integrity) | "Uma proposta enviada não pode voltar a rascunho." |
| `draft` | `sent` (no PDF / no value) | Required fields missing | "Anexe o PDF e defina o valor e a validade antes de enviar." |

---

### 1.3 Project

**States**: Planeamento (`planning`), Ativo (`active`), Em pausa (`on_hold`), Concluído (`completed`), Cancelado (`cancelled`), Arquivado (`archived`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| (created via spin-up) → `planning` | initial | Won→project conversion | Source opportunity `won` | Gestor+, Admin |
| `planning` | `active` | "Iniciar projeto" | At least 1 phase and 1 project member assigned; **payment milestones reviewed/confirmed (BR-037, H5)** | Gestor+ (owner), Admin |
| `active` | `on_hold` | "Colocar em pausa" | Pause reason captured; running timers on project tasks stopped (BR-042); child entities freeze (BR-053) | Gestor+ (owner), Admin |
| `on_hold` | `active` | "Retomar" | — | Gestor+ (owner), Admin |
| `active` / `on_hold` | `completed` | "Concluir projeto" | All non-archived phases are `completed` (a phase completes per §1.5 when all its non-archived tasks are `concluída`); open payment milestones acknowledged (soft warn) | Gestor+ (owner), Admin |
| `planning` / `active` / `on_hold` | `cancelled` | "Cancelar projeto" | Cancellation reason captured; cascade freeze of child entities (BR-053) | Admin (Gestor with grant) |
| `completed` / `cancelled` | `archived` | Archive | No running timers; cascade freeze of child entities (BR-053) | Gestor+, Admin |

**Project Health (sub-state, orthogonal — see 1.4)** is separate from lifecycle state.

**Invalid transitions (MUST be blocked)**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `completed` | `active`/`on_hold` | Completed projects are closed; reopening distorts margin/utilization history | "Projeto concluído não pode ser reaberto. Contacte um Administrador se necessário." |
| `cancelled` | any active | Cancelled is terminal | "Projeto cancelado não pode ser retomado." |
| `planning` | `completed` | Cannot complete a project that never started | "Inicie o projeto antes de o concluir." |
| `archived` | any | Archived is read-only | "Projeto arquivado. Restaure para editar." |
| `active` | `completed` (open non-archived phases) | Delivery not finished | "Existem fases por concluir. Conclua-as antes de fechar o projeto." |

---

### 1.4 Project Health (RAG) — auto-suggested, human-confirmed

Health is **orthogonal** to lifecycle state and only meaningful for `planning`/`active`/`on_hold` projects. Industry rule (DOMAIN_RESEARCH #4/Rec.3): **auto-suggest from signals, human confirms/overrides before publishing**.

**Published states**: Saudável (`healthy`/green), Atenção (`attention`/amber), Em risco (`at_risk`/red).
**Shadow field**: `suggested_health` (system-computed daily by AUTO-05) + `published_health` (human-confirmed, shown on dashboards).

**Valid transitions (published_health)**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| any | any | Manual set/override | Override reason required when it **differs** from `suggested_health` | Gestor+ (owner), Admin |
| any | `= suggested_health` | "Aceitar sugestão" | — | Gestor+ (owner), Admin |

**Auto-suggestion logic (AUTO-05, computes `suggested_health` only — never auto-publishes; runs only for live projects per BR-054)**:
- **at_risk (red)** if ANY: ≥1 overdue milestone/phase, OR overdue-task ratio > 25%, OR ≥1 blocked task older than 5 days, OR margin < 0 (cost-to-date > contracted), OR budget burn > 90% with < 70% phases complete.
- **attention (amber)** if ANY: overdue-task ratio 10–25%, OR any blocked task, OR margin 0–15%, OR budget burn 70–90% ahead of phase progress, OR a phase due within 3 days still `not_started`.
- **healthy (green)** otherwise.

**Invalid**: There are no forbidden health transitions (health is recoverable in all directions — DOMAIN_RESEARCH state machine explicitly allows red→green after remediation). The only rule: **the system never publishes on the human's behalf** (BR-030).

---

### 1.5 Project Phase

**States**: Não iniciada (`not_started`), Em curso (`in_progress`), Bloqueada (`blocked`), Concluída (`completed`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| `not_started` | `in_progress` | "Iniciar fase" OR first task moves to `in_progress` | Project `active` | Gestor+, Membro (assigned) |
| `in_progress` | `blocked` | "Bloquear fase" | Blocker reason captured | Gestor+, Membro (assigned) |
| `blocked` | `in_progress` | "Desbloquear" | — | Gestor+, Membro (assigned) |
| `in_progress` / `blocked` | `completed` | "Concluir fase" | **All non-archived tasks in phase are `concluída`; archived tasks excluded (C2, BR-051)** | Gestor+ (owner) |
| `completed` | `in_progress` | "Reabrir fase" | Reopen note; project not `completed` | Gestor+ (owner), Admin |

**Invalid transitions (MUST be blocked)**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `not_started` | `completed` | Cannot complete unstarted phase | "Inicie a fase antes de a concluir." |
| `not_started` | `blocked` | Nothing to block yet | "Só é possível bloquear uma fase em curso." |
| any | `in_progress`/`completed` (project not `active`) | Phase work requires an active project | "O projeto tem de estar ativo para trabalhar nesta fase." |
| any | `completed` (unfinished non-archived tasks) | All tasks must be done | "Existem tarefas por concluir nesta fase." |
| `completed` | `blocked` | Completed work isn't blocked; reopen first | "Reabra a fase antes de a bloquear." |

---

### 1.6 Task

**States**: Por fazer (`todo`), Em progresso (`in_progress`), Em revisão (`in_review`), Bloqueada (`blocked`), Concluída (`done`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| `todo` | `in_progress` | Start / drag | **Project `active` (H4)**; assigned or self-assign; **no unresolved blocking dependency** (BR-045) | Assignee, Gestor+, Admin |
| `in_progress` | `in_review` | "Enviar para revisão" | Project `active` | Assignee, Gestor+ |
| `in_review` | `done` | "Aprovar/Concluir" (approval) | Project `active` | **Gestor+ / Admin ONLY (approval — Membro cannot; matrix is authoritative, C3)** |
| `in_review` | `in_progress` | "Devolver" | Feedback comment | Gestor+, Admin |
| `todo` / `in_progress` / `in_review` | `blocked` | "Bloquear" | Blocker reason captured | Assignee, Gestor+, Admin |
| `blocked` | previous non-blocked state | "Desbloquear" | Blocking dependency resolved (if dependency-driven) | Assignee, Gestor+, Admin |
| `done` | `in_progress` | "Reabrir" | Project not `completed`/`cancelled`/`archived`; reopen note | Gestor+, Admin |
| any | archived | Archive | Task's project not requiring it active OR admin action; running timer stopped | Gestor+, Admin |

> **Pause semantics (H4)**: while a project is `on_hold`, tasks freeze — no forward transitions (`todo`→`in_progress`, `in_progress`→`in_review`, `in_review`→`done`) are allowed; blocking/unblocking metadata may still be recorded, mirroring Phase behavior. Forward work resumes only after the project returns to `active`.

**Invalid transitions (MUST be blocked)**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `todo` | `in_review` | Can't review work not started | "Inicie a tarefa antes de a enviar para revisão." |
| `todo` | `done` | Skipping work states hides real progress | "Coloque a tarefa em progresso antes de a concluir." |
| `in_review` | `done` (by Membro) | Approval is Gestor+/Admin only (C3) | "Só um Gestor ou Administrador pode aprovar e concluir a tarefa." |
| `blocked` | `done` | Resolve the blocker first | "Desbloqueie a tarefa antes de a concluir." |
| any | forward transition (project not `active`) | Task work requires an active project (H4) | "O projeto não está ativo; não é possível avançar a tarefa." |
| `in_progress` | `in_progress` (start timer) with another timer running | Single active timer per user (BR-040) | "Já tem um cronómetro ativo. Pare-o antes de iniciar outro." |
| any | `in_progress` (unresolved dependency) | Dependency gating | "Esta tarefa depende de outra ainda não concluída." |
| `done` (project completed/cancelled) | reopen | Closed project is immutable | "O projeto está fechado; a tarefa não pode ser reaberta." |

---

### 1.7 Payment Milestone (internal tracking ONLY — never a legal invoice)

**States**: Previsto (`planned`), Faturado (`invoiced`), Parcialmente pago (`partially_paid`), Pago (`paid`), Vencido (`overdue`), Cancelado (`cancelled`).

> `invoiced` = "the external certified accounting system has issued the real invoice; we recorded that it happened." Aurea stores a reference note only — no invoice number generation, no tax fields (BR-070/073).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| (created) → `planned` | initial | Project setup / won conversion default | `completion_criteria` set (BR-071); amount + expected_date set | Admin (Gestor with financial grant) |
| `planned` | `invoiced` | "Marcar como faturado (externamente)" | External invoice reference note supplied | Admin (Gestor w/ grant) |
| `planned` / `invoiced` | `partially_paid` | Record partial receipt | `received_amount` > 0 and < contracted amount | Admin (Gestor w/ grant) |
| `planned` / `invoiced` / `partially_paid` | `paid` | Record full receipt | cumulative received ≥ contracted amount | Admin (Gestor w/ grant) |
| `planned` / `invoiced` / `partially_paid` | `overdue` | AUTO-02 (past expected_date, not fully paid) | expected_date < today | System |
| `overdue` | `partially_paid` / `paid` | Record receipt | as above | Admin (Gestor w/ grant) |
| `planned` / `invoiced` / `partially_paid` / `overdue` | `cancelled` | "Cancelar marco" (incl. partial-receipt write-off — H3) | Cancellation/write-off reason; not `paid` | Admin (Gestor w/ grant) |

**Invalid transitions (MUST be blocked)**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `paid` | any (except audit correction by Admin) | Paid is terminal for tracking integrity | "Marco pago não pode ser alterado. Contacte um Administrador para correções." |
| `cancelled` | any | Cancelled is terminal | "Marco cancelado. Crie um novo marco se necessário." |
| `planned` | `paid` (received < contracted) | Amount doesn't reconcile | "O valor recebido não corresponde ao valor contratado." |
| (create/edit with tax/invoice-number fields) | — | Compliance boundary | "Os marcos de pagamento são registo interno, não faturas. Não é possível emitir numeração fiscal." |
| any → any by Membro | — | Financial data restricted (BR-072) | (403 — feature not visible) |

---

### 1.8 Milestone (delivery milestone — distinct from payment milestone)

Delivery milestones mark a deliverable/gate; often coupled 1:1 with a payment milestone but tracked separately.

**States**: Pendente (`pending`), Concluído (`achieved`), Falhado/Em atraso (`missed`), Cancelado (`cancelled`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| `pending` | `achieved` | "Marcar como concluído" | Linked phase(s) progress ≥ criteria | Gestor+ (owner), Membro (assigned) |
| `pending` | `missed` | AUTO-06/manual (past due, not achieved) | due_date < today | System / Gestor+ |
| `missed` | `achieved` | Late completion | — | Gestor+ |
| `pending` / `missed` | `cancelled` | Cancel | Reason captured | Gestor+ (owner), Admin |

**Invalid transitions**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `achieved` | `pending`/`missed` | Achieved is stable; reopen via phase reopen if truly wrong | "Marco já concluído não pode reverter." |
| `cancelled` | any | Terminal | "Marco cancelado." |

---

### 1.9 Meeting

**States**: Agendada (`scheduled`), Realizada (`held`), Cancelada (`cancelled`), Não compareceu (`no_show`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| (created) → `scheduled` | initial | Log/schedule meeting | start_at set; linked to opportunity/company/project | Gestor+, Admin; Membro (own project meetings) |
| `scheduled` | `held` | "Marcar como realizada" | Optional outcome note (feeds interaction log) | Organizer, Gestor+, Admin |
| `scheduled` | `cancelled` | "Cancelar" | — | Organizer, Gestor+, Admin |
| `scheduled` | `no_show` | "Cliente não compareceu" | Past start_at | Organizer, Gestor+, Admin |
| `cancelled` / `no_show` | `scheduled` | Reschedule (new start_at) | Future date | Organizer, Gestor+, Admin |

**Invalid transitions**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `held` | any | Held meeting is historical record | "Reunião já realizada não pode ser alterada." |
| `scheduled` | `held` (before start_at) | Can't hold a future meeting | "A reunião ainda não ocorreu." |

---

### 1.10 Invitation

**States**: Pendente (`pending`), Aceite (`accepted`), Expirada (`expired`), Revogada (`revoked`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| (created) → `pending` | Send invite | Email sent via Resend; token generated with TTL | Admin (Gestor with invite grant) |
| `pending` | `accepted` | Invitee sets password & accepts | Token valid & unexpired; email not already a user | Invitee (public tokenized endpoint) |
| `pending` | `expired` | AUTO / token TTL passed | now > token_expiry | System |
| `pending` | `revoked` | "Revogar convite" | — | Admin (Gestor w/ grant) |
| `expired` / `revoked` | `pending` | "Reenviar convite" | New token issued | Admin (Gestor w/ grant) |

**Invalid transitions**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `accepted` | any | Invite consumed; manage via user account | "Convite já aceite. Faça a gestão pelo utilizador." |
| `pending` | `accepted` (expired/invalid token) | Security | "Convite inválido ou expirado. Peça um novo convite." |
| `revoked` | `accepted` | Revoked tokens are dead | "Este convite foi revogado." |

---

### 1.11 User

**States**: Ativo (`active`), Desativado (`deactivated`).

**Valid transitions**

| From | To | Trigger | Guard | Role |
|------|-----|---------|-------|------|
| (invite accepted) → `active` | initial | Accept invitation | — | System |
| `active` | `deactivated` | "Desativar utilizador" | Not the last remaining Admin (BR-005); open work reassigned or flagged | Admin |
| `deactivated` | `active` | "Reativar" | — | Admin |

**On deactivation (side effects, not transitions)**: sessions/refresh tokens revoked (BR-006); running timer stopped; user removed from availability/utilization live calc but historical time entries retained; tasks remain assigned (surfaced as "assignee inactive" in Atenção panel).

**Invalid transitions**

| From | To | Why blocked | Error message |
|------|-----|------------|---------------|
| `active` (last Admin) | `deactivated` | System must always have ≥1 active Admin | "Não é possível desativar o último Administrador ativo." |
| `deactivated` | (login) | Deactivated users cannot authenticate | "Conta desativada. Contacte um Administrador." |
| any | hard-delete | Users are never hard-deleted (audit/GDPR trail) | (blocked; only deactivate) |

---

## 2. Business Rules

Enforcement: **Backend** = authoritative (service + DB). **Frontend** = UX mirror only. Financial/state/security rules are always Backend-authoritative.

### Roles & Access

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-001 | Three roles only: Administrador, Gestor, Membro. Permissions checked backend-side on every request; the frontend role is never trusted. There are NO per-project or custom permissions — the §3 matrix is the single access model. | Backend | 403 Forbidden | Auth, all resources |
| BR-002 | Membro sees only projects/clients they are a member of (`project_members`) or own; horizontal-access to others' records is blocked. | Backend | 403 / filtered-out (404 for non-owned) | CRM, Projects, Tasks, Time |
| BR-003 | Gestor manages CRM/projects/tasks/proposals/operational reports; payments and invites require an explicit per-user grant flag. | Backend | 403 on payments/invites without grant | Financial, Invites |
| BR-004 | Administrador has full control: members, settings, pipeline stages, templates, all financials, all projects/reports. | Backend | — | All |
| BR-005 | The system must always retain at least one active Administrador; deactivating/demoting the last one is blocked. | Backend | 409 Conflict | User |
| BR-006 | Deactivating a user immediately revokes all sessions and refresh tokens and stops any running timer. | Backend | — | User, Auth, Time |
| BR-007 | First Administrador is created only via secure seed/CLI; there is no public signup. | Backend | — | Auth |
| BR-008 | Financial data (contracted/received/pending amounts, margin, payment milestones, cost rates, project_costs) is invisible and non-writable to Membro. | Backend | 403 / hidden | Financial |

### Pipeline & Commercial

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-010 | Every open (non-terminal, non-archived) opportunity MUST have a `next_action` (próxima ação) with a due date. Moving/creating without one is blocked. | Backend + Frontend | 422; surfaced in Atenção panel if it drifts empty | Opportunity |
| BR-011 | Transition to `lost` requires a non-empty `lost_reason`. | Backend | 422 | Opportunity |
| BR-012 | Pipeline stages represent buyer progress; stage names/exit criteria are admin-managed, not free per-user. | Backend | 403 (non-admin edit) | Pipeline stages |
| BR-013 | A won opportunity can convert to a project; it cannot return to an active stage or become lost afterwards. It may only be archived once its project is `cancelled`/`archived` (BR-062, H1). | Backend | 409 | Opportunity/Project |
| BR-014 | Stale opportunity: an open opportunity with no interaction/activity in 14 days OR with an overdue `next_action` is flagged (AUTO-03). | Backend (cron) | Notification + Atenção panel | Opportunity |
| BR-020 | Each pipeline stage carries an editable `win_probability` %; only Admin edits it; it is never a transition guard. | Backend | 403 (non-admin) | Pipeline stages |

### Proposals

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-025 | A proposal cannot be `sent` without an attached PDF, a value, and a `valid_until` date. | Backend + Frontend | 422 | Proposal |
| BR-026 | `accepted` and `rejected` are terminal; renegotiation requires a new proposal record, preserving history. | Backend | 409 | Proposal |
| BR-027 | Proposals past `valid_until` while `sent`/`viewed` auto-transition to `expired` (AUTO-04). | Backend (cron) | Notification to owner | Proposal |
| BR-028 | Any non-accepted proposal (`draft`/`rejected`/`expired`) may be archived per BR-060; an `accepted` proposal cannot be archived because it is permanently linked to its project (BR-036, H2). | Backend | 409 (archive of accepted) | Proposal |

### Won → Project Conversion

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-035 | Won→project spin-up MUST pre-fill company, contacts, and (when an `accepted` proposal exists) its scope/value/payment terms with ZERO re-entry. **Fallback (verbal close, no proposal — C1)**: when no accepted proposal exists, the conversion form still pre-fills company/contacts, and the user MUST manually enter the contracted value (and may add payment milestones manually); commercial data reuse degrades gracefully rather than blocking conversion. | Backend | Conversion form requires contracted value when proposal absent (422 if empty) | Conversion |
| BR-036 | The source opportunity and (if any) accepted proposal remain permanently linked to the project (read-only) for audit traceability. | Backend | — | Conversion |
| BR-037 | Payment milestones are defaulted from the proposal's value/payment schedule at conversion (or entered manually per BR-035); the human MUST review/confirm them before the project transitions `planning`→`active` (H5). | Backend | 422 on `planning`→`active` if milestones unconfirmed | Conversion, Financial, Project |
| BR-038 | On successful conversion, the linked company is marked "cliente ativo" (derived flag from ≥1 active/won relationship). | Backend | — | CRM, Conversion |

### Time Tracking

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-040 | Exactly one active timer per user at any time; starting a new timer while one runs is blocked (must stop first). Enforced by partial unique index on `time_entries` where `ended_at IS NULL` per user. | Backend (DB constraint) | 409 | Time |
| BR-041 | Every time entry (timer or manual) MUST be attributed to a task (and thereby a project); orphan entries are rejected. | Backend | 422 | Time |
| BR-042 | Putting a project `on_hold`/`completed`/`cancelled`, or archiving a task, stops any running timer on its tasks. | Backend | — | Time, Project |
| BR-043 | `billable` is set at entry time, defaulting from the task/project billable nature; it is not silently backfilled. | Backend + Frontend | — | Time |
| BR-044 | A manual time entry cannot have `ended_at` <= `started_at`, cannot be in the future, and cannot span > 24h. | Backend | 422 | Time |

### Tasks & Dependencies

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-045 | A task with an unresolved blocking dependency cannot enter `in_progress`. | Backend | 409 | Task |
| BR-046 | Blocked status must be visually distinct on board/list and surfaced in the Atenção panel (not a hidden field). | Frontend (data from Backend) | — | Task UI |
| BR-047 | Task dependencies cannot form a cycle. | Backend | 422 | Task dependencies |
| BR-048 | Overdue task (due_date < today, not `done`) is flagged daily (AUTO-01), only for tasks on live projects (BR-054). | Backend (cron) | Notification | Task |
| BR-049 | Only assignees, Gestor+, or Admin can transition a task; Membro cannot transition tasks on projects they don't belong to. Approval (`in_review`→`done`) is Gestor+/Admin only (C3). Forward transitions require the project to be `active` (H4). | Backend | 403 / 409 | Task |

### Phases & Milestones

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-050 | Phase progress % is derived from its non-archived tasks (done ÷ total, weighted equally in MVP), not manually typed. | Backend | — | Phase |
| BR-051 | A phase completes when ALL its non-archived tasks are `concluída` (archived tasks excluded; there is no "waiver" — C2). When that condition is first met, the system SUGGESTS phase completion to the owner (AUTO-07); it does not auto-complete. | Backend (event) | Notification/suggestion only | Phase |
| BR-052 | Achieving a delivery milestone updates linked phase progress and may prompt (not force) the coupled payment milestone review. | Backend | — | Milestone, Phase, Payment |
| BR-053 | **Project cascade (C4)**: cancelling or archiving a project freezes all its child phases/tasks/delivery-milestones (read-only, no forward transitions) and stops all running timers on its tasks; pausing (`on_hold`) freezes forward task/phase transitions until resumed; completing a project requires all non-archived phases `completed`. Child payment milestones are NOT force-cancelled (financial reconciliation may continue) but no new ones can be created on a `cancelled`/`archived` project. | Backend | 409 on child forward transitions of frozen projects | Project, Phase, Task, Milestone, Time |
| BR-054 | **Automation scope (C4)**: every project-linked scheduled automation (AUTO-01, AUTO-05, AUTO-06, AUTO-07, AUTO-08, AUTO-09) runs ONLY for projects in `planning`/`active`/`on_hold`. Projects in `completed`/`cancelled`/`archived` are excluded from all cron flagging and notifications. AUTO-02 (payment overdue) still runs for non-cancelled payment milestones regardless of project state, since external reconciliation may outlive delivery. | Backend (cron) | — | Automations |

### Health

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-030 | The system computes `suggested_health` daily but NEVER publishes it automatically; `published_health` changes only by human action. | Backend | — | Health |
| BR-031 | When a human sets `published_health` different from `suggested_health`, an override reason is required. | Backend | 422 | Health |
| BR-032 | A downgrade in `suggested_health` (green→amber→red) notifies the project's Gestor/owner (AUTO-05), only for live projects (BR-054). | Backend (cron) | Notification | Health |

### Financial / Margin (backend-authoritative)

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-060 | Companies, opportunities, projects, tasks, and non-accepted proposals are NEVER hard-deleted — only archived (`archived_at`). | Backend | 405/blocked | All listed |
| BR-061 | Archived records are read-only until restored; they are excluded from active lists/reports by default. | Backend | 409 on edit | All archivable |
| BR-062 | A company cannot be archived while it has: a non-archived active project (`planning`/`active`/`on_hold`), an open opportunity, OR a `won` opportunity not yet converted/archived (H6). Resolve these first. | Backend | 409 | CRM |
| BR-063 | Contacts/companies with no activity support an inactive/archive marker actionable by Admin (GDPR storage-limitation hygiene). | Backend | — | CRM |
| BR-064 | `activity_logs` are append-only and non-editable by regular users (audit integrity). | Backend | 403 | Audit |
| BR-065 | Margin = contracted value − (Σ logged billable+internal hours × internal cost rate) − Σ `project_costs.amount`. Computed live/continuously, not only at close. | Backend | — | Financial |
| BR-066 | Internal cost rate and contracted value are Admin-managed (or Gestor with financial grant); never Membro-visible. | Backend | 403 | Financial |
| BR-067 | Payment milestone due soon (expected_date within 7 days, not paid) notifies Admin/Gestor (AUTO-08). | Backend (cron) | Notification | Payment |
| BR-068 | Overdue payment milestone (expected_date < today, not fully paid) transitions to `overdue` and notifies Admin (AUTO-02). | Backend (cron) | State change + notification | Payment |
| BR-069 | **`project_costs` entity (H8)**: minimal cost line-items backing the "other costs" term in BR-065. Fields: `id` (UUID), `project_id`, `description`, `amount` (EUR), `date`, `created_by`, `created_at`. Create/edit is Admin (Gestor with financial grant) only; invisible to Membro (BR-008). It is NOT an invoicing/expense-approval workflow — just internal cost tracking for margin. | Backend | 403 (Membro) | Financial |

### Compliance Boundary (SAF-T / invoicing)

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-070 | Payment milestones must NOT contain or generate: sequential invoice numbers, tax/VAT breakdowns, ATCUD, QR codes, or fiscal signatures. | Backend + Frontend | Field rejected / not present | Payment, Compliance |
| BR-071 | Every payment milestone MUST have a `completion_criteria` (what confirms it done) plus a confirmer, alongside amount and expected date. | Backend + Frontend | 422 | Payment |
| BR-072 | All UI/PDF copy uses "marco de pagamento"/"payment milestone"; the word "fatura"/"invoice" is not used for Aurea-generated records. | Frontend | (copy review) | Compliance |
| BR-073 | `invoiced` status only records that an external certified system issued the invoice (reference note); Aurea does not produce the fiscal document. | Backend | — | Payment, Compliance |

### Capacity / Workload

| ID | Rule | Enforcement | On Violation | Governs |
|----|------|------------|--------------|---------|
| BR-080 | Net delivery capacity = (gross contracted hours − known non-project hours) × role utilization target. | Backend | — | Workload |
| BR-081 | Utilization targets are role-dependent, NOT flat: engineering/delivery ~75–80%, management/lead ~35–50%. Targets are Admin-configurable per role. | Backend | — | Workload |
| BR-082 | Availability state is DERIVED from assigned load vs net capacity, not manually toggled: `disponível` (< 70% of net capacity allocated), `equilibrado` (70–100%), `sobrecarregado` (> 100%). "Away/ausente" may be set manually for PTO. | Backend | — | Workload |
| BR-083 | Utilization rate = billable hours ÷ available hours; compared against the person's role target (never a single global %). | Backend | — | Workload |
| BR-084 | Over-allocation (`sobrecarregado`) is recomputed daily (AUTO-09) and warns the assigning Gestor/Admin. | Backend (cron) | Notification | Workload |

---

## 3. Permission Matrix (backend-enforced — BR-001; SINGLE authoritative access model, no per-project overrides)

Legend: ✅ full · 👤 own/assigned scope only · 🔒 requires per-user grant (payments/invites) · ❌ none.
"Gestor own" = projects/clients they manage or are member of. "Membro member" = a project where the user is in `project_members`.

| Action / Resource | Administrador | Gestor | Membro |
|---|---|---|---|
| **Users & Auth** | | | |
| Invite / accept-manage users | ✅ | 🔒 | ❌ |
| Activate / deactivate users | ✅ | ❌ | ❌ |
| Edit own profile / preferences | ✅ | ✅ | ✅ |
| Manage roles | ✅ | ❌ | ❌ |
| **Settings** | | | |
| Pipeline stages / probabilities | ✅ | ❌ | ❌ |
| Project templates | ✅ | ✅ (use); Admin creates canonical | ❌ |
| Role utilization targets / cost rates | ✅ | ❌ | ❌ |
| **CRM** | | | |
| View companies/contacts/interactions | ✅ | ✅ | 👤 (own projects' clients) |
| Create/edit company/contact | ✅ | ✅ | ❌ |
| Log interaction / meeting | ✅ | ✅ | 👤 (own project) |
| Archive company/contact | ✅ | ✅ (own) | ❌ |
| **Pipeline / Opportunities** | | | |
| View opportunities | ✅ | ✅ | ❌ |
| Create / move / edit opportunity | ✅ | ✅ | ❌ |
| Mark won / lost | ✅ | ✅ | ❌ |
| Convert won → project | ✅ | ✅ | ❌ |
| **Proposals** | | | |
| View proposals | ✅ | ✅ | ❌ |
| Create / send / decide proposal | ✅ | ✅ | ❌ |
| **Projects** | | | |
| View project | ✅ | ✅ | 👤 (member) |
| Create project (incl. from spin-up) | ✅ | ✅ | ❌ |
| Change project lifecycle state | ✅ | 👤 (owner) | ❌ |
| Cancel project | ✅ | 🔒/owner-with-grant | ❌ |
| Set/override published health | ✅ | 👤 (owner) | ❌ |
| Manage project members | ✅ | 👤 (owner) | ❌ |
| **Phases / Milestones / Tasks** | | | |
| Create/edit phase & milestone | ✅ | 👤 | ❌ |
| Complete phase | ✅ | 👤 (owner) | ❌ |
| Create/edit task | ✅ | 👤 | 👤 (only on projects where they are a project_member — H7) |
| Transition own assigned task (up to `em revisão`) | ✅ | ✅ | 👤 |
| Approve task (`em revisão`→`concluída`) | ✅ | 👤 (owner/reviewer) | ❌ (C3) |
| Comment / mention / attach | ✅ | ✅ | 👤 |
| **Time Tracking** | | | |
| Start/stop own timer, manual entry | ✅ | ✅ | 👤 |
| View others' time entries | ✅ | 👤 (own project members) | ❌ |
| Edit others' time entries | ✅ | ❌ | ❌ |
| **Financial** | | | |
| View contracted/received/pending/margin | ✅ | 🔒 (grant) | ❌ |
| Create/edit payment milestone | ✅ | 🔒 (grant) | ❌ |
| Record payment received | ✅ | 🔒 (grant) | ❌ |
| Create/edit project_costs (BR-069) | ✅ | 🔒 (grant) | ❌ |
| **Workload / Team** | | | |
| View team capacity/heatmap | ✅ | ✅ | 👤 (own load only) |
| Assign load / reassign | ✅ | 👤 | ❌ |
| **Reports / Search / Notifications** | | | |
| Operational reports + CSV export | ✅ | ✅ (own scope) | 👤 (own) |
| Financial reports | ✅ | 🔒 | ❌ |
| Global search (Cmd/Ctrl+K) | ✅ (all) | ✅ (visible scope) | 👤 (own scope) |
| View own notifications | ✅ | ✅ | ✅ |
| View activity_logs (audit) | ✅ | 👤 (own project actions) | ❌ |

---

## 4. User Journey Maps

### 4.1 Administrador — Oversight & Governance

**Entry**: Logs in → lands on Dashboard with "Atenção necessária" panel (at-risk projects, overdue payments, stalled opportunities, over-allocated people, inactive-assignee tasks).

**Daily flow**:
1. Open Dashboard → sees Atenção panel grouped by category → drills into an at-risk project → reviews `suggested_health` vs `published_health` → confirms/overrides health with reason (BR-030/031).
2. Reviews overdue payment milestone (AUTO-02) → opens Financial ops → records received amount or contacts owner → status → `partially_paid`/`paid` (BR-068).
3. Reviews stalled opportunity (AUTO-03) → nudges the responsible Gestor.
4. Team & workload → spots `sobrecarregado` member (BR-082/084) → rebalances assignments.
5. Reports → exports operational/financial CSV.

**Critical path**: Governance loop — Atenção panel → drill → decide → resolve. Also the only role that manages members, pipeline stages, templates, cost rates, and can grant payment/invite rights.

**Edge cases**:
- Tries to deactivate the last Admin → blocked (BR-005).
- Deactivates a user with a running timer/open tasks → timer stopped (BR-006), tasks surfaced as "assignee inactive" for reassignment.
- Attempts to hard-delete a company → only archive offered (BR-060); archive blocked if active project, open opp, OR unconverted won opp exists (BR-062).

### 4.2 Gestor — Commercial + Delivery Management

**Entry**: Logs in → Dashboard (own-scope Atenção panel: own opportunities missing próxima ação, own project health, own tasks needing review).

**Commercial daily flow (Flow 1 of spec)**:
1. CRM → create company → add contacts → create opportunity (`new_contact`).
2. Move opportunity across pipeline (drag); each move requires/updates próxima ação (BR-010).
3. Log a meeting (`meeting_scheduled` stage / meeting entity) → mark `held` with outcome → outcome recorded as interaction.
4. Create proposal (`draft`) → attach PDF, set value + validity → `sent` (BR-025) → recipient opens → `viewed` (AUTO/notification) → `accepted`.
5. Mark opportunity `won` → **Convert to project**: reviews pre-filled project (company, contacts, proposal scope/value, template phases/tasks, defaulted payment milestones — BR-035/037). If the deal closed verbally with no accepted proposal, enters contracted value manually (BR-035/C1) → confirms payment milestones (BR-037) → assigns team → project `planning` → `active`.

**Delivery daily flow**:
6. Manage phases/tasks; move tasks; approve `em revisão`→`concluída` (Gestor-only per C3); watch blocked tasks (BR-046).
7. Weekly: review project health suggestion → publish with context (BR-030/031).
8. Accept phase-completion suggestion when all non-archived tasks are done (BR-051).

**Critical path**: The won→project handoff (BR-035) — the product's core differentiator; zero re-entry, with graceful manual fallback for verbal closes.

**Edge cases**:
- Tries to mark won without ever sending a proposal → soft warning, allowed; conversion then requires manual contracted value (BR-035).
- Tries to move opportunity without próxima ação → blocked (BR-010).
- Tries to start project without confirming payment milestones → blocked (BR-037/H5).
- Tries to view financials without grant → 403 (BR-003).
- Proposal expires before decision (AUTO-04) → notified → "Reenviar" with new validity.

### 4.3 Membro — Delivery Execution

**Entry**: Logs in → "O meu trabalho" hub with contextual greeting from real data ("Bom dia — tens 3 tarefas para hoje, 1 em atraso, 1 bloqueada").

**Daily flow (Flow 2 of spec)**:
1. Opens "O meu trabalho" → today's + overdue tasks, own workload state.
2. Picks a task → **starts timer** (single active — BR-040) → status `todo`→`in_progress` (blocked if dependency unresolved — BR-045, or if project not `active` — H4).
3. Updates checklist items, comments, @mentions a teammate (notification fires), attaches a file (R2 signed URL).
4. Hits an external dependency → sets task `blocked` with reason → surfaced in Atenção panels (BR-046).
5. Finishes work → stops timer, sets `billable` (defaulted — BR-043) → moves task to `em revisão`. **A Gestor/Admin approves it to `concluída` — the Membro cannot self-approve (C3).**
6. Sees own availability state (`equilibrado`) but not others' financials/capacity beyond own (BR-002/008).

**Critical path**: Timer + status update loop on own tasks, ending at `em revisão`.

**Edge cases**:
- Tries to start a second timer → blocked (BR-040).
- Tries to move own task past `em revisão` → blocked, needs Gestor approval (C3).
- Tries to create/edit a task on a project they're not a member of → 403 (H7/BR-002).
- Tries to open a project they're not a member of (e.g., via search) → 404/filtered (BR-002).
- Assigned a task then deactivated → task flagged for reassignment (Admin journey).
- Manual entry with future end time → rejected (BR-044).

### 4.4 The 25 critical flows — coverage map

| # | Critical flow | Primary persona | Covered by |
|---|---|---|---|
| 1 | Login / logout | all | Auth; §1.11 |
| 2 | Password reset | all | Auth (Resend) |
| 3 | Invite / accept | Admin/Gestor(grant) | §1.10 |
| 4 | Refresh token / session | all | BR-006, Auth |
| 5 | Dashboard "Atenção necessária" | all | §4.1/4.2/4.3, §6 |
| 6 | "O meu trabalho" hub | Membro | §4.3 |
| 7 | Create company | Gestor+ | §4.2, matrix |
| 8 | Add contacts | Gestor+ | §4.2 |
| 9 | Log interaction/meeting | Gestor+/Membro | §1.9, §4.2 |
| 10 | Create opportunity | Gestor+ | §1.1 |
| 11 | Move opportunity across pipeline | Gestor+ | §1.1, BR-010 |
| 12 | Set próxima ação | Gestor+ | BR-010 |
| 13 | Mark won | Gestor+ | §1.1, BR-013 |
| 14 | Mark lost + reason | Gestor+ | §1.1, BR-011 |
| 15 | Create/send proposal | Gestor+ | §1.2, BR-025 |
| 16 | Proposal decision (accept/reject/expire) | Gestor+/System | §1.2, BR-027 |
| 17 | Won → project spin-up (+ manual fallback) | Gestor+ | §1.3, BR-035..038, §5 |
| 18 | Manage phases | Gestor+ | §1.5 |
| 19 | Manage milestones | Gestor+ | §1.8 |
| 20 | Set/override project health | Gestor+ | §1.4, BR-030/031 |
| 21 | Task board / status transitions | all | §1.6 |
| 22 | Blockers / dependencies | all | §1.6, BR-045/047 |
| 23 | Time tracking (timer + manual + billable) | all | §1 Time, BR-040..044 |
| 24 | Payment milestones + margin | Admin/Gestor(grant) | §1.7, BR-065..073 |
| 25 | Team workload / capacity | Admin/Gestor / own | BR-080..084 |

Calendar aggregate, global search (Cmd/Ctrl+K), notifications center, and CSV reports are cross-cutting surfaces consuming the above (see §6 / matrix).

---

## 5. Cross-Workflow Dependencies

| Workflow A | Relationship | Workflow B | Rule / behavior |
|---|---|---|---|
| Opportunity `won` | triggers | Project spin-up | Pre-fills project from company/contacts/proposal/template; zero re-entry, manual value fallback if no proposal (BR-035). |
| Opportunity `won` | triggers | Company status | Company derived-flagged "cliente ativo" (BR-038). |
| Accepted proposal | feeds | Payment milestones | Milestones default from proposal value/schedule at conversion; confirmed before `ativo` (BR-037). |
| Opportunity/proposal | permanently link (read-only) | Project | Audit traceability; not orphaned/deleted (BR-036). |
| Project `cancelled`/`archived` | archives-eligible | Won opportunity | Won opp may archive only after its project is cancelled/archived (H1, BR-013). |
| Task all-non-archived-done in phase | suggests | Phase completion | AUTO-07 suggests, never auto-completes; no waiver (BR-051/C2). |
| Task `done` | recomputes | Phase progress % | Derived from non-archived tasks (BR-050). |
| Milestone `achieved` | updates | Phase progress + prompts payment review | BR-052. |
| Task overdue | notifies | Assignee + Gestor | AUTO-01 (BR-048); live projects only (BR-054). |
| Task `blocked` | surfaces in | Atenção panel + board | BR-046. |
| Task dependency unresolved | blocks | Task `in_progress` | BR-045. |
| Project state (not `active`) | freezes | Child task/phase forward transitions | BR-053/H4 (pause), C4 (cancel/archive). |
| Project → `on_hold`/`completed`/`cancelled`/`archived` | stops | Running timers on its tasks | BR-042/BR-053. |
| Project `cancelled`/`archived` | excluded from | Project-linked cron automations | BR-054/C4. |
| Time entries | feed | Margin (cost-to-date) | BR-065; live, continuous. |
| project_costs | feed | Margin (other costs term) | BR-065/BR-069/H8. |
| Time entries (billable) | feed | Utilization + availability state | BR-082/083. |
| Assigned load vs net capacity | derives | Availability state | BR-082; over-alloc warns Gestor (AUTO-09/BR-084). |
| Payment milestone overdue | notifies | Admin + flags project financial risk | AUTO-02 (BR-068); can feed health at_risk (§1.4). |
| Margin < 0 or budget-burn signals | feed | `suggested_health` | §1.4 auto-suggestion (never auto-publishes). |
| Suggested health downgrade | notifies | Project Gestor/owner | AUTO-05 (BR-032); live projects only (BR-054). |
| User deactivated | cascades | Sessions revoked, timer stopped, tasks flagged | BR-006. |
| Company archive attempt | gated by | Active project / open opp / unconverted won opp | Blocked until resolved (BR-062/H6). |
| Proposal past validity | transitions | `expired` + notify owner | AUTO-04 (BR-027). |
| Opportunity stale / próxima ação overdue | flags | Atenção panel + notify owner | AUTO-03 (BR-014). |
| Meeting `held` | creates | Interaction record | §1.9. |
| Won opp with no project after 3 days | nudges | Gestor | AUTO-11. |
| Calendar aggregate | reads (no writes) | tasks + meetings + milestones + payment milestones | Read-only projection surface. |

---

## 6. Notification / Event Map

### 6.1 The 12 fixed automations

> **Design decision (ambiguity resolved)**: forge-context.md states "fixed automations (12 rules)" run via Railway Cron but does not enumerate them. I defined the canonical 12 below by mapping every scheduled/derived trigger implied by the spec + DOMAIN_RESEARCH standards. They are **fixed and non-configurable** (Non-Goals: no configurable automations). Event-driven user notifications (assign, mention, comment, invite accepted, proposal viewed) are listed separately in §6.2 and are NOT counted among the 12. **All project-linked automations obey BR-054 (live projects only).**

| # | Automation | Trigger (schedule/condition) | Recipients (role) | Channel | Grouping | Message template |
|---|---|---|---|---|---|---|
| AUTO-01 | Task overdue | Daily; task `due_date` < today, not `done`; live project only | Assignee(s) + project Gestor/owner | In-app (+ digest) | Per project | "Tarefa «{task}» está em atraso desde {date}." |
| AUTO-02 | Payment milestone overdue | Daily; expected_date < today, not fully paid, not cancelled → set `overdue` (runs regardless of project state) | Administrador (+ Gestor w/ grant) | In-app + email | Per project | "Marco de pagamento «{milestone}» ({amount}€) está vencido." |
| AUTO-03 | Stale opportunity | Daily; no activity 14d OR overdue próxima ação | Opportunity owner (Gestor) + Admin | In-app | Per owner | "Oportunidade «{opp}» sem atividade / próxima ação em atraso." |
| AUTO-04 | Proposal expiry | Daily; `sent`/`viewed` past `valid_until` → set `expired` | Proposal owner | In-app | Per owner | "Proposta «{proposal}» expirou em {date}." |
| AUTO-05 | Health suggestion recompute | Daily; recompute `suggested_health`; on downgrade notify; live project only | Project Gestor/owner | In-app | Per project | "Saúde sugerida do projeto «{project}» mudou para {status}." |
| AUTO-06 | Milestone/phase due soon | Daily; delivery milestone/phase due within 3 days; live project only | Project members | In-app | Per project | "Marco «{milestone}» vence em {n} dias." |
| AUTO-07 | Phase completion suggestion | Event; last non-archived task in phase → `done`; live project only | Phase/project owner (Gestor) | In-app | Per project | "Todas as tarefas da fase «{phase}» estão concluídas. Concluir a fase?" |
| AUTO-08 | Payment due soon | Daily; expected_date within 7 days, not paid; live project only | Administrador (+ Gestor w/ grant) | In-app | Per project | "Marco «{milestone}» previsto para {date} ({amount}€)." |
| AUTO-09 | Capacity/workload recompute | Daily; recompute availability; on `sobrecarregado` warn (live-project load) | Assigning Gestor + Admin | In-app | Per person | "{member} está sobrecarregado(a) ({alloc}% da capacidade)." |
| AUTO-10 | Meeting reminder | Scheduled; before meeting `start_at` | Meeting participants | In-app (+ email opt) | Per meeting | "Reunião «{meeting}» começa em {n} min." |
| AUTO-11 | Won-without-project nudge | Daily; won opp > 3 days, no linked project | Opportunity owner (Gestor) + Admin | In-app | Per owner | "Oportunidade ganha «{opp}» ainda não foi convertida em projeto." |
| AUTO-12 | Forgotten timer | Daily/overnight; timer running > 8h or across day boundary | Timer owner | In-app | Per user | "Tem um cronómetro a correr há {n}h em «{task}». Deseja pará-lo?" |

### 6.2 Event-driven notifications (user actions — not among the 12)

| Trigger | Recipients | Channel | Grouping | Message |
|---|---|---|---|---|
| Task assigned to user | New assignee | In-app | Per project | "Foi-lhe atribuída a tarefa «{task}»." |
| @mention in comment | Mentioned user | In-app | Per thread | "{user} mencionou-o(a) em «{context}»." |
| Comment on task you're assigned/watching | Assignees/watchers | In-app | Per task | "Novo comentário em «{task}»." |
| Task returned from review | Assignee | In-app | Per project | "A tarefa «{task}» foi devolvida com feedback." |
| Task approved (em revisão→concluída) | Assignee | In-app | Per project | "A sua tarefa «{task}» foi aprovada e concluída." |
| Proposal viewed by recipient | Proposal owner | In-app | Per proposal | "A proposta «{proposal}» foi visualizada." |
| Proposal accepted/rejected | Proposal owner + Admin | In-app | Per opportunity | "Proposta «{proposal}» foi {status}." |
| Invitation accepted | Inviting Admin/Gestor | In-app | — | "{user} aceitou o convite." |
| Password reset requested | Requesting user | Email (Resend) | — | (transactional) |
| Added as project member | New member | In-app | Per project | "Foi adicionado(a) ao projeto «{project}»." |
| Task blocker resolved | Blocked-task assignee | In-app | Per task | "O bloqueio da tarefa «{task}» foi resolvido." |
| Payment received recorded | Admin (+ Gestor w/ grant) | In-app | Per project | "Recebimento registado no marco «{milestone}»." |

**Notification rules**: all respect role visibility (a Membro never receives financial or cross-project notifications — BR-002/008); grouping collapses same-entity events into a single digest line; each notification links to the source entity; user notification preferences (channel opt-outs) live in `user_preferences`.

---

## 7. Design Decisions Where Ambiguity Was Resolved

1. **The 12 automations were not enumerated** in forge-context.md. Defined the canonical 12 (§6.1) by mapping every scheduled/derived trigger implied by the spec and DOMAIN_RESEARCH, keeping them fixed/non-configurable per Non-Goals. Event-driven user notifications are separated (§6.2) and NOT counted among the 12.
2. **Pipeline forward/backward movement**: allowed between any active stages (deals regress in reality); only won/lost are guarded as terminal. Probability is an attribute, never a transition guard (DOMAIN_RESEARCH Rec.1).
3. **Won without a sent proposal**: soft-warn but allow (verbal closes happen); did not hard-block, to avoid users routing around the system.
4. **Health model**: implemented as two fields — `suggested_health` (system) + `published_health` (human) — to honor "auto-suggest, human-confirm" without automation ever publishing (DOMAIN_RESEARCH #4/Rec.3).
5. **Availability thresholds**: chose `<70% / 70–100% / >100%` of net capacity for disponível/equilibrado/sobrecarregado, with role-dependent utilization targets feeding net capacity (BR-080/081). Thresholds are a reasonable industry default; flagged as Admin-tunable.
6. **`invoiced` state kept but redefined** as "external certified system issued the real invoice; we recorded a reference," never Aurea generating a fiscal document — preserving the SAF-T boundary (BR-070/073).
7. **Phase completion is suggested, never automatic** even when all tasks are done, mirroring the health "human-confirm" philosophy.
8. **Single-active-timer enforced at the DB level** (partial unique index) in addition to service logic, because DOMAIN_RESEARCH flags multi-timer as a data-integrity anti-pattern that must not be relaxed.
9. **Cancel project** placed under Admin (Gestor only with grant) since cancellation has financial/margin consequences, consistent with the financial-grant model.
10. **Meeting `no_show`** state added (not explicitly in the brief's meeting list) because it is a real commercial outcome distinct from cancellation and feeds pipeline-hygiene reporting; kept minimal.

### r2 revision resolutions (validator issues)

11. **C1 — Verbal-close conversion fallback**: BR-035 now defines a graceful degradation path — when no accepted proposal exists, the conversion form still reuses company/contacts and REQUIRES the user to enter contracted value manually (422 if empty). Reflected in the Opportunity→Project cross-dependency, §4.2 Gestor journey, and flow #17.
12. **C2 — "Waived" concept removed**: dropped all "waiver" language from Project completion (§1.3), Phase completion (§1.5), BR-050, and BR-051. A phase now completes strictly when ALL its non-archived tasks are `concluída` (archived tasks excluded); project completion requires all non-archived phases `completed`.
13. **C3 — No self-approval / no per-project permissions**: deleted the "self-review allowed by project" carve-out from the Task machine (§1.6). Approval (`em revisão`→`concluída`) is Gestor+/Admin ONLY; a Membro can move a task up to `em revisão` but not past it. The §3 permission matrix is now stated as the single authoritative access model (BR-001, §0). Added an explicit "task approved" notification (§6.2) and blocked-transition row.
14. **C4 — Project cascade + automation scoping**: added BR-053 (cascade freeze on pause/cancel/archive, timer stop, completion requires resolved children) and BR-054 (all project-linked cron automations run only for `planning`/`active`/`on_hold` projects; AUTO-02 excepted for external reconciliation). AUTO-01/05/06/07/08/09 annotated "live project only."
15. **H1 — Won opp → arquivado**: Opportunity machine now permits `won`→archived once the linked project is `cancelled`/`archived` (BR-013).
16. **H2 — Proposal archive for terminal states**: Proposal machine allows `draft`/`rejected`/`expired`→archived; `accepted` is explicitly non-archivable (permanently linked to project). Added BR-028.
17. **H3 — Partial-payment write-off**: payment_milestone `parcialmente pago`→`cancelado` now permitted (write-off, Admin/Gestor-with-grant, reason required).
18. **H4 — Task/project-active guard + pause parity**: Task forward transitions now require project `active`, matching Phase; explicit pause-semantics note added; BR-049 updated.
19. **H5 — Payment-milestone confirmation before `ativo`**: `planning`→`active` guard now includes payment-milestone confirmation, consistent with BR-037 (422 if unconfirmed).
20. **H6 — Company archive vs won-not-converted opp**: BR-062 extended to block archiving a company that has a `won` opportunity not yet converted/archived.
21. **H7 — Membro task create/edit scope defined**: removed the undefined "if allowed"; a Membro can create/edit tasks only on projects where they are a `project_member` (matrix + edge case).
22. **H8 — Margin backing entity**: chose to add a minimal `project_costs` entity (BR-069: id, project_id, description, amount, date, created_by) rather than simplify the formula, since the brief's margin definition includes "other costs." BR-065 now references `Σ project_costs.amount`; matrix and BR-008 updated to restrict it from Membro. This is internal cost tracking only — not an expense-approval or invoicing workflow (no new user-facing feature beyond a cost line-item list under Financial ops).

**Medium/Low issues** flagged by the validator are intentionally left as documented trade-offs and do not block this revision.
