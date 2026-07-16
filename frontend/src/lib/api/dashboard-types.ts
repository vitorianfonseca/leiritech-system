/**
 * Dashboard API models (F2) — the management overview at `/`.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * ROLE SCOPING (BR-002 / BR-008):
 * - Admin / Gestor  → full dashboard (all metrics, all attention groups, all charts).
 * - Gestor          → financial metrics/charts only with the payments grant (BR-008/066).
 * - Membro          → scoped: own tasks/projects only, NO financial metrics/charts.
 * The client (like `financeApi`) enforces the scope so the UI never accidentally
 * surfaces cross-user or financial data. `scopeDashboard()` is the single predicate.
 *
 * Attention items are fed by the fixed automations (WORKFLOW_SPEC §6.1, AUTO-01..12).
 * Each item carries structured data (entity ref + numeric params) and is localized
 * in the view — the API never returns pre-translated strings.
 */

import type { Role } from "@/lib/session";
import { canAccessFinance } from "@/lib/api/finance-types";

/* ------------------------------------------------------------------ *
 * Stat tiles
 * ------------------------------------------------------------------ */

export type MetricTone =
  | "neutral"
  | "gold"
  | "success"
  | "warning"
  | "destructive"
  | "info";

/** How a metric's raw numeric value should be rendered by the view. */
export type MetricFormat = "count" | "currencyCents" | "percent";

export type MetricKey =
  | "openOpportunities"
  | "pipelineValue"
  | "activeProjects"
  | "projectsAtRisk"
  | "overdueTasks"
  | "deliveriesNext7Days"
  | "pendingPayments"
  | "overduePayments"
  | "teamLoad";

export interface DashboardMetric {
  key: MetricKey;
  /** Raw numeric value (AnimatedCounter counts up to this). */
  value: number;
  format: MetricFormat;
  tone: MetricTone;
  /** Financial metrics are gated (BR-008) — the client omits them when disallowed. */
  financial: boolean;
  /** Canonical route to the underlying list/record this tile drills into. */
  href: string;
  /** Optional secondary value used by some formats (e.g. overloaded count for teamLoad). */
  detail?: number;
}

/* ------------------------------------------------------------------ *
 * "Atenção necessária" panel
 * ------------------------------------------------------------------ */

export type AttentionGroupKey =
  | "overdueTasks"
  | "projectsAtRisk"
  | "opportunitiesNoNextAction"
  | "proposalsAwaiting"
  | "overloadedMembers"
  | "overduePayments"
  | "lowProgressNearDelivery"
  | "blockedTasks";

/** Maps to a Badge variant + a `status.*` label + a design urgency zone. */
export type AttentionSeverity =
  | "overdue"
  | "atRisk"
  | "due"
  | "attention"
  | "blocked";

export type AttentionEntityType =
  | "task"
  | "project"
  | "opportunity"
  | "proposal"
  | "member"
  | "payment";

export interface AttentionItem {
  id: string;
  entityType: AttentionEntityType;
  entityId: string;
  /** The record's own name (data, not translatable — e.g. a project/person name). */
  title: string;
  /** i18n key under `dashboard.attention.meta.*`. */
  metaKey: string;
  /** ICU params for `metaKey`. Currency is passed pre-formatted as a string. */
  metaParams?: Record<string, string | number>;
  severity: AttentionSeverity;
}

export interface AttentionGroup {
  key: AttentionGroupKey;
  /** Financial groups (overdue payments) are gated (BR-008). */
  financial: boolean;
  items: AttentionItem[];
}

/* ------------------------------------------------------------------ *
 * Charts
 * ------------------------------------------------------------------ */

export interface PipelinePoint {
  /** i18n month key under `dashboard.months.*` (jan..dec). */
  month: string;
  valueCents: number;
}

/** Projects grouped by RAG health state (consumes DESIGN.md health-* zones). */
export interface ProjectStatePoint {
  state: "healthy" | "attention" | "atRisk";
  count: number;
}

export interface TaskFlowPoint {
  /** i18n week label key under `dashboard.weeks.*` (w1..w6). */
  week: string;
  done: number;
  overdue: number;
}

export interface ContractedReceivedPoint {
  month: string;
  contractedCents: number;
  receivedCents: number;
}

export interface TeamLoadPoint {
  memberId: string;
  memberName: string;
  /** Allocation as a percentage of capacity (100 = fully booked). */
  allocationPct: number;
}

export interface DashboardCharts {
  pipeline: PipelinePoint[];
  projectsByState: ProjectStatePoint[];
  taskFlow: TaskFlowPoint[];
  /** Present only when the user may see financials (Admin / Gestor+grant). */
  contractedReceived: ContractedReceivedPoint[] | null;
  teamLoad: TeamLoadPoint[];
}

/* ------------------------------------------------------------------ *
 * Payload
 * ------------------------------------------------------------------ */

export interface DashboardData {
  /** Whether the resolved user may see financial surfaces (drives view gating). */
  canSeeFinancials: boolean;
  /** True when the payload is a Membro's scoped view (own tasks/projects only). */
  scoped: boolean;
  metrics: DashboardMetric[];
  attention: AttentionGroup[];
  charts: DashboardCharts;
}

/* ------------------------------------------------------------------ *
 * Access + errors
 * ------------------------------------------------------------------ */

/**
 * Whether the dashboard payload should be scoped to the user's own work
 * (BR-002). Admin/Gestor see the whole operation; Membro sees only their own.
 */
export function isScopedDashboard(role: Role): boolean {
  return role === "membro";
}

/** Re-export so the view uses one predicate for financial gating (BR-008). */
export { canAccessFinance };

export type DashboardErrorCode = "network" | "forbidden";

export class DashboardError extends Error {
  readonly code: DashboardErrorCode;
  constructor(code: DashboardErrorCode, message?: string) {
    super(message ?? code);
    this.name = "DashboardError";
    this.code = code;
  }
}
