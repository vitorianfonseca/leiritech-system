# Aurea System — build resume notes

**Paused**: 2026-07-16 ~19:05 WEST — Anthropic account session limit (resets 21:00 Lisbon).
**Phase**: forge frontend build (Phase 1). `forge-state.json` phase is still `ready` (do NOT
mark `frontend-review` until all 20 issues done + final gates pass).

## Frontend: 12 of 20 issues DONE (committed, gates clean, pushed to origin/master)

#25 auth · #7 shared lib · #40 comments/activity · #27 My Work+timer · #36 calendar ·
#38 finance (gated) · #33 templates · #26 dashboard · #28 CRM · #29 pipeline ·
#30 proposals · #32 projects. HEAD of clean work = `533bfbb`.

## WIP commit `be6a40c` (compiles, INCOMPLETE)
- #39 notifications: components only (`src/components/notifications/`, `src/lib/api/notifications.ts`)
  — NEEDS `/notifications` route page + wire the shell notifications dropdown.
- #34 tasks: components only (`src/components/tasks/`, `src/lib/api/tasks.ts`)
  — NEEDS `/tasks` route (Lista/Kanban/Calendário) + side panel + timer integration + states.
- Reviewer verified the API/gating logic for both is correct (C3/BR-049, BR-002, H4, H7, BR-045, BR-008).

## Remaining to build (after 21:00 reset)
1. Finish #34 + #39 (routes + wiring) from `be6a40c` → proper commits.
2. Build sequentially, push after each: #35 time-tracking UI, #31 won→project conversion wizard,
   #37 team + workload, #41 reports + CSV, #42 settings, #43 profile.
3. Final code-reviewer pass (`builders_done`) + dedup findings; arch-reviewer; visual gate
   (read screenshots); test-runner (build+tsc+lint+smoke).
4. Set `forge-state.json` phase → `frontend-review`; log; then `/forge:approve` → `/forge:build-backend`.

## Open findings (GitHub issues)
#55 theme-toggle dark hydration mismatch (shell) · #56 Membro Contactos nav gap ·
#57 CRM↔pipeline opportunity taxonomy + cliente-ativo derivation (integration) ·
#58 branded/i18n not-found.tsx. Code-reviewer batched ~5 LOW for one end-of-phase issue.

## Build mechanics that worked
- Drive ONE `app-forge-teams:frontend-builder` per issue SYNCHRONOUSLY; commit (builder) →
  I verify tree clean → `git push` → next. Avoids shared-tree races + orphaned dev servers.
- The `build-team-lead` orchestrator spun without progress and raced the tree — do NOT use it.
- Builders must start their dev server on a FREE port and kill it before returning.
- Contract to pass every builder: consume foundation (DESIGN.md tokens, (app) route group,
  getSession stub, next-intl pt-PT+en parity, no fiscal terms, @base-ui not Radix, await params),
  Playwright CLI only, don't touch shell/foundation files (flag instead).
