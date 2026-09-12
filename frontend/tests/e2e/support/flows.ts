/**
 * WORKFLOW_SPEC §4.4 — "The 25 critical flows" coverage map (issue #54).
 *
 * This table is the machine-readable contract between the spec and the suite.
 * Every test in `tests/e2e/specs/**` is titled with a `flow(n)` prefix, so the
 * Playwright report can be audited line-by-line against §4.4.
 *
 * `state` is deliberately honest:
 *   "covered"  — the flow is driven end to end against the real backend.
 *   "partial"  — the reachable part is driven; the rest is out of reach in this
 *                environment and the reason is recorded here and in the spec.
 *   "blocked"  — the product does not currently support the flow. The test is
 *                written against the INTENDED behaviour and marked `test.fixme`
 *                so it reports as skipped instead of fake-passing.
 */

export type FlowState = "covered" | "partial" | "blocked";

export interface CriticalFlow {
  readonly n: number;
  readonly title: string;
  /** Persona the spec assigns to the flow — drives the role fixture we use. */
  readonly persona: string;
  readonly spec: string;
  readonly state: FlowState;
  /** Why a flow is only partial/blocked. Empty for fully covered flows. */
  readonly note?: string;
}

export const CRITICAL_FLOWS: readonly CriticalFlow[] = [
  {
    n: 1,
    title: "Login / logout",
    persona: "all",
    spec: "specs/01-auth-session.spec.ts",
    state: "covered",
  },
  {
    n: 2,
    title: "Password reset",
    persona: "all",
    spec: "specs/01-auth-session.spec.ts",
    state: "partial",
    note: "Request + invalid-token rejection are driven. Consuming a real reset link needs the Resend email, and there is no mail sink in this environment.",
  },
  {
    n: 3,
    title: "Invite / accept",
    persona: "Admin / Gestor(grant)",
    spec: "specs/01-auth-session.spec.ts",
    state: "partial",
    note: "Sending an invite and rejecting a bad token are driven. Accepting needs the tokenised link from the invitation email (no mail sink).",
  },
  {
    n: 4,
    title: "Refresh token / session",
    persona: "all",
    spec: "specs/01-auth-session.spec.ts",
    state: "covered",
  },
  {
    n: 5,
    title: 'Dashboard "Atenção necessária"',
    persona: "all",
    spec: "specs/02-hubs.spec.ts",
    state: "covered",
  },
  {
    n: 6,
    title: '"O meu trabalho" hub',
    persona: "Membro",
    spec: "specs/02-hubs.spec.ts",
    state: "covered",
  },
  {
    n: 7,
    title: "Create company",
    persona: "Gestor+",
    spec: "specs/03-crm.spec.ts",
    state: "covered",
  },
  {
    n: 8,
    title: "Add contacts",
    persona: "Gestor+",
    spec: "specs/03-crm.spec.ts",
    state: "blocked",
    note: "PRODUCT BUG: contact-form-dialog makes 'Responsável interno' required and fills it from the hardcoded CRM_OWNERS mock (src/lib/api/crm.ts:101), whose ids are slugs, so POST /contacts always fails 422 uuid_parsing and the dialog swallows the error. The create test is a fixme; the read half (a company lists its contacts) is covered.",
  },
  {
    n: 9,
    title: "Log interaction / meeting",
    persona: "Gestor+ / Membro",
    spec: "specs/03-crm.spec.ts",
    state: "partial",
    note: "Logging an interaction is driven end to end. Meetings have no creation surface anywhere in the product — the calendar is a read-only projection (§5) — so the meeting half has nothing to drive.",
  },
  {
    n: 10,
    title: "Create opportunity",
    persona: "Gestor+",
    spec: "specs/04-pipeline.spec.ts",
    state: "blocked",
    note: "PRODUCT BUG: create-opportunity-dialog feeds the Responsável combobox from the hardcoded PIPELINE_OWNERS mock (ids like 'u-diogo'), so POST /opportunities fails 422 uuid_parsing and the dialog swallows the error. Written as test.fixme against the intended behaviour.",
  },
  {
    n: 11,
    title: "Move opportunity across pipeline",
    persona: "Gestor+",
    spec: "specs/04-pipeline.spec.ts",
    state: "covered",
  },
  {
    n: 12,
    title: "Set próxima ação (BR-010)",
    persona: "Gestor+",
    spec: "specs/04-pipeline.spec.ts",
    state: "covered",
  },
  {
    n: 13,
    title: "Mark won",
    persona: "Gestor+",
    spec: "specs/04-pipeline.spec.ts",
    state: "partial",
    note: "The won confirmation and its pre-'Proposta enviada' advisory (BR-013) are driven. The commit itself is not fired: 'ganha' is terminal for an opportunity that already owns a project, so committing would make the run non-repeatable against the shared dev database.",
  },
  {
    n: 14,
    title: "Mark lost + reason (BR-011)",
    persona: "Gestor+",
    spec: "specs/04-pipeline.spec.ts",
    state: "partial",
    note: "The mandatory-reason gate is driven (submitting without a motivo is blocked). The commit is not fired, for the same terminal-state reason as flow 13.",
  },
  {
    n: 15,
    title: "Create / send proposal (BR-025)",
    persona: "Gestor+",
    spec: "specs/05-proposals.spec.ts",
    state: "covered",
  },
  {
    n: 16,
    title: "Proposal decision (accept / reject / expire)",
    persona: "Gestor+ / System",
    spec: "specs/05-proposals.spec.ts",
    state: "covered",
  },
  {
    n: 17,
    title: "Won → project spin-up (BR-035)",
    persona: "Gestor+",
    spec: "specs/06-delivery.spec.ts",
    state: "partial",
    note: "Step 1's zero-re-entry prefill from the opportunity and the accepted proposal is asserted, as is the template gate on step 2. The wizard cannot be completed here: step 2 requires a project template and the dev seed ships none — and every won opportunity in the seed already owns a project, so a committed conversion would duplicate it and break repeat runs.",
  },
  {
    n: 18,
    title: "Manage phases",
    persona: "Gestor+",
    spec: "specs/06-delivery.spec.ts",
    state: "covered",
  },
  {
    n: 19,
    title: "Manage milestones",
    persona: "Gestor+",
    spec: "specs/06-delivery.spec.ts",
    state: "partial",
    note: "Delivery milestones have no CRUD surface in the product — they are read-only projections on the overview, phases and calendar. Only the read surface is asserted. Payment milestones (the writable kind) are flow 24.",
  },
  {
    n: 20,
    title: "Set / override project health (BR-030/031)",
    persona: "Gestor+",
    spec: "specs/06-delivery.spec.ts",
    state: "covered",
  },
  {
    n: 21,
    title: "Task board / status transitions",
    persona: "all",
    spec: "specs/07-execution.spec.ts",
    state: "covered",
    note: "Transitions are driven and reverted against the real backend. Task CREATION is separately blocked by the same mock-id defect as flows 8 and 10 (the Projeto combobox is fed by the mock task client), so that half is a fixme.",
  },
  {
    n: 22,
    title: "Blockers / dependencies (BR-045/046)",
    persona: "all",
    spec: "specs/07-execution.spec.ts",
    state: "covered",
  },
  {
    n: 23,
    title: "Time tracking (BR-040..044)",
    persona: "all",
    spec: "specs/07-execution.spec.ts",
    state: "partial",
    note: "The timer contract is driven through the UI (start, single-active guard, stop, billable default). The task picker and entry list are still served by the mock time client, so the entries are not asserted against the database.",
  },
  {
    n: 24,
    title: "Payment milestones + margin (BR-065..073)",
    persona: "Admin / Gestor(grant)",
    spec: "specs/08-finance-capacity.spec.ts",
    state: "covered",
    note: "Create, receipt and cancel are driven end to end, plus the BR-008 denial for a Membro. One fixme records a separate defect: the receipt dialog pre-fills a dot-decimal amount that its own pt-PT parser rejects.",
  },
  {
    n: 25,
    title: "Team workload / capacity (BR-080..084)",
    persona: "Admin / Gestor / own",
    spec: "specs/08-finance-capacity.spec.ts",
    state: "covered",
  },
] as const;

/** Title prefix used by every spec, so a flow is greppable in the report. */
export function flow(n: number): string {
  const f = CRITICAL_FLOWS.find((c) => c.n === n);
  if (!f) throw new Error(`Unknown critical flow #${n}`);
  return `§4.4 flow ${n} — ${f.title} —`;
}
