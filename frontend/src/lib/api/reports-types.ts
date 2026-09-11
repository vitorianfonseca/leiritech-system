/**
 * Reports + CSV export API models (F19, PRD §8 /reports).
 *
 * Reports do NOT own any data. Every figure is DERIVED from the existing mock
 * stores (opportunities #29, projects #32, tasks #34, time #35, team #37,
 * finance #38, crm) — this module only fetches those datasets, already scoped
 * by role at their own source, and exposes them for client-side aggregation.
 *
 * Access (BR-002 / BR-008):
 * - Comercial: Admin / Gestor only (pipeline is Membro-invisible).
 * - Projetos + Equipa: all roles; Gestor/Membro see their own scope (the source
 *   list methods already apply `visibleTo`).
 * - Financeiro: Admin / Gestor-with-payments-grant only (entirely hidden else).
 */

import type { Role } from "@/lib/session";
import type {
  Opportunity,
  PipelineStage,
} from "@/lib/api/opportunities-types";
import type { CompanySummary } from "@/lib/api/crm-types";
import type { ProjectListItem } from "@/lib/api/projects-types";
import type { Task } from "@/lib/api/tasks-types";
import type { TimeEntry } from "@/lib/api/time-types";
import type { TeamMemberWorkload } from "@/lib/api/team-types";
import type { FinancialProjectSummary, PaymentMilestone } from "@/lib/api/finance-types";

/** The four report groups (tabs). */
export type ReportGroupKey = "comercial" | "projetos" | "equipa" | "financeiro";

export const REPORT_GROUPS: ReportGroupKey[] = [
  "comercial",
  "projetos",
  "equipa",
  "financeiro",
];

/** Who is asking — drives scoping + gating at the source. */
export interface ReportContext {
  role: Role;
  userId: string;
  paymentsGrant: boolean;
}

/**
 * Live filter state. `null` means "no filter" for that dimension. Dates are ISO
 * `yyyy-mm-dd`; the range is inclusive on both ends.
 */
export interface ReportFilters {
  from: string | null;
  to: string | null;
  clientId: string | null;
  projectId: string | null;
  memberId: string | null;
  /** Project lifecycle state (also matched against task state). */
  state: string | null;
}

export const EMPTY_FILTERS: ReportFilters = {
  from: null,
  to: null,
  clientId: null,
  projectId: null,
  memberId: null,
  state: null,
};

/** An { id, name } option for the filter comboboxes. */
export interface FilterOption {
  id: string;
  name: string;
}

/**
 * The scoped raw datasets the client aggregates. Arrays are already
 * role-scoped and gated at the source (empty when the caller may not see them).
 */
export interface ReportDataset {
  /** "full" for Admin/Gestor operational scope, "own" for a Membro. */
  scope: "full" | "own";
  canComercial: boolean;
  canFinance: boolean;
  /** ISO datetime the snapshot was produced (shown + used in CSV filenames). */
  generatedAt: string;

  opportunities: Opportunity[];
  stages: PipelineStage[];
  companies: CompanySummary[];
  projects: ProjectListItem[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  team: TeamMemberWorkload[];
  /**
   * `projectSummaries` is the backend's live per-project margin rollup
   * (BR-065, `finance_service.financial_summary()`) — it already nets out
   * labour cost. Report aggregation MUST derive margin from it rather than
   * recomputing `contracted − costs` from milestones/costs (see H6).
   */
  finance: { milestones: PaymentMilestone[]; projectSummaries: FinancialProjectSummary[] } | null;

  /** Options for the filter bar, derived from the scoped datasets. */
  filterOptions: {
    clients: FilterOption[];
    projects: FilterOption[];
    members: FilterOption[];
    states: string[];
  };
}

export type ReportErrorCode = "network" | "forbidden";

export class ReportError extends Error {
  readonly code: ReportErrorCode;
  constructor(code: ReportErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ReportError";
    this.code = code;
  }
}

export interface ReportsApi {
  /** Fetch + scope every dataset the reports surface derives from. */
  getDataset(ctx: ReportContext): Promise<ReportDataset>;
}
