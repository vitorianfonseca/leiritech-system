/**
 * Won → project conversion models (#31) — the product's core differentiator
 * (BR-035 zero re-entry). The wizard reads an assembled `ConversionContext`
 * (opportunity + accepted proposal + company/contacts + templates, pre-filled)
 * and submits a `ConvertWizardInput`. The backend (FastAPI) does not exist yet;
 * these types are the contract the integration agent fulfils. UI depends only
 * on these shapes, never on the mock implementation.
 *
 * Business rules materialised here:
 * - BR-035: everything is pre-filled from the won opportunity + accepted
 *   proposal; a verbal close (no accepted proposal) still pre-fills company +
 *   contacts but forces the contracted value to be entered by hand.
 * - BR-036: the source opportunity / proposal links are preserved (read-only).
 * - BR-037: payment milestones must be confirmed before the project can go
 *   active — gated to finance (Admin / Gestor-with-grant).
 * - BR-038: winning already flips the company to "cliente ativo" (derived).
 */

import type { Contact } from "@/lib/api/crm-types";
import type { Opportunity } from "@/lib/api/opportunities-types";
import type { Proposal } from "@/lib/api/proposals-types";
import type { ProjectTemplate, TemplateDetail } from "@/lib/api/template-types";
import type { InstantiatedPhaseInput } from "@/lib/api/projects-types";

/* ------------------------------------------------------------------ *
 * Context (read)
 * ------------------------------------------------------------------ */

/** Lightweight company facts the wizard pre-fills + confirms. */
export interface ConversionCompany {
  id: string;
  name: string;
  /** Whether the company already reads as an active client (BR-038). */
  clienteAtivo: boolean;
}

/**
 * Everything the wizard needs, assembled server-side in one call so the first
 * step renders fully pre-filled (zero re-entry). `acceptedProposal` is null for
 * a verbal close.
 */
export interface ConversionContext {
  opportunity: Opportunity;
  company: ConversionCompany;
  contacts: Contact[];
  acceptedProposal: Proposal | null;
  /** Active templates to instantiate the project from (#33). */
  templates: ProjectTemplate[];
  /** Best available contracted value: proposal → opportunity → null (finance-gated). */
  suggestedValueCents: number | null;
  /** Whether the caller may see/edit financial fields + confirm milestones (BR-008). */
  canFinance: boolean;
}

/* ------------------------------------------------------------------ *
 * Milestone draft (edited in the wizard, seeded via the finance API)
 * ------------------------------------------------------------------ */

export interface MilestoneDraft {
  /** Local id (wizard-only) for list keys and edits. */
  key: string;
  description: string;
  /** Amount in cents. */
  amountCents: number;
  /** ISO date (yyyy-mm-dd). */
  expectedDate: string;
  /** Required acceptance criteria (BR-071). */
  completionCriteria: string;
}

/* ------------------------------------------------------------------ *
 * Submit (write)
 * ------------------------------------------------------------------ */

export interface ConvertWizardInput {
  opportunityId: string;
  proposalId: string | null;
  name: string;
  clientId: string;
  clientName: string;
  managerId: string;
  teamMemberIds: string[];
  templateId: string;
  phases: InstantiatedPhaseInput[];
  startDate: string;
  dueDate: string;
  hoursBudget: number;
  /** Finance-gated; null for a non-finance converter. */
  contractedValueCents: number | null;
  description: string;
  milestones: MilestoneDraft[];
  paymentMilestonesConfirmed: boolean;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type ConversionErrorCode =
  | "not_found"
  | "forbidden"
  /** Opportunity is not in a won state — nothing to convert. */
  | "not_won"
  /** Opportunity was already converted to a project (BR-036). */
  | "already_converted"
  | "network";

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  /** Set for `already_converted` so the UI can deep-link to the project. */
  readonly projectId?: string | null;
  constructor(code: ConversionErrorCode, projectId?: string | null) {
    super(code);
    this.name = "ConversionError";
    this.code = code;
    this.projectId = projectId;
  }
}

/* ------------------------------------------------------------------ *
 * Pure derivation helpers (no i18n — labels are passed in by the caller)
 * ------------------------------------------------------------------ */

/** Add whole days to an ISO date (yyyy-mm-dd), returning yyyy-mm-dd. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today as yyyy-mm-dd (local). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Instantiate the ordered project phases + schedule defaults from a template.
 * `dueDate` is the project start plus the sum of phase durations (≥ 1 day).
 * `hoursBudget` is the template's total estimate.
 */
export function deriveTemplateDefaults(
  template: TemplateDetail,
  startDate: string
): { phases: InstantiatedPhaseInput[]; dueDate: string; hoursBudget: number } {
  const ordered = [...template.phases].sort((a, b) => a.order - b.order);
  let cumulative = 0;
  const phases: InstantiatedPhaseInput[] = ordered.map((p) => {
    cumulative += Math.max(0, p.expectedDurationDays);
    return {
      name: p.name,
      tasksTotal: p.tasks.length,
      dueDate: startDate ? addDaysIso(startDate, cumulative) : null,
    };
  });
  const totalDays = Math.max(1, cumulative || template.expectedDurationDays || 30);
  const hoursBudget = template.totalEstimateHours || 0;
  return {
    phases,
    dueDate: startDate ? addDaysIso(startDate, totalDays) : "",
    hoursBudget,
  };
}

/**
 * Default payment-milestone drafts from a template + contracted value. Milestone
 * phases each get an even slice of the value (remainder on the last); a template
 * with no milestone phases yields a single full-value milestone. `labels`
 * supplies the translated fallback strings so no copy is hardcoded here.
 */
export function deriveMilestoneDrafts(
  template: TemplateDetail,
  contractedValueCents: number | null,
  startDate: string,
  labels: { finalPayment: string; criteria: (phase: string) => string }
): MilestoneDraft[] {
  const value = contractedValueCents ?? 0;
  const ordered = [...template.phases].sort((a, b) => a.order - b.order);
  const milestonePhases = ordered.filter((p) => p.isMilestone);

  if (milestonePhases.length === 0) {
    return [
      {
        key: cryptoKey(),
        description: labels.finalPayment,
        amountCents: value,
        expectedDate: startDate ? addDaysIso(startDate, Math.max(1, template.expectedDurationDays || 30)) : todayIso(),
        completionCriteria: labels.criteria(labels.finalPayment),
      },
    ];
  }

  const n = milestonePhases.length;
  const base = Math.floor(value / n);
  let cumulative = 0;
  return ordered.reduce<MilestoneDraft[]>((acc, phase) => {
    cumulative += Math.max(0, phase.expectedDurationDays);
    if (!phase.isMilestone) return acc;
    const isLast = acc.length === n - 1;
    const amountCents = isLast ? value - base * (n - 1) : base;
    const name = phase.milestoneName ?? phase.name;
    acc.push({
      key: cryptoKey(),
      description: name,
      amountCents,
      expectedDate: startDate ? addDaysIso(startDate, cumulative) : todayIso(),
      completionCriteria: labels.criteria(name),
    });
    return acc;
  }, []);
}

/** Sum of milestone drafts in cents. */
export function sumDrafts(drafts: MilestoneDraft[]): number {
  return drafts.reduce((s, d) => s + (Number.isFinite(d.amountCents) ? d.amountCents : 0), 0);
}

function cryptoKey(): string {
  return `ms-${Math.random().toString(36).slice(2, 9)}`;
}
