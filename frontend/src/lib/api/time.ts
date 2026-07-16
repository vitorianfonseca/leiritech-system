/**
 * Time-tracking API client — MOCK implementation (F11 / issue #35).
 *
 * Backend is not wired yet. This module exports a typed `timeApi` whose methods
 * return promises exactly as the real HTTP client will; the integration agent
 * replaces the bodies with real `fetch` calls WITHOUT changing the signatures.
 * UI code (via TanStack Query) depends only on the `TimeApi` interface and the
 * models in `./time-types`.
 *
 * State lives in a module-level store so created / edited / deleted entries and
 * stopped-timer segments persist for the session — enough to exercise undo,
 * rollups and the summary tiles. Datetimes are seeded RELATIVE to "today" so the
 * period filters stay meaningful whenever the app runs.
 *
 * The single-active-timer contract (BR-040) is owned by
 * `src/lib/timer/timer-context.tsx` (shared with #27 / #34). This client only
 * PERSISTS a stopped segment via `timerStop`; it never holds running state.
 *
 * Project / phase / member ids match `tasks.ts` (#34) so cross-links resolve
 * and rollups line up with the delivery surfaces. Project budgets (hours) are
 * denormalized here for the hours-vs-budget rollups.
 */

import { addMinutes, formatISO, subDays } from "date-fns";
import type { Role } from "@/lib/session";
import {
  TimeError,
  computeRollups,
  sumTotals,
  validateTimeEntry,
  type CreateTimeEntryInput,
  type RollupDimension,
  type RollupRow,
  type StopTimerInput,
  type TimeDirectoryUser,
  type TimeEntry,
  type TimeScope,
  type TimeTaskOption,
  type TimeTotals,
  type UpdateTimeEntryInput,
} from "./time-types";

const MOCK_LATENCY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const timeRoutes = {
  list: () => "/time",
} as const;

/* ------------------------------------------------------------------ *
 * Directory (aligned with tasks.ts #34)
 * ------------------------------------------------------------------ */

const DIRECTORY: Record<string, TimeDirectoryUser> = {
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", avatarUrl: null },
  "dev-membro": { id: "dev-membro", name: "Carla Nunes", avatarUrl: null },
  "u-sofia": { id: "u-sofia", name: "Sofia Marques", avatarUrl: null },
  "u-diogo": { id: "u-diogo", name: "Diogo Ferreira", avatarUrl: null },
  "u-tiago": { id: "u-tiago", name: "Tiago Lopes", avatarUrl: null },
  "u-ines": { id: "u-ines", name: "Inês Duarte", avatarUrl: null },
};

function userName(userId: string): string {
  return DIRECTORY[userId]?.name ?? userId;
}

/* ------------------------------------------------------------------ *
 * Projects / phases / tasks (aligned with tasks.ts #34) + budgets
 * ------------------------------------------------------------------ */

interface PhaseRef {
  id: string;
  name: string;
  /** Budgeted hours for the phase (drives hours-vs-budget rollups). */
  hoursBudget: number;
}

interface ProjectRef {
  id: string;
  name: string;
  active: boolean;
  closed: boolean;
  memberIds: string[];
  /** Budgeted hours for the whole project. */
  hoursBudget: number;
  phases: PhaseRef[];
}

const PROJECTS: Record<string, ProjectRef> = {
  "p-1": {
    id: "p-1",
    name: "Rebranding + Manual de marca",
    active: true,
    closed: false,
    memberIds: ["dev-gestor", "dev-membro", "u-tiago"],
    hoursBudget: 180,
    phases: [
      { id: "p-1-ph1", name: "Descoberta e estratégia", hoursBudget: 40 },
      { id: "p-1-ph2", name: "Conceito visual", hoursBudget: 80 },
      { id: "p-1-ph3", name: "Manual de marca", hoursBudget: 60 },
    ],
  },
  "p-2": {
    id: "p-2",
    name: "App Fidelização — Lumina",
    active: true,
    closed: false,
    memberIds: ["dev-gestor", "dev-membro", "u-ines", "u-sofia"],
    hoursBudget: 320,
    phases: [
      { id: "p-2-ph1", name: "Descoberta de produto", hoursBudget: 60 },
      { id: "p-2-ph2", name: "Design de interface", hoursBudget: 90 },
      { id: "p-2-ph3", name: "Desenvolvimento", hoursBudget: 140 },
      { id: "p-2-ph4", name: "Lançamento", hoursBudget: 30 },
    ],
  },
  "p-3": {
    id: "p-3",
    name: "Portal Interno — Lumina",
    active: false, // on_hold — timing frozen (BR-042)
    closed: false,
    memberIds: ["u-sofia", "u-diogo", "u-tiago"],
    hoursBudget: 240,
    phases: [
      { id: "p-3-ph1", name: "Levantamento de requisitos", hoursBudget: 50 },
      { id: "p-3-ph2", name: "Arquitetura", hoursBudget: 70 },
      { id: "p-3-ph3", name: "Desenvolvimento", hoursBudget: 120 },
    ],
  },
  "p-4": {
    id: "p-4",
    name: "Website + Reservas — Solar do Douro",
    active: false, // planning — timing frozen (BR-042)
    closed: false,
    memberIds: ["dev-gestor", "dev-membro"],
    hoursBudget: 120,
    phases: [
      { id: "p-4-ph1", name: "Planeamento", hoursBudget: 30 },
      { id: "p-4-ph2", name: "Design", hoursBudget: 90 },
    ],
  },
};

interface TaskRef {
  id: string;
  title: string;
  projectId: string;
  phaseId: string | null;
}

/** Task directory aligned with tasks.ts seed ids. */
const TASKS: TaskRef[] = [
  { id: "t-1", title: "Rever wireframes da homepage", projectId: "p-2", phaseId: "p-2-ph2" },
  { id: "t-2", title: "Definir arquitetura de informação", projectId: "p-2", phaseId: "p-2-ph1" },
  { id: "t-3", title: "Exportar assets do logótipo", projectId: "p-1", phaseId: "p-1-ph2" },
  { id: "t-4", title: "Integrar gateway de pagamento", projectId: "p-2", phaseId: "p-2-ph3" },
  { id: "t-5", title: "Guia de tom de voz", projectId: "p-1", phaseId: "p-1-ph3" },
  { id: "t-6", title: "Workshop de descoberta", projectId: "p-1", phaseId: "p-1-ph1" },
  { id: "t-7", title: "Protótipo de alta fidelidade", projectId: "p-2", phaseId: "p-2-ph2" },
  { id: "t-8", title: "Mapa de requisitos", projectId: "p-3", phaseId: "p-3-ph1" },
];

function taskRef(taskId: string): TaskRef | undefined {
  return TASKS.find((t) => t.id === taskId);
}

function phaseRef(projectId: string, phaseId: string | null): PhaseRef | null {
  if (!phaseId) return null;
  return PROJECTS[projectId]?.phases.find((p) => p.id === phaseId) ?? null;
}

/** Task options that can receive time. Only tasks on ACTIVE projects (BR-042). */
export function timeTaskOptions(): TimeTaskOption[] {
  return TASKS.map((t) => {
    const project = PROJECTS[t.projectId];
    const phase = phaseRef(t.projectId, t.phaseId);
    return {
      taskId: t.id,
      taskTitle: t.title,
      projectId: t.projectId,
      projectName: project?.name ?? t.projectId,
      phaseId: t.phaseId,
      phaseName: phase?.name ?? null,
      projectActive: (project?.active ?? false) && !(project?.closed ?? false),
    };
  });
}

/** Budget lookup passed to `computeRollups`. */
const budgetLookup = {
  project: (projectId: string): number | null =>
    PROJECTS[projectId]?.hoursBudget ?? null,
  phase: (phaseId: string): number | null => {
    for (const p of Object.values(PROJECTS)) {
      const ph = p.phases.find((x) => x.id === phaseId);
      if (ph) return ph.hoursBudget;
    }
    return null;
  },
};

/* ------------------------------------------------------------------ *
 * Store + seed
 * ------------------------------------------------------------------ */

const store = new Map<string, TimeEntry>();
let seeded = false;

function iso(date: Date): string {
  return formatISO(date);
}

/** Build an entry at `dayOffset` days ago, starting at `hour:00` for `mins`. */
function seedEntry(
  taskId: string,
  userId: string,
  dayOffset: number,
  hour: number,
  mins: number,
  billable: boolean,
  description: string
): TimeEntry {
  const t = taskRef(taskId)!;
  const project = PROJECTS[t.projectId];
  const phase = phaseRef(t.projectId, t.phaseId);
  const start = subDays(new Date(), dayOffset);
  start.setHours(hour, 0, 0, 0);
  const end = addMinutes(start, mins);
  const id = uid("te");
  return {
    id,
    taskId,
    taskTitle: t.title,
    projectId: t.projectId,
    projectName: project?.name ?? t.projectId,
    phaseId: t.phaseId,
    phaseName: phase?.name ?? null,
    userId,
    userName: userName(userId),
    startedAt: iso(start),
    endedAt: iso(end),
    durationMinutes: mins,
    description,
    billable,
    source: "manual",
    createdAt: iso(end),
  };
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  const rows: TimeEntry[] = [
    seedEntry("t-1", "dev-membro", 0, 9, 95, true, "Revisão dos wireframes e ajustes de layout"),
    seedEntry("t-4", "dev-membro", 1, 10, 130, true, "Integração inicial do gateway"),
    seedEntry("t-3", "dev-membro", 1, 14, 45, false, "Exportação de assets (interno)"),
    seedEntry("t-7", "dev-membro", 2, 9, 180, true, "Protótipo de alta fidelidade"),
    seedEntry("t-6", "dev-gestor", 0, 11, 60, true, "Facilitação do workshop"),
    seedEntry("t-5", "dev-gestor", 2, 15, 75, false, "Preparação do guia de tom de voz"),
    seedEntry("t-1", "u-sofia", 1, 9, 120, true, "Apoio à revisão de UI"),
    seedEntry("t-2", "u-ines", 3, 10, 150, true, "Definição de arquitetura de informação"),
    seedEntry("t-4", "dev-gestor", 3, 13, 90, true, "Revisão de integração"),
    seedEntry("t-7", "u-sofia", 4, 9, 200, true, "Iteração do protótipo"),
    seedEntry("t-3", "dev-admin", 5, 16, 40, false, "Coordenação (interno)"),
  ];
  for (const r of rows) store.set(r.id, r);
}

/* ------------------------------------------------------------------ *
 * Scoping (WORKFLOW_SPEC §3 — Time rows)
 * ------------------------------------------------------------------ */

/** Project ids the actor manages / belongs to (for the team view). */
function actorProjectIds(role: Role, userId: string): Set<string> {
  const ids = new Set<string>();
  for (const p of Object.values(PROJECTS)) {
    if (role === "admin") ids.add(p.id);
    else if (p.memberIds.includes(userId)) ids.add(p.id);
  }
  return ids;
}

/**
 * Entries visible to the actor for the requested scope.
 * - `own` — the actor's own entries only.
 * - `team` — Admin: everything; Gestor: entries by members on the actor's own
 *   projects (👤). Membro may never request `team`.
 */
function visibleEntries(role: Role, userId: string, scope: TimeScope): TimeEntry[] {
  seed();
  const all = [...store.values()];
  if (scope === "own") return all.filter((e) => e.userId === userId);

  if (role === "admin") return all;
  if (role === "gestor") {
    const projectIds = actorProjectIds(role, userId);
    return all.filter((e) => projectIds.has(e.projectId));
  }
  // Membro cannot view others — degrade to own (defensive; UI hides the toggle).
  return all.filter((e) => e.userId === userId);
}

/* ------------------------------------------------------------------ *
 * Public API surface
 * ------------------------------------------------------------------ */

export interface TimeListResult {
  entries: TimeEntry[];
  totals: TimeTotals;
}

export interface TimeApi {
  listEntries(role: Role, userId: string, scope: TimeScope): Promise<TimeListResult>;
  createEntry(input: CreateTimeEntryInput, userId: string): Promise<TimeEntry>;
  updateEntry(id: string, input: UpdateTimeEntryInput, userId: string): Promise<TimeEntry>;
  deleteEntry(id: string, userId: string): Promise<void>;
  /** Restore a previously deleted entry (undo). */
  restoreEntry(entry: TimeEntry): Promise<TimeEntry>;
  /** Persist a stopped timer segment as an entry (BR-040 handoff). */
  timerStop(input: StopTimerInput, userId: string): Promise<TimeEntry>;
  getRollups(
    role: Role,
    userId: string,
    scope: TimeScope,
    dimension: RollupDimension
  ): Promise<RollupRow[]>;
}

function buildEntry(
  taskId: string,
  userId: string,
  startedAt: string,
  endedAt: string,
  description: string,
  billable: boolean,
  source: TimeEntry["source"]
): TimeEntry {
  const t = taskRef(taskId);
  if (!t) throw new TimeError("not_found");
  const project = PROJECTS[t.projectId];
  const active = (project?.active ?? false) && !(project?.closed ?? false);
  const check = validateTimeEntry(
    { taskId, startedAt, endedAt, projectActive: active },
    new Date()
  );
  if (!check.ok || check.durationMinutes == null) {
    const key =
      check.errors.task ?? check.errors.start ?? check.errors.end ?? "validation";
    if (key === "projectInactive") throw new TimeError("project_inactive", key);
    throw new TimeError("validation", key);
  }
  const phase = phaseRef(t.projectId, t.phaseId);
  return {
    id: uid("te"),
    taskId,
    taskTitle: t.title,
    projectId: t.projectId,
    projectName: project?.name ?? t.projectId,
    phaseId: t.phaseId,
    phaseName: phase?.name ?? null,
    userId,
    userName: userName(userId),
    startedAt,
    endedAt,
    durationMinutes: check.durationMinutes,
    description: description.trim(),
    billable,
    source,
    createdAt: iso(new Date()),
  };
}

export const timeApi: TimeApi = {
  async listEntries(role, userId, scope) {
    await delay(MOCK_LATENCY_MS);
    const entries = visibleEntries(role, userId, scope).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt)
    );
    return { entries, totals: sumTotals(entries) };
  },

  async createEntry(input, userId) {
    await delay(MOCK_LATENCY_MS);
    const entry = buildEntry(
      input.taskId,
      userId,
      input.startedAt,
      input.endedAt,
      input.description,
      input.billable,
      "manual"
    );
    store.set(entry.id, entry);
    return entry;
  },

  async updateEntry(id, input, userId) {
    await delay(MOCK_LATENCY_MS);
    const existing = store.get(id);
    if (!existing) throw new TimeError("not_found");
    if (existing.userId !== userId) throw new TimeError("forbidden");

    const startedAt = input.startedAt ?? existing.startedAt;
    const endedAt = input.endedAt ?? existing.endedAt;
    const check = validateTimeEntry({ taskId: existing.taskId, startedAt, endedAt });
    if (!check.ok || check.durationMinutes == null) {
      const key = check.errors.start ?? check.errors.end ?? "validation";
      throw new TimeError("validation", key);
    }
    const next: TimeEntry = {
      ...existing,
      startedAt,
      endedAt,
      durationMinutes: check.durationMinutes,
      description: input.description?.trim() ?? existing.description,
      billable: input.billable ?? existing.billable,
    };
    store.set(id, next);
    return next;
  },

  async deleteEntry(id, userId) {
    await delay(MOCK_LATENCY_MS);
    const existing = store.get(id);
    if (!existing) throw new TimeError("not_found");
    if (existing.userId !== userId) throw new TimeError("forbidden");
    store.delete(id);
  },

  async restoreEntry(entry) {
    await delay(MOCK_LATENCY_MS / 2);
    store.set(entry.id, entry);
    return entry;
  },

  async timerStop(input, userId) {
    await delay(MOCK_LATENCY_MS);
    const entry = buildEntry(
      input.taskId,
      userId,
      iso(new Date(input.startedAt)),
      iso(new Date(input.endedAt)),
      input.description ?? "",
      input.billable,
      "timer"
    );
    store.set(entry.id, entry);
    return entry;
  },

  async getRollups(role, userId, scope, dimension) {
    await delay(MOCK_LATENCY_MS);
    const entries = visibleEntries(role, userId, scope);
    return computeRollups(entries, dimension, budgetLookup);
  },
};
