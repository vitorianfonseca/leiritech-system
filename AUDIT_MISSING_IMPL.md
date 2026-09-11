# Missing Implementation Audit Report

**Generated**: 2026-09-09  
**Auditor**: Missing Implementation Auditor  
**Status**: Complete

---

## Progress

- [x] TODO/FIXME/HACK/XXX comments
- [x] Empty function handlers
- [x] Stub implementations
- [x] API route validation
- [x] Error handling patterns
- [x] Database migrations
- [x] Deployment configuration
- [x] Testing coverage

---

## Summary

| Category | Count |
|----------|-------|
| **CRITICAL** | 4 |
| **HIGH** | 3 |
| **MEDIUM** | 5 |
| **LOW** | 2 |
| **TOTAL** | 14 |

---

## Detailed Findings

| # | Severity | File | Line(s) | Description | Recommendation |
|---|----------|------|---------|-------------|----------------|
| 1 | CRITICAL | backend/app/services/email_service.py | 25-28 | Email delivery not implemented — when RESEND_API_KEY is set, only logs instead of posting to Resend API. Production emails will not be sent. | Complete the Resend API integration to actually send emails |
| 2 | CRITICAL | backend/app/api/routes/attachments.py, backend/app/schemas/attachments.py | 45-82, 11-16 | Missing MIME type validation — presign_upload trusts client-supplied content_type without allowlist; no file size cap enforcement | Add MIME type validation (allowlist), enforce maximum file size limit in schema and handler |
| 3 | CRITICAL | frontend/ | N/A | Frontend deployment configuration missing — no Dockerfile, no railway.json config, no CI workflow for frontend deployment | Create frontend/Dockerfile, add railway.json, create .github/workflows/deploy-frontend.yml |
| 4 | CRITICAL | .github/ | N/A | No CI/CD workflows exist — no automated testing, builds, or deployment pipelines configured | Create .github/workflows/ with tests.yml, build.yml, and deploy.yml for backend and frontend |
| 5 | HIGH | backend/app/main.py | 36-42 | CORS misconfigured — allow_methods=["*"] and allow_headers=["*"] grant overly broad CORS access; security audit not done | Restrict CORS to specific origins, methods, and headers; document security rationale |
| 6 | HIGH | backend/app/api/routes/auth.py | 37-40 | Rate limiting only on /auth/login — per-IP and per-account limiters exist only for login, but other sensitive endpoints (password reset, invitations) lack rate limiting | Add rate limiting middleware to password reset and invitation endpoints to prevent abuse |
| 7 | HIGH | backend/app/services/user_service.py | 117 | TODO: route through time service for rounding — time entries are ended with direct _now() call instead of delegating to a time service for consistent rounding | Implement time service abstraction and route all time entry closures through it |
| 8 | MEDIUM | backend/tests/ | N/A | Horizontal-access and enumeration integration tests incomplete — test_permissions.py has unit tests but lacks integration tests verifying that users cannot enumerate/access entities outside their scope across all endpoints | Add integration test suite for BR-002 (horizontal-access) covering CRM, projects, tasks, and proposals |
| 9 | MEDIUM | backend/tests/ | N/A | Financial-data access restriction tests partial — test_reports.py covers financial gate on reports but tests don't verify that non-granted users cannot access financial milestones, costs, or payment endpoints | Add tests verifying financial access gates on all finance endpoints (/finance/payment-milestones, /finance/project-costs, etc.) |
| 10 | MEDIUM | frontend/ | N/A | No frontend unit tests — no vitest or jest configuration; no unit test suite exists for React components, hooks, or utilities | Set up vitest/jest, create unit test configuration, add test coverage for critical components |
| 11 | MEDIUM | frontend/tests/e2e/ | N/A | E2E test coverage sparse — only smoke.spec.ts exists covering basic flows; missing 24+ critical workflows per spec | Expand E2E smoke tests to cover all 25 critical flows from WORKFLOW_SPEC.md |
| 12 | LOW | backend/app/services/email_service.py | 1-6 | Email service lacks real provider integration — stubbed with logging only even when RESEND_API_KEY is configured; README and docs should note this limitation | Document the email delivery stub limitation; link to the implementation issue |
| 13 | LOW | backend/app/schemas/attachments.py | 15-16 | Attachment size validation only one-sided — size_bytes has ge=0 but no upper limit; no guidance on realistic max file size (no comment or constant) | Add MAX_ATTACHMENT_SIZE_BYTES constant and document rationale |
| 14 | LOW | backend/app/core/rate_limit.py | N/A | Rate limiting is process-local only — SlidingWindowRateLimiter does not work across multiple processes/instances; multi-instance deployments (e.g., on Railway) will have bypassed limits | Consider redis-backed rate limiting for multi-instance deployments; document the limitation |

---

## Issue Cross-Reference (from forge-state.json)

- **Issue 4**: Railway/frontend deploy config incomplete → **Findings #3, #4**
- **Issue 47**: presign_upload validation gaps → **Finding #2**
- **Issue 48**: CORS and rate limiting partial → **Finding #5, #6**
- **Issue 49**: Horizontal-access tests not written → **Finding #8**
- **Issue 50**: Financial-access tests not written → **Finding #9**
- **Issue 53**: Frontend unit tests missing → **Finding #10**
- **Issue 54**: E2E test coverage incomplete → **Finding #11**

---

## Top 5 Critical Findings

1. **Email delivery stubbed** (backend/app/services/email_service.py:25) — Production emails will not send; Resend API integration incomplete
2. **Upload validation missing** (backend/app/schemas/attachments.py, routes/attachments.py) — Client can specify arbitrary MIME types and large file sizes without validation
3. **Frontend deployment config missing** (frontend/) — No Dockerfile or deployment configuration; cannot deploy frontend to Railway or other platforms
4. **No CI/CD workflows** (.github/) — No automated testing, builds, or deployment pipelines; manual deployments only
5. **CORS over-permissive** (backend/app/main.py:36-42) — Misconfigured CORS allows any method/header; security audit not completed

---

## Audit Methodology

- Scanned cache files: todos.txt, empty-handlers.txt, api-routes.txt, api-calls.txt, forms.txt
- Verified all 2 TODO/FIXME comments in source code
- Checked schema validation on critical endpoints (attachments, auth, finance)
- Verified auth decorators on route handlers
- Checked for deployment and CI/CD configuration
- Reviewed test coverage (unit, integration, E2E)
- Cross-referenced against forge-state.json known issues

---

## Notes

- Test files for hardcoded credentials (PASSWORD = "correct-horse-battery") are legitimate test fixtures, not security issues
- All route handlers have proper auth checks (CurrentUser or RequireAdmin decorators)
- No missing database migrations detected
- No unimplemented functions with NotImplementedError found
- Email service is acknowledged as stubbed in inline documentation (line 1-6)
