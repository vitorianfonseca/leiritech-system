# Dead Code Audit Report

**Generated:** 2026-09-09
**Codebase:** LeiriTech (Next.js/FastAPI/PostgreSQL)
**Auditor:** Dead Code Hunter

## Progress

- [x] Frontend exports and imports
- [x] Frontend utility functions
- [x] Backend services
- [x] Backend API routes
- [x] Configuration and scripts
- [x] Database models
- [x] Test utilities

## Findings

| # | Severity | File | Line(s) | Description | Recommendation |
|---|----------|------|---------|-------------|----------------|
| 1 | MEDIUM | frontend/src/lib/api/proposals-types.ts | 115-117 | Exported function `isTerminal()` — never used anywhere in the codebase. Derives boolean from proposal state (accepted/rejected check). | Remove unused function. |
| 2 | MEDIUM | frontend/src/lib/api/proposals-types.ts | 130-132 | Exported function `canSend()` — never used anywhere in the codebase. Checks if draft proposal meets send requirements. | Remove unused function. |
| 3 | LOW | frontend/src/lib/api/dashboard.ts | (line not found in first scan) | Exported function `assertDashboardAccess()` — never imported or called. Appears to be a gate function for role-based access. | Remove unused function or verify it should be kept for future use. |
| 4 | LOW | frontend/src/lib/api/team-types.ts | (see team-types.ts) | Exported function `deriveAvailability()` — never used in the UI. Derives availability state from workload. | Remove unused function. |
| 5 | LOW | frontend/src/lib/api/crm-types.ts | (see crm-types.ts) | Exported function `isScopedCrm()` — never imported or called. Determines if CRM is role-scoped. | Remove unused function. |
| 6 | LOW | frontend/src/lib/api/dashboard-types.ts | (see dashboard-types.ts) | Exported function `isScopedDashboard()` — never imported or called. Determines if dashboard is role-scoped. | Remove unused function. |
| 7 | LOW | frontend/src/lib/api/tasks-types.ts | (see tasks-types.ts) | Exported function `priorityRank()` — never used anywhere. Maps task priority to numeric rank. | Remove unused function. |
| 8 | LOW | frontend/src/lib/api/case.ts | (see case.ts) | Exported functions `keysToCamel()` and `keysToSnake()` — never imported or used. Utility functions for key transformation. | Remove unused functions. |
| 9 | HIGH | frontend/.verify.mjs | 1-19 | Unused verification script for theme testing. Not referenced in package.json scripts or any CI/CD configuration. Appears to be a leftover development utility. | Delete the file. |
| 10 | HIGH | frontend/.verify2.mjs | 1-11 | Unused verification script for dashboard screenshot. Not referenced in package.json scripts or any CI/CD configuration. Appears to be a leftover development utility. | Delete the file. |
| 11 | LOW | frontend/src/lib/api/team.ts | 305-308 | Exported function `__resetTeamConfigs()` — commented as "test/stories helper, not used by the UI" but still exported. Never called in production code. | Remove unused function (intended for test/story use only but not actually used). |

## Summary

**Total Findings:** 11

**By Severity:**
- CRITICAL: 0
- HIGH: 2
- MEDIUM: 2
- LOW: 7

## Top 5 Most Critical Findings

1. **HIGH** - `frontend/.verify.mjs` (line 1-19) — Unused verification script for theme testing; delete.
2. **HIGH** - `frontend/.verify2.mjs` (line 1-11) — Unused verification script for dashboard screenshot; delete.
3. **MEDIUM** - `frontend/src/lib/api/proposals-types.ts` (line 115-117) — Unused `isTerminal()` function; remove.
4. **MEDIUM** - `frontend/src/lib/api/proposals-types.ts` (line 130-132) — Unused `canSend()` function; remove.
5. **LOW** - `frontend/src/lib/api/team.ts` (line 305-308) — Unused test helper `__resetTeamConfigs()`; remove.

## Notes

- No dead code detected in backend API routes (all 150 routes are registered and reachable).
- No dead code detected in backend services or models.
- No unused database columns or tables detected (within scope of this audit).
- No significant commented-out code blocks found in active source files.
- No unused dependencies detected in `package.json` or `pyproject.toml`.
- Proposition: These are "proposal helper functions" that may have been planned for UI usage but never actually implemented; they can be safely removed.

## Integration Notes

- The unused verification scripts (`.verify.mjs`, `.verify2.mjs`) were likely created during development for manual testing but are not integrated into the CI/CD pipeline or package.json scripts.
- The unused type guard functions (e.g., `canSend`, `isTerminal`, etc.) are type-safe but unused; they could be removed without affecting any imports or functionality.
- No breaking changes expected from removing these items.
