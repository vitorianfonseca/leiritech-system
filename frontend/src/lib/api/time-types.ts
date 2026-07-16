/**
 * Time-tracking API models (F11 / issue #35).
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * Business rules enforced by the mock and consumed by the UI:
 * - **BR-040** — a single active timer app-wide. Enforced at the state layer by
 *   `src/lib/timer/timer-context.tsx` (shared with #27 My Work and #34 Tasks);
 *   this client only PERSISTS a stopped timer segment as a `TimeEntry`.
 * - **BR-041** — every entry is attributed to a task (task is required).
 * - **BR-042** — a timer / manual entry may only target a task on an *active*
 *   project; paused/closed projects stop timing.
 * - **BR-044** — manual entry validation (end after start, not in the future,
 *   sane duration).
 * - View scope (WORKFLOW_SPEC §3): everyone sees their own entries; a Gestor
 *   additionally sees entries of members on their own projects (👤); a Membro
 *   sees own only (❌).
 *
 * Project / phase / member ids match `tasks.ts` (#34) and `projects.ts` (#32)
 * so cross-links resolve and rollups line up with the delivery surfaces.
 */

import type { Role } from "@/lib/session";

/* ------------------------------------------------------------------ *
 * Core entity
 * ------------------------------------------------------------------ */

/** How a time entry was recorded. */
export type TimeEntrySource = "timer" | "manual";

export interface TimeEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  phaseId: string | null;
  phaseName: string | null;
  /** Author of the entry. */
  userId: string;
  userName: string;
  /** ISO-8601 datetime (local wall clock) the work started. */
  startedAt: string;
  /** ISO-8601 datetime the work ended. */
  endedAt: string;
  /** Derived minutes between start and end (always ≥ 0). */
  durationMinutes: number;
  description: string;
  /** Billable to the client (drives billable vs non-billable rollups). */
  billable: boolean;
  source: TimeEntrySource;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Reference data (aligned with tasks.ts / projects.ts)
 * ------------------------------------------------------------------ */

/** A task that can receive time (only tasks on active projects — BR-042). */
export interface TimeTaskOption {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  phaseId: string | null;
  phaseName: string | null;
  /** False when the project is paused/closed — timing is blocked (BR-042). */
  projectActive: boolean;
}

export interface TimeDirectoryUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

/** Manual entry input (BR-041 task required; BR-044 range validation). */
export interface CreateTimeEntryInput {
  taskId: string;
  startedAt: string;
  endedAt: string;
  description: string;
  billable: boolean;
}

export interface UpdateTimeEntryInput {
  startedAt?: string;
  endedAt?: string;
  description?: string;
  billable?: boolean;
}

/** Payload the timer sends when stopping — persisted as a `TimeEntry`. */
export interface StopTimerInput {
  taskId: string;
  startedAt: number;
  endedAt: number;
  billable: boolean;
  description?: string;
}

/* ------------------------------------------------------------------ *
 * Rollups
 * ------------------------------------------------------------------ */

/** Dimension a rollup groups by. */
export type RollupDimension = "task" | "phase" | "project" | "user";

export const ROLLUP_DIMENSIONS: RollupDimension[] = [
  "project",
  "phase",
  "task",
  "user",
];

export interface RollupRow {
  /** Stable id of the grouped entity. */
  id: string;
  /** Display label (task title / phase name / project name / user name). */
  label: string;
  /** Secondary label (e.g. project name for a task/phase row). */
  sublabel: string | null;
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  entryCount: number;
  /** Budget in hours for the group, when one applies (project & phase only). */
  budgetHours: number | null;
}

/* ------------------------------------------------------------------ *
 * Viewing scope + permissions (WORKFLOW_SPEC §3, Time rows)
 * ------------------------------------------------------------------ */

/** Whose entries the user is looking at. */
export type TimeScope = "own" | "team";

/** Everyone reaches the time surface (own entries at minimum). */
export function canAccessTime(role: Role): boolean {
  return role === "admin" || role === "gestor" || role === "membro";
}

/**
 * Whether the role may view OTHER people's entries. Gestor 👤 (own project
 * members) and Admin ✅; Membro ❌ (own only — BR-002).
 */
export function canViewTeamTime(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/* ------------------------------------------------------------------ *
 * Validation (BR-044)
 * ------------------------------------------------------------------ */

/** Max plausible single entry — 24h. Guards fat-finger date typos. */
export const MAX_ENTRY_MINUTES = 24 * 60;

export type TimeEntryFieldError =
  | "taskRequired"
  | "startRequired"
  | "endRequired"
  | "endBeforeStart"
  | "future"
  | "tooLong"
  | "projectInactive";

export interface TimeEntryValidation {
  ok: boolean;
  errors: Partial<Record<"task" | "start" | "end", TimeEntryFieldError>>;
  /** Derived duration in minutes when start & end are both valid. */
  durationMinutes: number | null;
}

/**
 * Validate a manual entry draft (BR-041 + BR-044). Pure — used by BOTH the
 * dialog (live field errors) and the mock client (authoritative guard) so the
 * two never diverge. `now` is injectable for deterministic tests.
 */
export function validateTimeEntry(
  draft: {
    taskId: string | null;
    startedAt: string;
    endedAt: string;
    projectActive?: boolean;
  },
  now: Date = new Date()
): TimeEntryValidation {
  const errors: TimeEntryValidation["errors"] = {};

  if (!draft.taskId) errors.task = "taskRequired";
  else if (draft.projectActive === false) errors.task = "projectInactive";

  const start = draft.startedAt ? new Date(draft.startedAt) : null;
  const end = draft.endedAt ? new Date(draft.endedAt) : null;
  const startValid = start && !Number.isNaN(start.getTime());
  const endValid = end && !Number.isNaN(end.getTime());

  if (!startValid) errors.start = "startRequired";
  if (!endValid) errors.end = "endRequired";

  let durationMinutes: number | null = null;
  if (startValid && endValid) {
    if (end.getTime() <= start.getTime()) {
      errors.end = "endBeforeStart";
    } else if (end.getTime() > now.getTime() + 60_000) {
      // Small grace window for clock skew; entries can't be in the future.
      errors.end = "future";
    } else {
      const mins = Math.round((end.getTime() - start.getTime()) / 60_000);
      if (mins > MAX_ENTRY_MINUTES) errors.end = "tooLong";
      else durationMinutes = mins;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, durationMinutes };
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type TimeErrorCode =
  | "not_found"
  | "forbidden"
  | "validation"
  | "project_inactive"
  | "network";

export class TimeError extends Error {
  readonly code: TimeErrorCode;
  /** Optional i18n key hint under `time.errors.*`. */
  readonly detailKey?: string;
  constructor(code: TimeErrorCode, detailKey?: string) {
    super(code);
    this.name = "TimeError";
    this.code = code;
    this.detailKey = detailKey;
  }
}

/* ------------------------------------------------------------------ *
 * Rollup computation (pure — shared by client + UI)
 * ------------------------------------------------------------------ */

interface BudgetLookup {
  project: (projectId: string) => number | null;
  phase: (phaseId: string) => number | null;
}

/**
 * Aggregate entries into rollup rows for a dimension, splitting billable from
 * non-billable and attaching an hours budget where one exists. Sorted by total
 * time descending so the heaviest buckets read first.
 */
export function computeRollups(
  entries: TimeEntry[],
  dimension: RollupDimension,
  budget?: BudgetLookup
): RollupRow[] {
  const rows = new Map<string, RollupRow>();

  for (const e of entries) {
    let id: string;
    let label: string;
    let sublabel: string | null;
    let budgetHours: number | null = null;

    switch (dimension) {
      case "task":
        id = e.taskId;
        label = e.taskTitle;
        sublabel = e.projectName;
        break;
      case "phase":
        id = e.phaseId ?? `${e.projectId}::no-phase`;
        label = e.phaseName ?? "";
        sublabel = e.projectName;
        budgetHours = e.phaseId ? budget?.phase(e.phaseId) ?? null : null;
        break;
      case "project":
        id = e.projectId;
        label = e.projectName;
        sublabel = null;
        budgetHours = budget?.project(e.projectId) ?? null;
        break;
      case "user":
        id = e.userId;
        label = e.userName;
        sublabel = null;
        break;
    }

    const existing = rows.get(id);
    const row: RollupRow = existing ?? {
      id,
      label,
      sublabel,
      totalMinutes: 0,
      billableMinutes: 0,
      nonBillableMinutes: 0,
      entryCount: 0,
      budgetHours,
    };
    row.totalMinutes += e.durationMinutes;
    if (e.billable) row.billableMinutes += e.durationMinutes;
    else row.nonBillableMinutes += e.durationMinutes;
    row.entryCount += 1;
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/** Sum totals across rollup rows for the summary tiles. */
export interface TimeTotals {
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  entryCount: number;
}

export function sumTotals(entries: TimeEntry[]): TimeTotals {
  return entries.reduce<TimeTotals>(
    (acc, e) => ({
      totalMinutes: acc.totalMinutes + e.durationMinutes,
      billableMinutes: acc.billableMinutes + (e.billable ? e.durationMinutes : 0),
      nonBillableMinutes:
        acc.nonBillableMinutes + (e.billable ? 0 : e.durationMinutes),
      entryCount: acc.entryCount + 1,
    }),
    { totalMinutes: 0, billableMinutes: 0, nonBillableMinutes: 0, entryCount: 0 }
  );
}
