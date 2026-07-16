# Workflow Validation Report

**App**: Aurea System
**Validated**: 2026-07-16
**Inputs**: forge-context.md, DOMAIN_RESEARCH.md, WORKFLOW_SPEC.md
**Validator**: Workflow Validator (forge-prd team)

---

## Validation Summary

- State machines validated: 11 (Opportunity, Proposal, Project, Project Health, Project Phase, Task, Payment Milestone, Milestone, Meeting, Invitation, User)
- Business rules validated: 55 distinct rule IDs across §2 (BR-001–008, 010–014, 020, 025–027, 030–032, 035–038, 040–044, 045–049, 050–052, 060–068, 070–073, 080–084)
- Personas / critical flows walked: 3 persona journeys (§4.1–4.3) covering all 25 critical flows in the §4.4 coverage map
- **Issues found: 22** (Critical: 4, High: 8, Medium: 5, Low: 5)

**Overall verdict: NEEDS REVISION before PRD.** Four CRITICAL issues must be resolved — three are direct contradictions/undefined mechanisms that block core lifecycle transitions (project/phase completion, task approval) or the product's headline differentiator (won→project zero-re-entry conversion), and one is a systemic cascade gap that would make the "Atenção necessária" panel and automations untrustworthy for any cancelled/completed project (exactly the anti-pattern DOMAIN_RESEARCH pitfall #4/#6 warns against). None require a redesign of the overall architecture — all four are addressable with targeted rule additions/clarifications, not a rebuild.

---

## Critical Issues (MUST fix before PRD)

| # | Category | Description | Affected Workflows | Recommendation |
|---|----------|------------|--------------------|-----------------|
| C1 | Contradiction / missing fallback | The Opportunity state machine (§1.1) allows `won` with only a soft warning if no proposal was ever sent ("proposal_sent reached at least once (soft warning if skipped)"), and design decision #3 explicitly confirms verbal closes are allowed. But BR-035/036/037 (Won→Project Conversion) assume an **accepted proposal** exists to supply scope/value and to default payment milestones ("Payment milestones are defaulted from the proposal's value/payment schedule"). There is no defined fallback for the zero-proposal case — the spec never says what data the Gestor enters manually when converting a verbally-won deal. This breaks the product's headline differentiator (zero-re-entry conversion) for a scenario the spec itself declares valid. | Opportunity (§1.1), Proposal (§1.2), Won→Project Conversion (BR-035–038) | Add an explicit conditional to BR-035/037: "If no accepted proposal exists, the conversion screen must require manual entry of scope/value and at least one payment milestone before the project can leave `planning`." Document this as a named alternate path, not an implicit gap. |
| C2 | Undefined mechanism | Project completion guard (§1.3: "All phases `completed` **or explicitly waived**"), Phase completion guard (§1.5: "All tasks in phase `completed` **or waived**"), and BR-051 all reference a "waived" task/phase outcome. No such state, field, permission, or BR rule defines what "waived" means, who can waive, what reason/audit trail is captured, or how it's reflected in Task (§1.6) or Phase (§1.5) state enums — neither state machine lists "waived" as a state. As written, this is unimplementable and blocks two major terminal transitions (project completion, phase completion) that the spec claims are supported. | Project (§1.3), Project Phase (§1.5), BR-051 | Either (a) define a `waived` boolean + `waived_reason` + `waived_by` field on Task and Phase, with an explicit BR and permission-matrix row (who can waive, backend-authoritative), or (b) remove "or waived" from both completion guards for MVP and require literal 100% task completion, deferring "waiver" to a documented future-scope item. |
| C3 | Direct contradiction + non-goal violation | Task state machine (§1.6), `in_review → done` row: Role = "Gestor+ (reviewer); **assignee only if self-review allowed by project** (default: reviewer ≠ author preferred, not enforced)". This directly contradicts the Permission Matrix (§3): "Approve task (in_review→done): Administrador ✅, Gestor 👤 (reviewer), **Membro ❌**." The state machine also silently introduces a **per-project configurable permission** ("self-review allowed by project") that is not modeled as any entity/field anywhere and directly violates forge-context.md's explicit Non-Goal: "no ... fully custom permissions." | Task (§1.6), Permission Matrix (§3), BR-049 | Delete the self-review carve-out from §1.6; the Permission Matrix (Membro ❌ to approve, Gestor 👤 reviewer-only) is the single source of truth. If self-approval is genuinely wanted for some cases, model it as one fixed, global BR (not a per-project toggle) and update the matrix to match — don't leave two authoritative sections disagreeing. |
| C4 | Missing cascade / systemic automation-trust failure | No rule anywhere defines what happens to child Tasks, Project Phases, Milestones, or Payment Milestones when a Project transitions to `cancelled` or `completed`. BR-042 only stops running timers. Tasks/phases can remain `in_progress`/`blocked`/`not_started`, and payment milestones can remain `planned`/`overdue` indefinitely on a dead project. None of AUTO-01 (task overdue), AUTO-02 (payment overdue), AUTO-05 (health recompute), AUTO-06 (milestone/phase due soon), or AUTO-08 (payment due soon) state an exclusion for non-active projects. This means the daily cron jobs will keep generating overdue/at-risk/payment-due notifications for cancelled or completed projects forever, polluting "Atenção necessária" and every dashboard — precisely the "erodes trust in the dashboard" failure DOMAIN_RESEARCH pitfall #4 and #6 warn against. | Project (§1.3) × Task (§1.6), Project Phase (§1.5), Milestone (§1.8), Payment Milestone (§1.7); AUTO-01/02/05/06/08 | Add an explicit cascade BR: "On project transition to `cancelled` or `completed`, all non-terminal child tasks/phases/milestones are excluded from daily automation queries (or auto-frozen to a terminal sub-state)." Gate every project-scoped cron (AUTO-01, 02, 05, 06, 08) to only evaluate projects in `planning`/`active`/`on_hold`. |

---

## High Issues (SHOULD fix before PRD)

| # | Category | Description | Affected Workflows | Recommendation |
|---|----------|------------|--------------------|-----------------|
| H1 | Dead-end state | Opportunity archive guard (§1.1, "active/lost → archived") only covers active and lost stages. A `won` opportunity whose linked project is later `cancelled`/`completed`/`archived` has no defined path to `archived` — it stays a permanently "won, active" record with no housekeeping route. | Opportunity (§1.1) | Extend the archive guard: "`won` (with no active/linked-active project) → `archived`" is allowed. |
| H2 | Dead-end state / BR contradiction | Proposal state machine (§1.2) only allows `draft → archived`. `rejected` and `expired` proposals (both effectively dead states) have no transition to `archived`, contradicting BR-060's premise that proposals are one of the soft-delete-only archivable entity types. | Proposal (§1.2), BR-060 | Add `rejected/expired → archived`. (`accepted` should stay permanently linked per BR-036 — state that exemption explicitly rather than by omission.) |
| H3 | Dead-end state | Payment Milestone (§1.7) allows `cancelled` only from `planned/invoiced/overdue` — **not** from `partially_paid`. A milestone that has received a partial payment but will never be fully collected (client dispute, project cancelled) has no terminal path; it is stuck indefinitely, permanently distorting "pending amount" and margin reports. | Payment Milestone (§1.7), BR-065 (margin), BR-068 | Add `partially_paid → cancelled` (write off remaining balance, cancellation reason mandatory, same as other cancel paths). |
| H4 | Inconsistent guard across sibling entities | Project Phase (§1.5) explicitly blocks `not_started/blocked → in_progress/completed` when the project is not `active` ("O projeto tem de estar ativo para trabalhar nesta fase"). The Task state machine (§1.6) has **no equivalent guard** — nothing stops `todo → in_progress` (or any other task transition) while the parent project is `on_hold`. Two sibling child-entities of the same parent enforce the pause semantics inconsistently. | Project Phase (§1.5), Task (§1.6), BR-042 | Add the same "project must be `active`" guard to Task transitions, or explicitly document (with reasoning) why tasks are exempt from the pause. |
| H5 | Missing precondition in state machine | BR-037 states payment milestones "default from the proposal... the human confirms before the project goes `active`" — implying milestone confirmation is a hard precondition for `planning → active`. But the Project state machine's (§1.3) guard for that exact transition only lists "at least 1 phase and 1 project member assigned" — milestone confirmation is entirely absent from the guard. | Project (§1.3), BR-037 | Add "payment milestones (if any were defaulted from the proposal) reviewed/confirmed" to the `planning → active` guard in §1.3. |
| H6 | Gap in cascade/archive guard | BR-062 blocks company archival only while it has "a non-archived active project or open opportunity." A `won`-but-not-yet-converted opportunity (the exact window AUTO-11 monitors, "won opp with no project after 3 days") is neither an "active project" nor an "open opportunity" (won is terminal), so BR-062 as written would **permit** archiving the company during this window — freezing data BR-035 needs for zero-re-entry conversion. | BR-062 (CRM), Opportunity (§1.1), BR-035 | Extend BR-062's guard to also block archival while any linked opportunity is `won` and not yet converted to a project. |
| H7 | Underspecified permission gate | Permission Matrix (§3): "Create/edit task: ... Membro 👤 (on own projects, **if allowed**)." No BR rule, entity field, or project-level setting anywhere defines what "if allowed" is gated on — same undocumented-per-project-toggle pattern as C3's self-review issue. | Permission Matrix (§3), Task (§1.6) | Either remove the hedge and state a fixed rule (e.g., "any active project member may create tasks on their own project"), or explicitly model the gating field and add a BR for it — don't leave an unbacked conditional in the matrix. |
| H8 | Unenforceable rule term (no backing entity) | BR-065's margin formula subtracts "other recorded costs," but no cost/expense entity exists anywhere in forge-context.md's Data Entities list (no `costs`/`expenses` table). As specified this term of the formula has no data source and cannot be computed. | BR-065 (Financial/Margin) | Either add a minimal cost-entry mechanism (even a manual "other cost" field on `projects`) to the data model, or drop "other recorded costs" from BR-065 for MVP and note the simplification explicitly (margin = contracted value − time-based cost only). |

---

## Medium Issues (Consider for PRD)

| # | Category | Description | Affected Workflows | Recommendation |
|---|----------|------------|--------------------|-----------------|
| M1 | Concurrency / race condition | No optimistic-locking or conflict-detection rule is stated for two users editing the same Task/Opportunity/Project concurrently (e.g., two Gestores dragging the same opportunity card to different stages at once). Only the timer (BR-040, DB unique index) has an explicit concurrency-safe design. | Opportunity, Task, Project (all §1.x) | State a default concurrency policy (e.g., last-write-wins with `updated_at` check, or a version column + 409 on stale write) for at least state-transition endpoints. |
| M2 | Automation scoping gap (specific instance of C4) | AUTO-05 ("Health suggestion recompute — Daily") has no stated exclusion for `completed`/`cancelled`/`archived` projects, even though §1.4 states health is "only meaningful for `planning`/`active`/`on_hold`" projects. | AUTO-05, Project Health (§1.4) | Explicitly scope AUTO-05's daily query to `planning`/`active`/`on_hold` projects only. |
| M3 | Missing atomicity guarantee | Won→project spin-up (BR-035) writes across many entities (project, phases, tasks from template, project_members, payment milestones) but no rule states this must be one atomic DB transaction. A mid-conversion failure (step 3 of 5) could leave an orphaned half-created project with no defined rollback. | BR-035–038, Won→Project Conversion | Add an explicit rule: "Spin-up executes as a single DB transaction; any failure rolls back all writes and the opportunity remains `won`, unconverted." |
| M4 | Missing edge-case rule | Duplicate pending invitations for the same email are not addressed (no uniqueness constraint or guard mentioned in §1.10/BR). | Invitation (§1.10) | Add a guard: creating a new invite for an email with an existing `pending` invite either reuses/refreshes it or is blocked with a clear message. |
| M5 | Under-specified vs. domain research | DOMAIN_RESEARCH Rec.10 ("templates should provide a consistent skeleton with customizable task-level detail") is not backed by any explicit BR in WORKFLOW_SPEC — template flexibility rules are implied only by entity naming (`project_templates`/`template_phases`/`template_tasks`), not stated as a rule. | Project Templates (permission matrix only) | Add a BR clarifying: template phases are fixed at spin-up time but individual template tasks may be added/removed/edited per project without altering the canonical template. |

---

## Low Issues (Nice to have)

| # | Category | Description | Affected Workflows | Recommendation |
|---|----------|------------|--------------------|-----------------|
| L1 | Edge case (time) | No explicit timezone-handling rule for `due_date`/`expected_date` overdue calculations (single-company internal tool likely uses one timezone, but this is undocumented). | Task, Payment Milestone, Milestone, AUTO-01/02/06/08 | State the canonical timezone (likely Europe/Lisbon) used for all "past due" cron comparisons. |
| L2 | Edge case (null/status) | BR-041 only requires a time entry be attributed to a task; nothing blocks starting a timer or logging a manual entry against a task in `done`, `blocked`, or `archived` status. | Time Tracking (BR-040–044), Task (§1.6) | Consider adding a guard: timers/manual entries only permitted on tasks in `todo`/`in_progress`/`in_review` (or explicitly allow post-hoc logging with a note — but state the decision either way). |
| L3 | Cascade housekeeping | Meetings linked to a since-archived opportunity/company/project have no defined handling (still shown as `scheduled`/reschedulable against a dead parent). | Meeting (§1.9) | Low priority; consider surfacing "linked record archived" on the meeting card, no state-machine change required. |
| L4 | Scale/pagination | No workflow rule addresses "many" records (10k+ opportunities/tasks) — pagination/performance is not a workflow-logic defect but should be confirmed as a PRD/architecture concern, not silently assumed. | All list views | Note in PRD as a non-functional requirement, not a workflow gap. |
| L5 | Minor gap | User deactivation (§1.11) reassigns/flags tasks but doesn't address what happens to a Project where the deactivated user was the sole Gestor "owner" of `planning`/`active` transitions (mitigated in practice since Admin retains full access, but not explicitly stated). | User (§1.11), Project (§1.3) | Add a note that Admin always retains override capability over any project regardless of owner status (already implied by matrix, worth stating explicitly next to BR-006). |

---

## State Machine Validation

| Entity | States defined | Reachable | Dead-ends found | Notes |
|---|---|---|---|---|
| Opportunity | 8 (6 stages + won/lost) | 8/8 | 1 (H1: won w/ dead project can't archive) | Otherwise complete; reopen-from-lost well modeled |
| Proposal | 6 | 6/6 | 2 (H2: rejected/expired can't archive) | `draft→archived` only path to archive |
| Project | 6 | 6/6 | 0 | Completion guard depends on undefined "waived" (C2) |
| Project Health | 3 (+ shadow suggested) | 3/3 | 0 | Well-designed auto-suggest/human-confirm split |
| Project Phase | 4 | 4/4 | 0 direct, but no terminal state for cancelled-project phases (C4) | No "waived"/cancelled state defined despite being referenced (C2) |
| Task | 5 | 5/5 | 0 | Best-designed of the set (archivable from any state); C3 contradiction on reviewer role |
| Payment Milestone | 6 | 6/6 | 1 (H3: partially_paid can't reach cancelled) | Compliance boundary (BR-070/073) correctly enforced |
| Milestone | 4 | 4/4 | 0 | Clean, no issues found |
| Meeting | 4 | 4/4 | 0 | `no_show` addition is a reasonable, well-justified deviation |
| Invitation | 4 | 4/4 | 0 | Clean |
| User | 2 | 2/2 | 0 | Last-admin guard correctly modeled (BR-005) |

---

## Business Rule Validation

- Total distinct rule IDs reviewed: 55
- Direct conflicts found: 2 (C3: §1.6 vs. §3 permission matrix; H5: BR-037 vs. §1.3 guard omission)
- Unenforceable/undefined rules found: 2 (C2: "waived" has no backing mechanism; H8: BR-065 "other recorded costs" has no backing entity)
- Rules with a missing cascade: 1 systemic (C4, affecting BR-042 and 5 automations)
- Rules correctly cross-referencing DOMAIN_RESEARCH standards: BR-081 (role-based utilization targets), BR-046 (blocker visibility), BR-071 (milestone completion criteria), BR-070/072/073 (SAF-T boundary), BR-030–032 (auto-suggest/human-confirm health) — all match domain best practice with no issues.

---

## Edge Case Coverage

| Entity | Empty | One | Many | Null | Concurrent | Time | Cascade | Score |
|---|---|---|---|---|---|---|---|---|
| Opportunity | ok | ok | not addressed (L4) | ok (company-exists guard) | not addressed (M1) | not addressed (L1) | H1 gap | 4/7 |
| Proposal | ok | ok | not addressed | ok | not addressed | ok (`valid_until`) | H2 gap | 5/7 |
| Project | ok | ok (last-project edge not applicable) | not addressed | ok | not addressed | ok | C4 CRITICAL gap | 4/7 |
| Task | ok | ok | not addressed | ok | not addressed (M1) | L1/L2 gaps | ok (archivable from any state) | 5/7 |
| Payment Milestone | ok | ok | not addressed | ok | ok (cron-safe) | ok | H3 + C4 gaps | 4/7 |
| User | ok (BR-005 last-admin) | ok | n/a | ok | not addressed | n/a | ok (BR-006) | 6/7 |

---

## Recommendations

1. **Resolve all 4 Critical issues before writing the PRD** — C1 (verbal-close conversion fallback), C2 (define or remove "waived"), C3 (delete the self-review carve-out; matrix is authoritative), C4 (cascade automations off dead projects). These are all targeted rule edits, not architectural rework — estimate a few hours of spec revision, not a redesign.
2. **Fix H1–H3 (dead-end states)** by adding the three missing terminal transitions (opportunity archive from dead-won, proposal archive from rejected/expired, payment-milestone cancel from partially_paid) — each is a one-row addition to its respective transition table.
3. **Fix H4–H7 (consistency gaps)** by aligning Task's pause-guard with Phase's, adding the milestone-confirmation precondition to Project's `planning→active` guard, tightening BR-062's archive guard, and removing the unbacked "if allowed" hedge in the permission matrix.
4. **Decide H8's scope** (drop "other recorded costs" from BR-065 for MVP, or add a minimal cost-entry mechanism) — this is a scope decision for the PRD author, not something the validator can resolve unilaterally.
5. **Medium/Low issues (M1–M5, L1–L5) can be carried into the PRD as documented follow-ups** rather than blocking — none of them contradict another rule or break a critical flow; they are gaps in an otherwise coherent design.
