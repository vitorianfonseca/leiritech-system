/**
 * Project template API models (F9) — CANONICAL SHARED SOURCE.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * ⚠️ OTHER ISSUES CONSUME THIS MODULE.
 * #31 (project conversion wizard) instantiates a project from a template
 * (`getTemplate` → nested phases/tasks). #42 (settings nav) links to the route.
 * Keep the shapes stable and import them — do NOT fork a second template model.
 *
 * Access (WORKFLOW_SPEC §3 — templates matrix, BR-035):
 * Admin ✅ defines the canonical templates. Gestor 👀 reads them and "uses"
 * one to spin up a project. Membro ❌ (templates live under /settings).
 */

import type { Role } from "@/lib/session";

/** The four seeded delivery archetypes for a software house. */
export type TemplateType = "website" | "app" | "consulting" | "maintenance";

export const TEMPLATE_TYPES: TemplateType[] = [
  "website",
  "app",
  "consulting",
  "maintenance",
];

/**
 * Functional role a template task is assigned to. This is the *delivery*
 * discipline (who does the work), distinct from the platform access `Role`
 * (admin/gestor/membro). On instantiation (#31) these map to real assignees.
 */
export type TemplateTaskRole =
  | "gestor"
  | "designer"
  | "developer"
  | "qa"
  | "consultant"
  | "marketing";

export const TEMPLATE_TASK_ROLES: TemplateTaskRole[] = [
  "gestor",
  "designer",
  "developer",
  "qa",
  "consultant",
  "marketing",
];

/** A single task inside a template phase. */
export interface TemplateTask {
  id: string;
  phaseId: string;
  title: string;
  roleResponsible: TemplateTaskRole;
  /** Planned effort in hours (H7 estimate seed). */
  estimateHours: number;
  /** 0-based position within its phase. */
  order: number;
}

/**
 * An ordered phase of a template. A phase may be flagged as a client-facing
 * delivery *milestone* — on instantiation these seed the project's payment
 * milestones (F14) / delivery checkpoints.
 */
export interface TemplatePhase {
  id: string;
  templateId: string;
  name: string;
  /** 0-based position within its template. */
  order: number;
  /** Expected calendar duration of the phase, in days. */
  expectedDurationDays: number;
  /** Whether this phase is a client-facing delivery milestone. */
  isMilestone: boolean;
  /** Label for the milestone (only meaningful when `isMilestone`). */
  milestoneName: string | null;
  tasks: TemplateTask[];
}

/** List/summary shape (no nested phases) — what the templates table renders. */
export interface ProjectTemplate {
  id: string;
  name: string;
  type: TemplateType;
  description: string;
  active: boolean;
  /** Overall expected calendar duration in days (as declared on the template). */
  expectedDurationDays: number;
  /** Derived counts kept on the summary so the table needn't fetch details. */
  phaseCount: number;
  taskCount: number;
  totalEstimateHours: number;
  updatedAt: string;
}

/** Full template with its ordered phases and tasks (editor + #31 consume this). */
export interface TemplateDetail extends ProjectTemplate {
  phases: TemplatePhase[];
}

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

export interface TemplateInput {
  name: string;
  type: TemplateType;
  description: string;
  expectedDurationDays: number;
  active: boolean;
}

export interface PhaseInput {
  name: string;
  expectedDurationDays: number;
  isMilestone: boolean;
  milestoneName: string | null;
}

export interface TaskInput {
  title: string;
  roleResponsible: TemplateTaskRole;
  estimateHours: number;
}

/* ------------------------------------------------------------------ *
 * Access predicates (mirror the backend contract)
 * ------------------------------------------------------------------ */

/** Only Admin may create/edit the canonical templates (matrix §9). */
export function canManageTemplates(role: Role): boolean {
  return role === "admin";
}

/** Admin + Gestor may view and "use" a template to spin up a project. */
export function canUseTemplates(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/* ------------------------------------------------------------------ *
 * Error
 * ------------------------------------------------------------------ */

export type TemplateErrorKind = "forbidden" | "not_found" | "network";

export class TemplateError extends Error {
  constructor(
    public readonly kind: TemplateErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

/* ------------------------------------------------------------------ *
 * Derivations (shared so summary + detail agree)
 * ------------------------------------------------------------------ */

export function summarize(
  template: Omit<ProjectTemplate, "phaseCount" | "taskCount" | "totalEstimateHours">,
  phases: TemplatePhase[],
): ProjectTemplate {
  const taskCount = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const totalEstimateHours = phases.reduce(
    (sum, p) => sum + p.tasks.reduce((s, t) => s + t.estimateHours, 0),
    0,
  );
  return { ...template, phaseCount: phases.length, taskCount, totalEstimateHours };
}
