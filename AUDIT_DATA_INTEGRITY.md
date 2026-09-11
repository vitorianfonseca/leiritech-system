# Data Integrity Audit — LeiriTech

Auditor: data-integrity-auditor (forge-audit team)
Scope: backend/app/models/*, backend/alembic/versions/*, backend/app/services/*, backend/app/repositories/*, backend/app/database/*, backend/app/automations/*

## Progress
- [x] Schema extraction (7 migrations, 11 model files)
- [x] Model ↔ migration cross-reference
- [x] Foreign key / ON DELETE policy audit
- [x] Index audit (PRD §6 required indexes)
- [x] Unique-constraint audit
- [x] Transaction boundary audit (request-scoped session, automations, explicit commits)
- [x] Race-condition audit (timer, check-then-insert unique patterns)
- [x] BR-040/041/045/047/060/070 spot checks

## Summary

Overall the schema is well-designed: naming conventions are deterministic, the
BR-040 single-timer rule is enforced with a real partial unique index (not just
an app check), `payment_milestones` correctly has no fiscal/tax fields, the
required composite/trigram indexes from PRD §6 are all present, and no
application code ever hard-deletes a BR-060 soft-delete entity (companies,
opportunities, projects, tasks, proposals) — soft-delete is respected in
practice. The main gaps are: (1) `ON DELETE CASCADE` used on children of
soft-delete-only parents, which contradicts the "RESTRICT per soft-delete
philosophy" implied by BR-060 and is a latent mass-data-loss risk if anything
ever hard-deletes a parent; (2) no uniqueness guarantee (DB or app) for
"one project per won opportunity" and "one accepted proposal per opportunity",
both of which the app's own business rules and automations assume; and (3) a
class of check-then-insert races on unique constraints (project members, task
assignees, task dependencies, pipeline stage codes, proposal references) that
degrade to unhandled 500s instead of clean 409s under concurrency — the DB
constraint itself prevents corruption, but only the timer path got the
IntegrityError→409 treatment.

## Findings

| # | Severity | File | Line(s) | Description | Recommendation |
|---|----------|------|---------|-------------|----------------|
| 1 | HIGH | backend/app/services/project_service.py | 745-815 (`create_from_opportunity`) | No uniqueness guard for "one project per won opportunity": `projects.opportunity_id` has no unique/partial-unique constraint, and the service never checks whether a project already links the opportunity before creating a new one. A double-submit or two concurrent conversions produce two `projects` rows both pointing at the same `opportunity_id`, both flipping the company to `active`, corrupting reporting/AUTO-11 (`won_without_project`, which itself assumes a 1:1 link — `backend/app/automations/won_without_project.py:36-47`). | Add a partial unique index `CREATE UNIQUE INDEX ON projects(opportunity_id) WHERE opportunity_id IS NOT NULL AND archived_at IS NULL`, and/or an explicit check in `create_from_opportunity` that raises 409 `OPPORTUNITY_ALREADY_CONVERTED` if a project already references it. |
| 2 | HIGH | backend/app/services/proposal_service.py | `accept_proposal` (~355-378); backend/app/repositories/pipeline.py:142-153 (`accepted_proposal`) | No constraint (DB or app) prevents more than one `proposal` for the same `opportunity_id` reaching status `accepted` simultaneously. `pipeline_repo.accepted_proposal` silently picks "most recent by `created_at`", masking the inconsistency instead of surfacing it. `create_from_opportunity` then uses whichever one is "most recent" for `contracted_value`, so two proposals racing to `accepted` can non-deterministically pick the wrong contract value. | Add a partial unique index `CREATE UNIQUE INDEX ON proposals(opportunity_id) WHERE status='accepted'`, and have `accept_proposal` reject (409) if another accepted proposal already exists for the same opportunity. |
| 3 | MEDIUM | backend/app/models/task.py:40-41; backend/app/models/project.py (project_phases, milestones); backend/app/models/finance.py:26-27,60-61 | `tasks.project_id`, `project_phases.project_id`, `milestones.project_id`, `payment_milestones.project_id`, `project_costs.project_id` all use `ON DELETE CASCADE` back to `projects`, but `projects` is a BR-060 soft-delete-only entity that application code never hard-deletes (confirmed — no `db.delete(Project(...))` anywhere). If any future admin tooling, manual `psql` cleanup, or a bug ever issues a real `DELETE FROM projects`, every task, phase, milestone, payment milestone and cost line for that project silently disappears with no audit trail entry (activity_logs is not itself protected by the cascade). This is the opposite of the "RESTRICT per soft-delete philosophy" the PRD data model implies. | Change these FKs from `CASCADE` to `RESTRICT` (or `NO ACTION`) so a stray hard delete fails loudly instead of cascading data loss; soft-delete (`archived_at`) is the only sanctioned deletion path. Same pattern applies to `interactions`/`meetings` → `companies`/`opportunities`/`contacts`/`projects` in crm.py (mostly `SET NULL`, but `interactions.company_id`/`contact_id`/`opportunity_id`/`project_id` are `CASCADE` — crm.py:219-229). |
| 4 | MEDIUM | backend/app/services/project_service.py:536-570 (`add_member`); backend/app/services/task_service.py:539-592 (`add_dependency`); backend/app/services/opportunity_service.py:83-99 (`create_stage`); backend/app/services/proposal_service.py:193-206 (`create_proposal`, reference uniqueness) | Classic check-then-insert races: each does a `SELECT` to verify no duplicate exists (`uq_project_member`, `uq_task_dependency`, `pipeline_stages.code` unique, `proposals.reference` unique) and then `INSERT`s without wrapping in `db.begin_nested()`/catching `IntegrityError`. Under concurrent requests the DB constraint still blocks the duplicate row (no corruption), but the second request gets an unhandled `IntegrityError` that falls through to the global `Exception` handler in `backend/app/main.py:86-94`, returning a generic 500 `INTERNAL_ERROR` instead of the intended 409. Only `time_service.start_timer` (backend/app/services/time_service.py:107-116) does this correctly. | Apply the same pattern used in `start_timer` (nested transaction + catch `IntegrityError` → domain-specific `errors.conflict(...)`) to every check-then-insert path backed by a unique constraint, or add a targeted `IntegrityError` handler in `main.py` that maps unique-violation `sqlstate 23505` to 409 as a backstop. |
| 5 | MEDIUM | backend/app/api/routes/attachments.py:50-87 (`create_upload_url`) | The `Attachment` row (with its `r2_key`) is committed to the DB *before* the client actually uploads the file to R2 via the presigned URL. If the client never completes the upload (closed tab, network failure, presigned URL expiry), the `Attachment` row is a permanent orphan pointing at an object that was never written to storage — `list_attachments`/`download-url` will return metadata for a file that 404s in R2. No automation job (`backend/app/automations/*`) reconciles or garbage-collects unconfirmed attachments. | Either (a) do not persist the `Attachment` row until an explicit "upload complete" callback/confirmation endpoint is called, or (b) add a `confirmed_at`/`status` column plus a daily automation that purges `Attachment` rows older than N hours with no confirmation. |
| 6 | LOW | backend/app/services/comment_service.py:172,212,240 | `create_comment`/`update_comment`/`delete_comment` call `db.commit()` explicitly inside the service layer, breaking the single request-scoped transaction boundary established by `get_db()` (backend/app/database/session.py:28-38), which already commits once at the end of every request and rolls back the whole request on any exception. Because these paths commit mid-request, any code that runs after them in the same request (e.g. router-level post-processing, or a future call chained after `create_comment`) can no longer be rolled back atomically with the comment/mentions/notifications just written. Today it's harmless (comment endpoints do nothing else afterward), but it's an inconsistent transaction pattern that will bite the first time another write is added after these calls. | Remove the explicit `db.commit()` / `db.refresh()` calls from the service layer and let `get_db()` own the commit boundary, matching every other service in the codebase (`opportunity_service`, `task_service`, `project_service`, `finance_service`, `time_service`, none of which call `.commit()`). |
| 7 | LOW | backend/app/models/task.py:68-82 (`TaskAssignee`), backend/app/models/__init__.py | The `task_assignees` table (with its own `uq_task_assignee` unique index and two FKs) has no application write path — the only writers are `backend/app/database/seed_rich.py` (seed data). All real task-assignment traffic goes through `tasks.primary_assignee_id` (single assignee). The table + constraints + indexes exist in every environment but are exercised only by seeds, i.e. a fully-migrated but functionally dead schema object. (Flagging for data-integrity completeness; dead-code-hunter's `AUDIT_DEAD_CODE.md` may cover the app-layer angle separately.) | Either wire up a real multi-assignee feature against this table, or drop it in a migration if multi-assignee is not planned, to avoid maintaining FK/index overhead for an unused relation. |
| 8 | LOW | backend/app/models/task.py:96-109 (`TaskDependency`) / backend/app/services/task_service.py:516-571 (`_would_create_cycle`) | BR-045/047 no-cycle enforcement is app-level only (in-memory DFS over `project_dependency_edges`), which is expected since cycles cannot be expressed as a SQL CHECK constraint. This is a correctly-scoped design (verified: `backend/tests/test_tasks.py` covers cycle rejection), but it does mean two concurrent `add_dependency` calls that are each individually acyclic but jointly cyclic (e.g. A→B and B→A submitted at the same instant) are not protected by any DB-level guard — only the app's read-then-check-then-insert step, which is not itself locked (no `SELECT ... FOR UPDATE` on the project's task graph). Low likelihood in practice (requires two racing requests on the same project's dependency graph) but worth noting given the explicit ask. | Acceptable as-is given SQL cannot enforce acyclicity, but consider a project-scoped advisory lock (`pg_advisory_xact_lock(hashtext(project_id))`) around the read-check-insert in `add_dependency` to close the race window. |

## Confirmed-clean areas (no findings)

- **BR-040** (single active timer): real partial unique index `uq_time_entries_active_per_user` on `time_entries(user_id) WHERE ended_at IS NULL` (backend/app/models/time_entry.py:24-29, migration line 617) backed by an `IntegrityError`→409 catch in `start_timer` — correctly atomic, not just app-level.
- **BR-041** (time entry FK NOT NULL): `time_entries.task_id` is `nullable=False` with `ForeignKey("tasks.id", ondelete="CASCADE")` (time_entry.py:36-39).
- **BR-060** (soft-delete only): grepped every `db.delete(...)` call in `app/services/*` — only `ProjectMember`, `TaskDependency`, `ProjectCost`, `Comment`, `TimeEntry` are ever hard-deleted; none of `companies/opportunities/projects/tasks/proposals` are hard-deleted anywhere in application code.
- **BR-070** (`payment_milestones` no fiscal fields): schema has `external_invoice_ref` (explicitly documented as "neutral, non-fiscal") and no tax/invoice-number/VAT columns — compliant.
- **Required indexes (PRD §6)**: `ix_opportunities_stage_owner (stage_id, owner_id)`, `ix_tasks_project_status_due (project_id, status, due_date)`, `ix_notifications_user_read (user_id, read_at)`, and the trigram GIN indexes for companies/contacts/opportunities/projects/tasks/catalog_items/proposals.reference/interactions.body all exist and match the migrations.
- **Automations transaction isolation**: `backend/app/automations/run.py` correctly runs each job in its own session/commit so one failing automation doesn't roll back or block the others.

## Findings by severity
- CRITICAL: 0
- HIGH: 2
- MEDIUM: 3
- LOW: 3
- **Total: 8**
