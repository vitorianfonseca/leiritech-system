/**
 * Projects API models (F8) — delivery / PSA core.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * Access (WORKFLOW_SPEC §3, BR-002 / BR-008):
 * - Admin / Gestor see all projects; Membro sees ONLY projects where they are a
 *   `project_member` (BR-002) — the client filters/404s otherwise.
 * - Financial fields (contracted value, margin, payment milestones, project
 *   costs) are gated by `canAccessFinance` (BR-008) and stripped for anyone
 *   without finance access. NO fiscal terminology anywhere (BR-070/072).
 *
 * State machine (WORKFLOW_SPEC §1.3 project, §1.4 health, §1.5 phase) is
 * enforced by the mock client so guarded transitions behave like the backend.
 */

import type { Role } from "@/lib/session";
import { canAccessFinance } from "@/lib/api/finance-types";
import type { FinancialSummary } from "@/lib/api/finance-types";

/* ------------------------------------------------------------------ *
 * Enums / unions
 * ------------------------------------------------------------------ */

/** Project lifecycle (WORKFLOW_SPEC §1.3). */
export type ProjectState =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled"
  | "archived";

export const PROJECT_STATES: ProjectState[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
  "archived",
];

/** Health RAG (WORKFLOW_SPEC §1.4) — auto-suggested, human-published. */
export type ProjectHealth = "healthy" | "attention" | "at_risk";

export const PROJECT_HEALTHS: ProjectHealth[] = ["healthy", "attention", "at_risk"];

/** Project phase lifecycle (WORKFLOW_SPEC §1.5). */
export type PhaseState = "not_started" | "in_progress" | "blocked" | "completed";

export const PHASE_STATES: PhaseState[] = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
];

/** Delivery-milestone status (distinct from payment milestone — §1.8). */
export type DeliveryMilestoneStatus = "upcoming" | "due_soon" | "overdue" | "met";

/* ------------------------------------------------------------------ *
 * Sub-entities
 * ------------------------------------------------------------------ */

export interface ProjectMember {
  userId: string;
  name: string;
  /** Delivery role label (e.g. "Gestor", "Designer"). Free text in the mock. */
  roleLabel: string;
  avatarUrl: string | null;
}

export interface ProjectPhase {
  id: string;
  projectId: string;
  name: string;
  /** 1-based display order; drives reorder (dnd-kit). */
  order: number;
  state: PhaseState;
  /** Non-archived tasks in the phase (BR-050 progress derivation). */
  tasksTotal: number;
  tasksDone: number;
  /** ISO date the phase is due, or null. */
  dueDate: string | null;
  /** Blocker reason when `state === "blocked"`. */
  blockerReason: string | null;
}

/** Delivery milestone (§1.8) — a client-visible commitment, not a payment. */
export interface DeliveryMilestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  status: DeliveryMilestoneStatus;
}

/** A lightweight task summary surfaced on the overview (real tasks are #34). */
export interface ProjectTaskSummary {
  id: string;
  title: string;
  phaseName: string;
  assigneeName: string;
  dueDate: string | null;
  /** "overdue" | "blocked" for the attention lists. */
  flag: "overdue" | "blocked";
}

export interface ProjectRisk {
  id: string;
  kind: "risk" | "decision" | "next_step";
  text: string;
  /** ISO date the entry was logged. */
  loggedAt: string;
}

/* ------------------------------------------------------------------ *
 * Core entity
 * ------------------------------------------------------------------ */

export interface ProjectListItem {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  managerId: string;
  managerName: string;
  /** Number of assigned project members (team size). */
  teamCount: number;
  state: ProjectState;
  suggestedHealth: ProjectHealth;
  /** Null until a human publishes health (BR-030). */
  publishedHealth: ProjectHealth | null;
  /** 0–100, derived from phase progress (BR-050). */
  progress: number;
  startDate: string;
  dueDate: string;
  /** Contracted value in cents — null when finance is not accessible (BR-008). */
  contractedValueCents: number | null;
  hoursBudget: number;
  hoursUsed: number;
  /** ISO date of the next delivery milestone, or null. */
  nextDeliveryAt: string | null;
}

export interface Project extends ProjectListItem {
  description: string;
  team: ProjectMember[];
  phases: ProjectPhase[];
  deliveryMilestones: DeliveryMilestone[];
  attentionTasks: ProjectTaskSummary[];
  risks: ProjectRisk[];
  /** Override reason attached to the last published health (BR-031). */
  healthReason: string | null;
  healthUpdatedAt: string | null;
  healthUpdatedBy: string | null;
  pauseReason: string | null;
  cancelReason: string | null;
  /** Whether payment milestones have been reviewed/confirmed (BR-037, H5). */
  paymentMilestonesConfirmed: boolean;
  /** Source opportunity, if spun up via conversion (#31). */
  opportunityId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-project financial payload for the Financeiro tab. Only ever returned to
 * finance-authorized users; the mock refuses otherwise (BR-008).
 */
export interface ProjectFinance {
  projectId: string;
  summary: FinancialSummary;
  milestones: import("@/lib/api/finance-types").PaymentMilestone[];
  costs: import("@/lib/api/finance-types").ProjectCost[];
}

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

export interface CreateProjectInput {
  name: string;
  clientId: string;
  /** Company display name, resolved by the form from the CRM picker. */
  clientName: string;
  managerId: string;
  description: string;
  startDate: string;
  dueDate: string;
  hoursBudget: number;
  /** Contracted value in cents (finance-gated at the form). */
  contractedValueCents: number | null;
}

export type ProjectLifecycleAction =
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "cancel"
  | "archive";

export interface TransitionInput {
  action: ProjectLifecycleAction;
  /** Reason — required for pause and cancel (§1.3). */
  reason?: string;
}

export interface PublishHealthInput {
  health: ProjectHealth;
  /** Required when it differs from `suggestedHealth` (BR-031). */
  reason?: string;
}

export interface PhaseInput {
  name: string;
  dueDate: string | null;
}

export type PhaseTransition =
  | "start"
  | "block"
  | "unblock"
  | "complete"
  | "reopen";

export interface PhaseTransitionInput {
  transition: PhaseTransition;
  /** Required for block (blocker) and reopen (note). */
  reason?: string;
}

/* ------------------------------------------------------------------ *
 * Access predicates (shared by route guard, nav and data client)
 * ------------------------------------------------------------------ */

/** Everyone can reach the projects area; Membro is row-scoped (BR-002). */
export function canAccessProjects(role: Role): boolean {
  return role === "admin" || role === "gestor" || role === "membro";
}

/** Create a project: commercial/delivery write — Admin / Gestor only. */
export function canCreateProject(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/**
 * Lifecycle + health ownership. Admin always; Gestor only for a project they
 * own (owner === manager). Membro never.
 */
export function canManageProject(role: Role, isOwner: boolean): boolean {
  if (role === "admin") return true;
  if (role === "gestor") return isOwner;
  return false;
}

/**
 * Cancel is stricter (§1.3): Admin, or a Gestor owner with the grant. The dev
 * session has no dedicated cancel grant, so an owning Gestor is treated as
 * granted here; the backend tightens this later.
 */
export function canCancelProject(role: Role, isOwner: boolean): boolean {
  if (role === "admin") return true;
  return role === "gestor" && isOwner;
}

/** Financial visibility for the Financeiro tab + valor fields (BR-008). */
export function canSeeProjectFinance(role: Role, paymentsGrant: boolean): boolean {
  return canAccessFinance(role, paymentsGrant);
}

/** The health a viewer should treat as authoritative (published, else suggested). */
export function effectiveHealth(p: Pick<Project, "publishedHealth" | "suggestedHealth">): ProjectHealth {
  return p.publishedHealth ?? p.suggestedHealth;
}

/** Health is only meaningful for live states (§1.4). */
export function isLiveState(state: ProjectState): boolean {
  return state === "planning" || state === "active" || state === "on_hold";
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type ProjectErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_transition"
  | "guard_failed"
  | "reason_required"
  | "network";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  /** Optional i18n key hint for a precise guard message. */
  readonly detailKey?: string;
  constructor(code: ProjectErrorCode, detailKey?: string) {
    super(code);
    this.name = "ProjectError";
    this.code = code;
    this.detailKey = detailKey;
  }
}
