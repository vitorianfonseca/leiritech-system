/**
 * Team & workload types (F13 / issue #37).
 *
 * These model the capacity / workload domain (WORKFLOW_SPEC §2 "Capacity /
 * Workload", BR-080..084). The mock `teamApi` in `./team` derives every
 * availability state from load-vs-capacity — it is NEVER toggled by hand
 * (except the manual `ausente` PTO state). The integration agent replaces the
 * client body without changing these shapes.
 */

import type { Role } from "@/lib/session";

/* ------------------------------------------------------------------ *
 * Function (distinct from the access Role)
 * ------------------------------------------------------------------ */

/**
 * Professional function. This is NOT the access `Role` — it drives the
 * role-dependent utilization target, weekly capacity and internal cost rate
 * (BR-080/081). Engineering/delivery targets sit high (~75–80%), management /
 * leadership low (~35–50%) because their week is mostly non-delivery.
 */
export type TeamFunction =
  | "engineering"
  | "design"
  | "qa"
  | "management"
  | "leadership";

export const TEAM_FUNCTIONS: TeamFunction[] = [
  "engineering",
  "design",
  "qa",
  "management",
  "leadership",
];

/* ------------------------------------------------------------------ *
 * Availability (BR-082)
 * ------------------------------------------------------------------ */

/**
 * Availability state. All values EXCEPT `ausente` are DERIVED from assigned
 * load vs net capacity (BR-082): `disponivel` < 70%, `equilibrado` 70–100%,
 * `sobrecarregado` > 100%. `ausente` is the only manually-set state (PTO).
 */
export type AvailabilityState =
  | "disponivel"
  | "equilibrado"
  | "sobrecarregado"
  | "ausente";

export const AVAILABILITY_STATES: AvailabilityState[] = [
  "disponivel",
  "equilibrado",
  "sobrecarregado",
  "ausente",
];

/** Badge variant per availability state (DESIGN.md status zones; never colour alone). */
export function availabilityBadgeVariant(
  state: AvailabilityState
): "success" | "signal" | "overdue" | "done" {
  switch (state) {
    case "disponivel":
      return "success";
    case "equilibrado":
      return "signal";
    case "sobrecarregado":
      return "overdue";
    case "ausente":
      return "done";
  }
}

/**
 * Derive the availability state from the load ratio (BR-082). `away` (PTO)
 * always wins — an absent member is `ausente` regardless of assigned load.
 *
 * @param utilizationRatio allocated load ÷ net capacity (0..n)
 */
export function deriveAvailability(
  utilizationRatio: number,
  away: boolean
): AvailabilityState {
  if (away) return "ausente";
  if (utilizationRatio > 1) return "sobrecarregado";
  if (utilizationRatio >= 0.7) return "equilibrado";
  return "disponivel";
}

/** Net delivery capacity (BR-080): (gross − non-project) × utilization target. */
export function netCapacityHours(
  weeklyCapacityHours: number,
  nonProjectHours: number,
  utilizationTarget: number
): number {
  return Math.max(0, (weeklyCapacityHours - nonProjectHours) * utilizationTarget);
}

/* ------------------------------------------------------------------ *
 * Heatmap intensity buckets
 * ------------------------------------------------------------------ */

export type HeatLevel = "empty" | "light" | "moderate" | "full" | "over";

/**
 * Bucket a day's allocation against that day's share of net capacity. The
 * `over` bucket is the AUTO-09/BR-084 over-allocation zone and must read as an
 * alarm (colour + icon + label, never colour alone).
 */
export function heatLevel(dayHours: number, dailyCapacity: number): HeatLevel {
  if (dayHours <= 0) return "empty";
  if (dailyCapacity <= 0) return dayHours > 0 ? "over" : "empty";
  const ratio = dayHours / dailyCapacity;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "full";
  if (ratio >= 0.5) return "moderate";
  return "light";
}

/* ------------------------------------------------------------------ *
 * Models
 * ------------------------------------------------------------------ */

/** One weekday cell of a member's weekly heatmap row. */
export interface HeatmapDay {
  /** 0 = Monday … 4 = Friday. */
  index: number;
  /** ISO date (yyyy-mm-dd) of the day within the selected week. */
  date: string;
  /** Hours of delivery work allocated that day. */
  allocatedHours: number;
}

/** Per-function capacity configuration — Admin-configurable (BR-080/081). */
export interface FunctionCapacityConfig {
  function: TeamFunction;
  /** Gross contracted hours per week. */
  weeklyCapacityHours: number;
  /** Known recurring non-project hours/week (admin, internal, meetings). */
  nonProjectHours: number;
  /** Role utilization target, 0..1 (BR-081). */
  utilizationTarget: number;
  /** Internal cost rate €/h in cents (BR-069 — Admin-only, never shown to Membro). */
  internalCostRateCents: number;
}

export interface UpdateFunctionConfigInput {
  weeklyCapacityHours: number;
  nonProjectHours: number;
  /** Utilization target expressed as a percentage 0..100 in the form. */
  utilizationTargetPct: number;
  internalCostRateCents: number;
}

/** A single member's workload row for the selected week. */
export interface TeamMemberWorkload {
  userId: string;
  name: string;
  avatarUrl: string | null;
  function: TeamFunction;
  /** Access role — contextual only; drives no capacity maths. */
  accessRole: Role;
  availability: AvailabilityState;
  /** Manual note shown while `ausente` (e.g. "Férias"). */
  awayNote: string | null;
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  /** Estimated allocated load this week (carga estimada). */
  allocatedHours: number;
  /** Hours logged this week (horas desta semana). */
  loggedHours: number;
  /** Billable share of the logged hours (BR-083). */
  billableHours: number;
  /** Gross weekly capacity (capacidade semanal). */
  weeklyCapacityHours: number;
  /** Net delivery capacity (BR-080). */
  netCapacityHours: number;
  /** allocated ÷ net capacity — the BR-082 basis (0..n). */
  utilizationRatio: number;
  /** Utilization rate = billable ÷ available hours (BR-083, 0..n). */
  billableUtilization: number;
  /** Daily allocation for the heatmap row (Mon–Fri). */
  days: HeatmapDay[];
}

export interface TeamWorkload {
  /** ISO Monday (yyyy-mm-dd) of the selected week. */
  weekStart: string;
  /** Week offset relative to the current week (…, -1, 0, 1, …). */
  weekOffset: number;
  members: TeamMemberWorkload[];
  /** Per-function config — null unless the caller may configure (Admin). */
  configs: FunctionCapacityConfig[] | null;
  /** True when the caller sees only their own row (Membro — BR-002). */
  ownOnly: boolean;
  /** Whether the caller may edit per-function capacity config (Admin). */
  canConfigure: boolean;
}

/* ------------------------------------------------------------------ *
 * Permissions (WORKFLOW_SPEC §3 + matrix)
 * ------------------------------------------------------------------ */

/** Everyone reaches /team; Membro is row-scoped to their own load (BR-002). */
export function canAccessTeam(role: Role): boolean {
  return role === "admin" || role === "gestor" || role === "membro";
}

/** Admin/Gestor see the full team; Membro sees only their own row (BR-002). */
export function canSeeFullTeam(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/** Capacity config + cost rates are Admin-only (matrix §9, BR-069/081). */
export function canConfigureCapacity(role: Role): boolean {
  return role === "admin";
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type TeamErrorCode = "forbidden" | "not_found" | "validation";

export class TeamError extends Error {
  constructor(
    public code: TeamErrorCode,
    public detailKey?: string
  ) {
    super(code);
    this.name = "TeamError";
  }
}
