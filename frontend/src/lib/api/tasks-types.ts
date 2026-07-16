/**
 * Tasks API models (F10) — delivery task management.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * The task shape references the SAME project / phase / member ids used by the
 * projects client (#32, `projects.ts`) so cross-links (`/projects/[id]`) resolve
 * and the daily hub (#27 My Work) points at the same work items.
 *
 * State machine (WORKFLOW_SPEC §1.6) and business rules enforced by the mock:
 * - Approval `in_review → done` is Gestor+/Admin ONLY (C3 / BR-049).
 * - Forward transitions require the task's project to be `active` (H4).
 * - A task with an unresolved blocking dependency cannot enter `in_progress`
 *   (BR-045); dependency graphs may never contain a cycle (BR-047).
 * - Blocked tasks stay visible and read as blocked — distinct hue + icon +
 *   label, never colour alone (BR-046).
 * - Membro sees / edits only tasks on projects they are a member of (BR-002 / H7).
 */

import type { Role } from "@/lib/session";

/* ------------------------------------------------------------------ *
 * Enums / unions
 * ------------------------------------------------------------------ */

/** Task lifecycle (WORKFLOW_SPEC §1.6). */
export type TaskState =
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done";

export const TASK_STATES: TaskState[] = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
];

/** The board columns, in reading order (blocked sits between review and done). */
export const TASK_BOARD_STATES: TaskState[] = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
];

/** Priority ranking (baixa / normal / alta / urgente). */
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const TASK_PRIORITIES: TaskPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export function priorityRank(p: TaskPriority): number {
  return { low: 0, normal: 1, high: 2, urgent: 3 }[p];
}

/* ------------------------------------------------------------------ *
 * Sub-entities
 * ------------------------------------------------------------------ */

export interface TaskAssignee {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** A lightweight, content-defined label (e.g. "Design", "QA"). */
export interface TaskLabel {
  id: string;
  name: string;
}

/** Live view of another task this one depends on (BR-045). */
export interface TaskDependencyRef {
  id: string;
  title: string;
  state: TaskState;
  /** True when the dependency is `done` — an unresolved dep gates start. */
  resolved: boolean;
}

/* ------------------------------------------------------------------ *
 * Core entity
 * ------------------------------------------------------------------ */

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  phaseId: string | null;
  phaseName: string | null;
  state: TaskState;
  priority: TaskPriority;
  assignees: TaskAssignee[];
  /** ISO-8601 date (yyyy-mm-dd) or null for an undated (backlog) task. */
  dueDate: string | null;
  labels: TaskLabel[];
  checklist: TaskChecklistItem[];
  /** Tasks that must be `done` before this one may start (BR-045). Live. */
  dependencies: TaskDependencyRef[];
  /** Derived: any dependency not yet `done`. */
  hasUnresolvedDependencies: boolean;
  /** Populated only while `state === "blocked"` (BR-046). */
  blockedReason: string | null;
  /** Optional task that is the source of the block (associate blocker). */
  blockerTaskId: string | null;
  blockerTaskTitle: string | null;
  commentCount: number;
  archived: boolean;
  /** Ordering within the task's board column. */
  order: number;
  /** Denormalized project lifecycle for H4 client-side guards. */
  projectActive: boolean;
  projectClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A row surfaced without side-panel detail (list/kanban/calendar consume Task). */

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

export interface CreateTaskInput {
  title: string;
  description: string;
  projectId: string;
  phaseId: string | null;
  assigneeIds: string[];
  priority: TaskPriority;
  dueDate: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  phaseId?: string | null;
  assigneeIds?: string[];
}

export interface BlockTaskInput {
  reason: string;
  /** Optionally associate the blocking task. */
  blockerTaskId?: string | null;
}

/* ------------------------------------------------------------------ *
 * Access predicates (shared by route guard, nav and data client)
 * ------------------------------------------------------------------ */

/** Everyone reaches the tasks area; Membro is row-scoped (BR-002). */
export function canAccessTasks(role: Role): boolean {
  return role === "admin" || role === "gestor" || role === "membro";
}

/** Approve (em revisão → concluída) — Gestor+/Admin only (C3 / BR-049). */
export function canApproveTasks(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/** Return-to-progress ("devolver") and reopen are Gestor+/Admin. */
export function canReviewTasks(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/* ------------------------------------------------------------------ *
 * Transition validation (WORKFLOW_SPEC §1.6)
 * ------------------------------------------------------------------ */

/**
 * Result of a transition check. `messageKey` is a suffix under
 * `tasks.transitionErrors.*` so the UI renders the exact spec pt-PT message.
 * `needsReason` flags a target (`blocked`) that must capture a blocker reason.
 */
export interface TransitionCheck {
  ok: boolean;
  messageKey: string | null;
  needsReason?: boolean;
}

const OK: TransitionCheck = { ok: true, messageKey: null };

/**
 * Validate a state transition for `task` → `to` by `role`, honouring the §1.6
 * table (approval, H4 pause/active, dependency gating, illegal skips). Used by
 * BOTH the Kanban drop handler and the side-panel state control so every path
 * blocks illegal moves identically.
 */
export function checkTaskTransition(
  task: Task,
  to: TaskState,
  role: Role
): TransitionCheck {
  const from = task.state;
  if (from === to) return { ok: false, messageKey: "sameState" };

  // Target: blocked — allowed from any active work state, needs a reason.
  if (to === "blocked") {
    if (from === "done") return { ok: false, messageKey: "cannotBlockDone" };
    return { ok: true, messageKey: null, needsReason: true };
  }

  // Source: blocked — unblock back to a non-blocked state.
  if (from === "blocked") {
    if (to === "done") return { ok: false, messageKey: "unblockFirst" };
    if (to === "in_progress") {
      if (!task.projectActive)
        return { ok: false, messageKey: "projectNotActive" };
      if (task.hasUnresolvedDependencies)
        return { ok: false, messageKey: "dependencyUnresolved" };
    }
    return OK;
  }

  switch (from) {
    case "todo":
      if (to === "in_progress") {
        if (!task.projectActive)
          return { ok: false, messageKey: "projectNotActive" };
        if (task.hasUnresolvedDependencies)
          return { ok: false, messageKey: "dependencyUnresolved" };
        return OK;
      }
      if (to === "in_review") return { ok: false, messageKey: "todoToReview" };
      if (to === "done") return { ok: false, messageKey: "todoToDone" };
      break;

    case "in_progress":
      if (to === "todo") return OK; // regress to backlog is allowed
      if (to === "in_review") {
        if (!task.projectActive)
          return { ok: false, messageKey: "projectNotActive" };
        return OK;
      }
      if (to === "done") return { ok: false, messageKey: "reviewFirst" };
      break;

    case "in_review":
      if (to === "done") {
        if (!canApproveTasks(role))
          return { ok: false, messageKey: "approvalOnly" };
        if (!task.projectActive)
          return { ok: false, messageKey: "projectNotActive" };
        return OK;
      }
      if (to === "in_progress") {
        // "Devolver" — Gestor+/Admin only.
        if (!canReviewTasks(role))
          return { ok: false, messageKey: "returnByManager" };
        return OK;
      }
      if (to === "todo") return { ok: false, messageKey: "reviewBackToTodo" };
      break;

    case "done":
      if (to === "in_progress") {
        // "Reabrir" — Gestor+/Admin, project not closed.
        if (!canReviewTasks(role))
          return { ok: false, messageKey: "reopenByManager" };
        if (task.projectClosed)
          return { ok: false, messageKey: "projectClosed" };
        return OK;
      }
      break;
  }

  return { ok: false, messageKey: "invalid" };
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type TaskErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_transition"
  | "dependency_cycle"
  | "reason_required"
  | "guard_failed"
  | "network";

export class TaskError extends Error {
  readonly code: TaskErrorCode;
  /** Optional i18n key hint under `tasks.errors.*` / `tasks.transitionErrors.*`. */
  readonly detailKey?: string;
  constructor(code: TaskErrorCode, detailKey?: string) {
    super(code);
    this.name = "TaskError";
    this.code = code;
    this.detailKey = detailKey;
  }
}
