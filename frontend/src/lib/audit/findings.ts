/**
 * Static snapshot of the forge-audit CRITICAL/HIGH findings (see
 * /AUDIT_REPORT.md at the repo root for the full report + MEDIUM/LOW items).
 * Powers the internal Settings -> Auditoria page so an Admin can review each
 * finding and file/track a real GitHub issue for it without leaving the app.
 *
 * `fixed: true` items were resolved in the same session the audit ran in —
 * kept here (not deleted) so the page still shows them as a resolved record,
 * consistent with how GitHub itself keeps closed issues visible.
 */

export type AuditSeverity = "critical" | "high";

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  summary: string;
  fixed: boolean;
}

export const AUDIT_FINDINGS: AuditFinding[] = [
  { code: "C1", severity: "critical", fixed: true, summary: "BR-008 violation: ProjectResponse leaked contracted_value/hours_budget/internal_cost_rate to any authenticated role via GET /projects." },
  { code: "C2", severity: "critical", fixed: true, summary: "Attachment upload had no MIME allowlist and no size cap — content_type/size_bytes were fully client-controlled." },
  { code: "C3", severity: "critical", fixed: true, summary: "Logout only navigated to /login — never called the logout endpoint, so sessions and refresh tokens were never revoked server-side." },
  { code: "C4", severity: "critical", fixed: true, summary: "No frontend deployment configuration existed — no Dockerfile, no railway.json, no deploy workflow." },
  { code: "C5", severity: "critical", fixed: true, summary: "No CI/CD workflows existed at all — no automated tests, builds, or deploys." },
  { code: "C6", severity: "critical", fixed: true, summary: "Email delivery was stubbed — even with RESEND_API_KEY set, the service only logged instead of calling the Resend API." },
  { code: "C7", severity: "critical", fixed: true, summary: "Catalog archive fired immediately with zero confirmation, unlike every other entity." },
  { code: "C8", severity: "critical", fixed: true, summary: "Proposal PDF upload/download was a non-functional stub — nothing persisted, and download pointed at a fake domain." },
  { code: "C9", severity: "critical", fixed: true, summary: "BR-035's required 422 guard for a missing contracted_value on a verbal-close won→project conversion did not exist anywhere in the backend." },
  { code: "C10", severity: "critical", fixed: true, summary: "Project templates: only bare list/create reached the backend. Detail/update/delete and all phase/task editing were 100% frontend-mock." },
  { code: "C11", severity: "critical", fixed: true, summary: "The Meeting entity had a DB model but zero CRUD API — 'log a meeting' faked it as a plain interaction row." },
  { code: "C12", severity: "critical", fixed: true, summary: "Task checklist existed as a DB table with no API at all — 100% frontend-mock, non-persistent." },
  { code: "C13", severity: "critical", fixed: true, summary: "Task archive/restore/duplicate had no backend routes at all, breaking BR-060 specifically for tasks." },
  { code: "C14", severity: "critical", fixed: true, summary: "Double-submit on 'Converter em projeto' could create two separate projects for one won opportunity — no unique constraint." },
  { code: "C15", severity: "critical", fixed: true, summary: "BR-005 last-Admin guard had no row lock — two concurrent deactivations could leave zero active Administrators." },
  { code: "C16", severity: "critical", fixed: true, summary: "Concurrent 'won' + 'lost' on the same opportunity could both pass the terminal-state guard, achieving the forbidden won→lost transition." },
  { code: "C17", severity: "critical", fixed: true, summary: "Project cancellation should be financially gated (grant) but routed through the ordinary owner check — any owning Gestor could cancel with no grant." },
  { code: "H1", severity: "high", fixed: true, summary: "Rate limiting existed only on /auth/login — password/forgot, password/reset and both invitation endpoints were unthrottled." },
  { code: "H2", severity: "high", fixed: true, summary: "CORS allow_methods/allow_headers were wildcarded, unnecessarily broad for an internal invite-only tool." },
  { code: "H3", severity: "high", fixed: true, summary: "The test suite's shared hardcoded password had no guard against accidentally running against a shared/staging database." },
  { code: "H4", severity: "high", fixed: true, summary: "No constraint prevented more than one proposal per opportunity reaching 'accepted' simultaneously." },
  { code: "H5", severity: "high", fixed: true, summary: "The Reports page never called the backend's report endpoints — it reimplemented the analytics layer client-side, already diverged from the backend." },
  { code: "H6", severity: "high", fixed: true, summary: "Direct consequence of H5: the frontend's margin calculation omitted labour cost entirely, showing an inflated margin." },
  { code: "H7", severity: "high", fixed: true, summary: "parseEuroToCents() was implemented independently 3 times; one version silently turned invalid input into €0.00 instead of failing validation." },
  { code: "H8", severity: "high", fixed: false, summary: "project_service.py is a god-service mixing ≥5 responsibilities (CRUD, lifecycle, health, membership, templates/conversion) — deferred, no functional bug." },
  { code: "H9", severity: "high", fixed: true, summary: "Contact had zero Create/Edit/Archive UI anywhere despite the spec requiring 'Contact CRUD'." },
  { code: "H10", severity: "high", fixed: true, summary: "Company creation had two independent, fully-built implementations (a modal and a full page)." },
  { code: "H11", severity: "high", fixed: true, summary: "No consistent dialog-vs-page rule for entity creation across the app — now documented in DESIGN.md." },
  { code: "H12", severity: "high", fixed: true, summary: "'Edit' existed for Company/Catalog but not Opportunity/Proposal — resolved as an intentional, documented lock behind lifecycle actions." },
  { code: "H13", severity: "high", fixed: true, summary: "Task side-panel timer Start switched the active timer with no confirmation, unlike the other two entry points." },
  { code: "H14", severity: "high", fixed: true, summary: "BR-020 win-probability editing worked on the backend but was unreachable from the UI due to a stage code/UUID key mismatch." },
  { code: "H15", severity: "high", fixed: true, summary: "'Manage roles' was non-functional end to end — role changes were written only to a local in-session map." },
  { code: "H16", severity: "high", fixed: true, summary: "BR-081 role-dependent utilization targets had no backend surface at all — Settings → Capacity edits were mock-only." },
  { code: "H17", severity: "high", fixed: true, summary: "Every Settings → Export button downloaded a CSV of headers-only placeholder rows but showed a real-export success toast." },
  { code: "H18", severity: "high", fixed: true, summary: "Six check-then-insert races degraded to unhandled 500s instead of clean 409s under concurrency." },
  { code: "H19", severity: "high", fixed: true, summary: "A phase with zero tasks satisfied the completion check vacuously — 'Concluir fase' succeeded instantly with no work ever recorded." },
  { code: "H20", severity: "high", fixed: true, summary: "Two unused, untracked ad-hoc Playwright verification scripts were left in the repo root." },
  { code: "H21", severity: "high", fixed: true, summary: "Time entries were ended via a direct call instead of routing through the time service for consistent rounding." },
];
