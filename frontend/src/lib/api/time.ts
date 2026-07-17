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

import type { Role } from "@/lib/session";
import { http, HttpError } from "@/lib/api/http";
import {
  TimeError,
  computeRollups,
  sumTotals,
  type CreateTimeEntryInput,
  type RollupDimension,
  type RollupRow,
  type StopTimerInput,
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


/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const timeRoutes = {
  list: () => "/time",
} as const;

/* ------------------------------------------------------------------ *
 * Directory (aligned with tasks.ts #34)
 * ------------------------------------------------------------------ */



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




/* ------------------------------------------------------------------ *
 * Scoping (WORKFLOW_SPEC §3 — Time rows)
 * ------------------------------------------------------------------ */



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


/* ------------------------------------------------------------------ *
 * Backend wiring (F11 routes). Response DTO is camelCased by `http`.
 * ------------------------------------------------------------------ */

interface TimeEntryDto {
  id: string;
  userId: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  description: string | null;
  billable: boolean;
  createdAt: string;
  updatedAt: string;
  isRunning: boolean;
  durationMinutes: number | null;
}

/** Map a backend TimeEntryResponse to the UI `TimeEntry`. The backend stores only
 * the raw entry; all denormalized labels/budgets are enrichment gaps. */
function fromBackend(dto: TimeEntryDto): TimeEntry {
  return {
    id: dto.id,
    taskId: dto.taskId,
    // INTEGRATION-GAP: taskTitle — not provided by backend
    taskTitle: "",
    // INTEGRATION-GAP: projectId — not provided by backend (rollup grouping degraded)
    projectId: "",
    // INTEGRATION-GAP: projectName — not provided by backend
    projectName: "",
    // INTEGRATION-GAP: phaseId — not provided by backend
    phaseId: null,
    // INTEGRATION-GAP: phaseName — not provided by backend
    phaseName: null,
    userId: dto.userId,
    // INTEGRATION-GAP: userName — not provided by backend
    userName: "",
    startedAt: dto.startedAt,
    // INTEGRATION-GAP: a running entry has a null endedAt; fall back to startedAt
    endedAt: dto.endedAt ?? dto.startedAt,
    durationMinutes: dto.durationMinutes ?? 0,
    description: dto.description ?? "",
    billable: dto.billable,
    // INTEGRATION-GAP: source (timer|manual) — not distinguished by backend
    source: "manual",
    createdAt: dto.createdAt,
  };
}

/** Translate an `HttpError` into the domain `TimeError`, preserving mock codes. */
function mapTimeError(err: unknown): TimeError {
  if (err instanceof TimeError) return err;
  if (err instanceof HttpError) {
    if (err.status === 404) return new TimeError("not_found");
    if (err.status === 403) return new TimeError("forbidden");
    if (err.status === 0) return new TimeError("network");
    if (err.status === 409 || err.status === 422 || err.status === 400) {
      const code = (err.code ?? "").toUpperCase();
      if (code.includes("INACTIVE") || code.includes("PROJECT"))
        return new TimeError("project_inactive");
      return new TimeError("validation");
    }
  }
  return new TimeError("network");
}

export const timeApi: TimeApi = {
  // WIRED: GET /time — server scopes rows (own + team for Gestor/Admin) from the JWT.
  // INTEGRATION-GAP: scope (own vs team) not filterable here — no real user UUID to pass.
  async listEntries(role, userId, scope) {
    void role;
    void userId;
    void scope;
    try {
      const page = await http.get<{ items: TimeEntryDto[] }>("/time", {
        query: { page_size: 100 },
      });
      const entries = page.items
        .map(fromBackend)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return { entries, totals: sumTotals(entries) };
    } catch (err) {
      throw mapTimeError(err);
    }
  },

  // WIRED: POST /time (manual entry). Server owns the entry from the JWT.
  async createEntry(input, userId) {
    void userId;
    try {
      const dto = await http.post<TimeEntryDto>("/time", {
        taskId: input.taskId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        description: input.description,
        billable: input.billable,
      });
      return fromBackend(dto);
    } catch (err) {
      throw mapTimeError(err);
    }
  },

  // WIRED: PATCH /time/{id} — owner-only check enforced server-side.
  async updateEntry(id, input, userId) {
    void userId;
    const body: Record<string, unknown> = {};
    if (input.startedAt !== undefined) body.startedAt = input.startedAt;
    if (input.endedAt !== undefined) body.endedAt = input.endedAt;
    if (input.description !== undefined) body.description = input.description;
    if (input.billable !== undefined) body.billable = input.billable;
    try {
      return fromBackend(await http.patch<TimeEntryDto>(`/time/${id}`, body));
    } catch (err) {
      throw mapTimeError(err);
    }
  },

  // WIRED: DELETE /time/{id} — owner-only check enforced server-side.
  async deleteEntry(id, userId) {
    void userId;
    try {
      await http.delete(`/time/${id}`);
    } catch (err) {
      throw mapTimeError(err);
    }
  },

  // LEFT-ON-MOCK: no backend endpoint to restore a deleted entry (undo).
  async restoreEntry(entry) {
    // INTEGRATION-GAP: no backend endpoint — left on mock
    await delay(MOCK_LATENCY_MS / 2);
    store.set(entry.id, entry);
    return entry;
  },

  // WIRED: POST /time/stop — stops the server-side running timer.
  // INTEGRATION-GAP: backend ignores the client-provided task/start/end/description;
  // it stops whatever timer /time/start opened and sets endedAt server-side.
  async timerStop(input, userId) {
    void input;
    void userId;
    try {
      return fromBackend(await http.post<TimeEntryDto>("/time/stop"));
    } catch (err) {
      throw mapTimeError(err);
    }
  },

  // WIRED (aggregated): GET /time then compute rollups client-side.
  // INTEGRATION-GAP: projectId/phaseId/labels absent from backend rows, so
  // project/phase/task grouping and budget lookups are degraded.
  async getRollups(role, userId, scope, dimension) {
    void role;
    void userId;
    void scope;
    try {
      const page = await http.get<{ items: TimeEntryDto[] }>("/time", {
        query: { page_size: 100 },
      });
      const entries = page.items.map(fromBackend);
      return computeRollups(entries, dimension, budgetLookup);
    } catch (err) {
      throw mapTimeError(err);
    }
  },
};
