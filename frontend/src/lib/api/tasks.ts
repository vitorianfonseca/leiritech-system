/**
 * Tasks API client — MOCK implementation (F10).
 *
 * Backend is not wired yet. This module exports a typed `tasksApi` whose methods
 * return promises exactly as the real HTTP client will; the integration agent
 * replaces the bodies with real `fetch` calls WITHOUT changing the signatures.
 * UI code (via TanStack Query) depends only on the `TasksApi` interface and the
 * models in `./tasks-types`.
 *
 * State lives in a module-level store so inline edits, transitions, checklist
 * changes and dependency edits persist for the session — enough to exercise
 * undo and re-bucketing. Dates are seeded RELATIVE to "today" so overdue / due
 * buckets stay meaningful whenever the app runs.
 *
 * The mock enforces:
 * - the §1.6 state machine (via `checkTaskTransition`),
 * - dependency gating (BR-045) + cycle prevention (BR-047),
 * - approval gating (C3/BR-049) and H4 active-project forward gating,
 * - Membro row scoping to member projects (BR-002/H7).
 *
 * Project / phase / member ids match `projects.ts` (#32) so cross-links resolve.
 */

import { addDays, format, startOfDay } from "date-fns";
import type { Role } from "@/lib/session";
import { http, HttpError } from "@/lib/api/http";
import {
  collaborationApi,
  type CollaborationApi,
} from "@/lib/api/collaboration";
import type {
  ActivityLog,
  Comment,
  CreateCommentInput,
  DirectoryUser,
  UpdateCommentInput,
} from "@/lib/api/collaboration-types";
import {
  TaskError,
  type BlockTaskInput,
  type CreateTaskInput,
  type Task,
  type TaskAssignee,
  type TaskChecklistItem,
  type TaskDependencyRef,
  type TaskLabel,
  type TaskPriority,
  type TaskState,
  type UpdateTaskInput,
} from "./tasks-types";

const MOCK_LATENCY_MS = 320;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const taskRoutes = {
  list: () => "/tasks",
} as const;

/* ------------------------------------------------------------------ *
 * Directory + projects (aligned with projects.ts #32)
 * ------------------------------------------------------------------ */

const DIRECTORY: Record<string, DirectoryUser> = {
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@leiritech.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@leiritech.pt", avatarUrl: null },
  "dev-membro": { id: "dev-membro", name: "Carla Nunes", email: "carla@leiritech.pt", avatarUrl: null },
  "u-sofia": { id: "u-sofia", name: "Sofia Marques", email: "sofia@leiritech.pt", avatarUrl: null },
  "u-diogo": { id: "u-diogo", name: "Diogo Ferreira", email: "diogo@leiritech.pt", avatarUrl: null },
  "u-tiago": { id: "u-tiago", name: "Tiago Lopes", email: "tiago@leiritech.pt", avatarUrl: null },
  "u-ines": { id: "u-ines", name: "Inês Duarte", email: "ines@leiritech.pt", avatarUrl: null },
};

function assignee(userId: string): TaskAssignee {
  const u = DIRECTORY[userId] ?? { id: userId, name: userId, email: "", avatarUrl: null };
  return { userId: u.id, name: u.name, avatarUrl: u.avatarUrl };
}

/** Users assignable, exposed to the create/assign controls. */
export const TASK_DIRECTORY: TaskAssignee[] = Object.values(DIRECTORY).map((u) => ({
  userId: u.id,
  name: u.name,
  avatarUrl: u.avatarUrl,
}));

interface ProjectRef {
  id: string;
  name: string;
  /** WORKFLOW_SPEC §1.3 lifecycle — drives H4 gating. */
  active: boolean;
  closed: boolean;
  memberIds: string[];
  phases: { id: string; name: string }[];
}

/** Denormalized from projects.ts seed (#32) — same ids so links resolve. */
const PROJECTS: Record<string, ProjectRef> = {
  "p-1": {
    id: "p-1",
    name: "Rebranding + Manual de marca",
    active: true,
    closed: false,
    memberIds: ["dev-gestor", "dev-membro", "u-tiago"],
    phases: [
      { id: "p-1-ph1", name: "Descoberta e estratégia" },
      { id: "p-1-ph2", name: "Conceito visual" },
      { id: "p-1-ph3", name: "Manual de marca" },
    ],
  },
  "p-2": {
    id: "p-2",
    name: "App Fidelização — Lumina",
    active: true,
    closed: false,
    memberIds: ["dev-gestor", "dev-membro", "u-ines", "u-sofia"],
    phases: [
      { id: "p-2-ph1", name: "Descoberta de produto" },
      { id: "p-2-ph2", name: "Design de interface" },
      { id: "p-2-ph3", name: "Desenvolvimento" },
      { id: "p-2-ph4", name: "Lançamento" },
    ],
  },
  "p-3": {
    id: "p-3",
    name: "Portal Interno — Lumina",
    active: false, // on_hold → forward transitions frozen (H4)
    closed: false,
    memberIds: ["u-sofia", "u-diogo", "u-tiago"],
    phases: [
      { id: "p-3-ph1", name: "Levantamento de requisitos" },
      { id: "p-3-ph2", name: "Arquitetura" },
      { id: "p-3-ph3", name: "Desenvolvimento" },
    ],
  },
  "p-4": {
    id: "p-4",
    name: "Website + Reservas — Solar do Douro",
    active: false, // planning → forward transitions frozen (H4)
    closed: false,
    memberIds: ["dev-gestor", "dev-membro"],
    phases: [
      { id: "p-4-ph1", name: "Planeamento" },
      { id: "p-4-ph2", name: "Design" },
    ],
  },
};

/** Selectable projects for the filter + create form (label resolves the name). */
export function projectOptions(): { id: string; name: string }[] {
  return Object.values(PROJECTS).map((p) => ({ id: p.id, name: p.name }));
}

export function phaseOptions(projectId: string): { id: string; name: string }[] {
  return PROJECTS[projectId]?.phases ?? [];
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

const LABELS: Record<string, TaskLabel> = {
  design: { id: "design", name: "Design" },
  dev: { id: "dev", name: "Desenvolvimento" },
  content: { id: "content", name: "Conteúdo" },
  qa: { id: "qa", name: "QA" },
  research: { id: "research", name: "Investigação" },
};

function label(id: keyof typeof LABELS): TaskLabel {
  return LABELS[id];
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

interface StoredTask {
  id: string;
  title: string;
  description: string;
  projectId: string;
  phaseId: string | null;
  state: TaskState;
  priority: TaskPriority;
  assigneeIds: string[];
  dueDate: string | null;
  labels: TaskLabel[];
  checklist: TaskChecklistItem[];
  dependencyIds: string[];
  blockedReason: string | null;
  blockerTaskId: string | null;
  commentCount: number;
  archived: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

const store = new Map<string, StoredTask>();
const activityByTask = new Map<string, ActivityLog[]>();
let seeded = false;

function pushActivity(
  taskId: string,
  actorId: string,
  action: ActivityLog["action"],
  extra: Partial<Pick<ActivityLog, "field" | "before" | "after">> = {}
): void {
  const u = DIRECTORY[actorId] ?? { id: actorId, name: actorId, email: "", avatarUrl: null };
  const list = activityByTask.get(taskId) ?? [];
  list.push({
    id: uid("ta"),
    entityType: "task",
    entityId: taskId,
    actor: u,
    action,
    field: extra.field,
    before: extra.before ?? null,
    after: extra.after ?? null,
    createdAt: new Date().toISOString(),
  });
  activityByTask.set(taskId, list);
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

let orderCounter = 0;

function make(t: Partial<StoredTask> & Pick<StoredTask, "id" | "title" | "projectId" | "state">): void {
  const now = new Date().toISOString();
  store.set(t.id, {
    description: "",
    phaseId: null,
    priority: "normal",
    assigneeIds: [],
    dueDate: null,
    labels: [],
    checklist: [],
    dependencyIds: [],
    blockedReason: null,
    blockerTaskId: null,
    commentCount: 0,
    archived: false,
    order: (orderCounter += 1),
    createdAt: now,
    updatedAt: now,
    ...t,
  });
  activityByTask.set(t.id, [
    {
      id: `${t.id}-a1`,
      entityType: "task",
      entityId: t.id,
      actor: DIRECTORY["dev-gestor"],
      action: "created",
      before: null,
      after: null,
      createdAt: now,
    },
  ]);
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  orderCounter = 0;

  make({
    id: "tk-1",
    title: "Explorar direções de conceito visual",
    description: "Três rotas visuais distintas para apresentar ao cliente.",
    projectId: "p-1",
    phaseId: "p-1-ph2",
    state: "in_progress",
    priority: "high",
    assigneeIds: ["dev-membro", "u-tiago"],
    dueDate: isoDate(1),
    labels: [label("design")],
    checklist: [
      { id: "c1", text: "Moodboard aprovado", done: true },
      { id: "c2", text: "Rota A", done: true },
      { id: "c3", text: "Rota B", done: false },
      { id: "c4", text: "Rota C", done: false },
    ],
    commentCount: 3,
  });

  make({
    id: "tk-2",
    title: "Rever paleta cromática com o cliente",
    description: "Sessão de validação da paleta antes de avançar para aplicação.",
    projectId: "p-1",
    phaseId: "p-1-ph2",
    state: "todo",
    priority: "urgent",
    assigneeIds: ["dev-membro"],
    dueDate: isoDate(-2), // overdue (BR-048)
    labels: [label("design"), label("research")],
    dependencyIds: ["tk-1"], // gated until tk-1 is done (BR-045)
    commentCount: 1,
  });

  make({
    id: "tk-3",
    title: "Preparar guião do manual de marca",
    projectId: "p-1",
    phaseId: "p-1-ph3",
    state: "todo",
    priority: "normal",
    assigneeIds: ["u-tiago"],
    dueDate: isoDate(6),
    labels: [label("content")],
  });

  make({
    id: "tk-4",
    title: "Aplicar identidade a rótulos",
    projectId: "p-1",
    phaseId: "p-1-ph3",
    state: "in_review",
    priority: "high",
    assigneeIds: ["dev-membro"],
    dueDate: isoDate(0),
    labels: [label("design")],
    commentCount: 2,
  });

  make({
    id: "tk-5",
    title: "Entregar logótipo em formatos finais",
    projectId: "p-1",
    phaseId: "p-1-ph1",
    state: "done",
    priority: "normal",
    assigneeIds: ["dev-membro"],
    dueDate: isoDate(-12),
    labels: [label("design")],
  });

  make({
    id: "tk-6",
    title: "Definir modelo de pontos de fidelização",
    description: "Regras de acumulação e resgate de pontos.",
    projectId: "p-2",
    phaseId: "p-2-ph2",
    state: "in_progress",
    priority: "urgent",
    assigneeIds: ["u-sofia"],
    dueDate: isoDate(-1), // overdue
    labels: [label("research")],
    commentCount: 4,
  });

  make({
    id: "tk-7",
    title: "Integração com a API de retalho",
    description: "Ligação ao ambiente de integração da Lumina.",
    projectId: "p-2",
    phaseId: "p-2-ph2",
    state: "blocked",
    priority: "high",
    assigneeIds: ["u-ines"],
    dueDate: isoDate(3),
    labels: [label("dev")],
    blockedReason: "A aguardar acesso ao ambiente de integração do cliente.",
    blockerTaskId: null,
    commentCount: 5,
  });

  make({
    id: "tk-8",
    title: "Protótipo navegável do fluxo principal",
    projectId: "p-2",
    phaseId: "p-2-ph2",
    state: "todo",
    priority: "normal",
    assigneeIds: ["u-sofia"],
    dueDate: isoDate(4),
    labels: [label("design")],
  });

  make({
    id: "tk-9",
    title: "Especificar ecrãs de campanhas",
    projectId: "p-2",
    phaseId: "p-2-ph2",
    state: "in_review",
    priority: "normal",
    assigneeIds: ["dev-membro"],
    dueDate: isoDate(2),
    labels: [label("design")],
    commentCount: 1,
  });

  make({
    id: "tk-10",
    title: "Módulo de permissões do portal",
    description: "RBAC do portal interno.",
    projectId: "p-3", // on_hold → forward frozen (H4)
    phaseId: "p-3-ph3",
    state: "blocked",
    priority: "high",
    assigneeIds: ["u-diogo"],
    dueDate: isoDate(-5),
    labels: [label("dev")],
    blockedReason: "Bloqueio contratual em resolução com o cliente.",
  });

  make({
    id: "tk-11",
    title: "Testes de aceitação do módulo de equipas",
    projectId: "p-3",
    phaseId: "p-3-ph3",
    state: "todo",
    priority: "normal",
    assigneeIds: ["u-tiago"],
    dueDate: isoDate(8),
    labels: [label("qa")],
  });

  make({
    id: "tk-12",
    title: "Levantar requisitos de reservas",
    description: "Entrevistas com a equipa do Solar do Douro.",
    projectId: "p-4", // planning → forward frozen (H4)
    phaseId: "p-4-ph1",
    state: "todo",
    priority: "normal",
    assigneeIds: ["dev-membro"],
    dueDate: isoDate(10),
    labels: [label("research")],
  });

  make({
    id: "tk-13",
    title: "Arranque do design do website",
    projectId: "p-4",
    phaseId: "p-4-ph2",
    state: "todo",
    priority: "low",
    assigneeIds: ["dev-membro"],
    dueDate: null,
    labels: [label("design")],
    dependencyIds: ["tk-12"],
  });

  make({
    id: "tk-14",
    title: "Documentar arquitetura do portal",
    projectId: "p-3",
    phaseId: "p-3-ph2",
    state: "done",
    priority: "low",
    assigneeIds: ["u-diogo"],
    dueDate: isoDate(-20),
    labels: [label("content")],
  });
}

/* ------------------------------------------------------------------ *
 * Derivations / presentation
 * ------------------------------------------------------------------ */

function dependencyRefs(rec: StoredTask): TaskDependencyRef[] {
  return rec.dependencyIds
    .map((id) => store.get(id))
    .filter((d): d is StoredTask => Boolean(d))
    .map((d) => ({
      id: d.id,
      title: d.title,
      state: d.state,
      resolved: d.state === "done",
    }));
}

function present(rec: StoredTask): Task {
  const project = PROJECTS[rec.projectId];
  const phase = project?.phases.find((p) => p.id === rec.phaseId) ?? null;
  const deps = dependencyRefs(rec);
  const blocker = rec.blockerTaskId ? store.get(rec.blockerTaskId) : null;
  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    projectId: rec.projectId,
    projectName: project?.name ?? rec.projectId,
    phaseId: rec.phaseId,
    phaseName: phase?.name ?? null,
    state: rec.state,
    priority: rec.priority,
    assignees: rec.assigneeIds.map(assignee),
    dueDate: rec.dueDate,
    labels: rec.labels.map((l) => ({ ...l })),
    checklist: rec.checklist.map((c) => ({ ...c })),
    dependencies: deps,
    hasUnresolvedDependencies: deps.some((d) => !d.resolved),
    blockedReason: rec.blockedReason,
    blockerTaskId: rec.blockerTaskId,
    blockerTaskTitle: blocker?.title ?? null,
    commentCount: rec.commentCount,
    archived: rec.archived,
    order: rec.order,
    projectActive: project?.active ?? false,
    projectClosed: project?.closed ?? false,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}


/** Can this user edit the task? Membro only on member projects (H7). */
export function canEditTask(task: Task, role: Role, userId: string): boolean {
  if (role === "admin" || role === "gestor") return true;
  const project = PROJECTS[task.projectId];
  return Boolean(project?.memberIds.includes(userId));
}

/* ------------------------------------------------------------------ *
 * Cycle detection (BR-047)
 * ------------------------------------------------------------------ */

export interface TasksApi {
  listTasks(role: Role, userId: string): Promise<Task[]>;
  getTask(id: string, role: Role, userId: string): Promise<Task>;
  createTask(input: CreateTaskInput, actorId: string): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput, actorId: string): Promise<Task>;
  /** Apply a state transition (guarded by §1.6). Throws `invalid_transition`. */
  transition(id: string, to: TaskState, role: Role, actorId: string): Promise<Task>;
  /** Undo-only: force a state without guards (powers move/transition undo). */
  restoreState(id: string, state: TaskState, actorId: string): Promise<Task>;
  block(id: string, input: BlockTaskInput, actorId: string): Promise<Task>;
  unblock(id: string, actorId: string): Promise<Task>;
  addDependency(id: string, dependsOnId: string, actorId: string): Promise<Task>;
  removeDependency(id: string, dependsOnId: string, actorId: string): Promise<Task>;
  addChecklistItem(id: string, text: string, actorId: string): Promise<Task>;
  toggleChecklistItem(id: string, itemId: string, actorId: string): Promise<Task>;
  removeChecklistItem(id: string, itemId: string, actorId: string): Promise<Task>;
  reorder(id: string, toState: TaskState, toIndex: number, actorId: string): Promise<Task>;
  duplicate(id: string, actorId: string): Promise<Task>;
  archive(id: string, actorId: string): Promise<Task>;
  restore(id: string, actorId: string): Promise<Task>;
  remove(id: string, actorId: string): Promise<Task>;
}

function require_(id: string): StoredTask {
  const rec = store.get(id);
  if (!rec) throw new TaskError("not_found");
  return rec;
}

function touch(rec: StoredTask): void {
  rec.updatedAt = new Date().toISOString();
}

/* ------------------------------------------------------------------ *
 * Backend wiring (F10 routes). Response DTO is camelCased by `http`.
 * ------------------------------------------------------------------ */

interface TaskDto {
  id: string;
  projectId: string;
  projectName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  title: string;
  description: string | null;
  primaryAssigneeId: string | null;
  primaryAssigneeName: string | null;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  status: TaskState;
  blockReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskChecklistItemDto {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  orderIndex: number;
}

function checklistItemFromBackend(dto: TaskChecklistItemDto): TaskChecklistItem {
  return { id: dto.id, text: dto.text, done: dto.done };
}

/** WIRED: GET /tasks/{id}/checklist (audit C12). Used to enrich a single task's
 * detail view — NOT called per-row from listTasks to avoid an N+1 fetch there,
 * so the board/list checklist progress badge only reflects reality once a task
 * has been opened in the side panel at least once this session (the badge
 * already hides itself at 0, so this degrades gracefully, not incorrectly). */
async function fetchChecklist(id: string): Promise<TaskChecklistItem[]> {
  const items = await http.get<TaskChecklistItemDto[]>(`/tasks/${id}/checklist`);
  return items
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(checklistItemFromBackend);
}

/** Map a backend TaskResponse to the UI `Task`. Enriched fields the backend does
 * not return are defaulted and flagged. */
function fromBackend(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? "",
    projectId: dto.projectId,
    projectName: dto.projectName ?? "",
    phaseId: dto.phaseId,
    phaseName: dto.phaseName ?? null,
    state: dto.status,
    priority: dto.priority,
    // INTEGRATION-GAP: avatarUrl — the payload joins the name, not the image.
    assignees: dto.primaryAssigneeId
      ? [{
          userId: dto.primaryAssigneeId,
          name: dto.primaryAssigneeName ?? "",
          avatarUrl: null,
        }]
      : [],
    dueDate: dto.dueDate,
    // INTEGRATION-GAP: labels — no backend endpoint
    labels: [],
    // INTEGRATION-GAP: checklist — no backend endpoint
    checklist: [],
    // INTEGRATION-GAP: dependency detail (title/state) — /dependencies returns ids only
    dependencies: [],
    // INTEGRATION-GAP: hasUnresolvedDependencies — not provided by backend
    hasUnresolvedDependencies: false,
    blockedReason: dto.blockReason,
    // INTEGRATION-GAP: blocker association (id/title) — not provided by backend
    blockerTaskId: null,
    blockerTaskTitle: null,
    // INTEGRATION-GAP: commentCount — not provided by backend
    commentCount: 0,
    archived: dto.archivedAt !== null,
    // INTEGRATION-GAP: board order — not persisted by backend
    order: 0,
    // INTEGRATION-GAP: project lifecycle — default active; backend is authoritative on transitions
    projectActive: true,
    projectClosed: false,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/** Translate an `HttpError` into the domain `TaskError`, preserving mock codes. */
function mapTaskError(
  err: unknown,
  kind: "transition" | "dependency" | "guard" = "guard"
): TaskError {
  if (err instanceof TaskError) return err;
  if (err instanceof HttpError) {
    if (err.status === 404) return new TaskError("not_found");
    if (err.status === 403) return new TaskError("forbidden");
    if (err.status === 0) return new TaskError("network");
    if (err.status === 409 || err.status === 422 || err.status === 400) {
      if (kind === "dependency")
        return new TaskError("dependency_cycle", "dependencyCycle");
      if (kind === "transition")
        return new TaskError("invalid_transition", "invalid");
      return new TaskError("guard_failed", err.code);
    }
  }
  return new TaskError("network");
}

export const tasksApi: TasksApi = {
  // WIRED: GET /tasks — server scopes rows from the JWT (role/userId ignored).
  async listTasks(role, userId) {
    void role;
    void userId;
    try {
      const page = await http.get<{ items: TaskDto[] }>("/tasks", {
        query: { page_size: 100, include_archived: false },
      });
      return page.items.map(fromBackend);
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: GET /tasks/{id} — server enforces Membro scoping (role/userId ignored).
  // Also resolves the real checklist (audit C12) so the detail view is never
  // stale/mock for it.
  async getTask(id, role, userId) {
    void role;
    void userId;
    try {
      const [dto, checklist] = await Promise.all([
        http.get<TaskDto>(`/tasks/${id}`),
        fetchChecklist(id),
      ]);
      return { ...fromBackend(dto), checklist };
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: POST /tasks. Backend takes a single primary assignee (assigneeIds[0]).
  async createTask(input, actorId) {
    void actorId;
    if (!input.title.trim()) throw new TaskError("guard_failed", "titleRequired");
    try {
      const dto = await http.post<TaskDto>("/tasks", {
        projectId: input.projectId,
        phaseId: input.phaseId,
        title: input.title.trim(),
        description: input.description.trim() || null,
        // INTEGRATION-GAP: backend supports one primary assignee, not a list
        primaryAssigneeId: input.assigneeIds[0] ?? null,
        priority: input.priority,
        dueDate: input.dueDate,
      });
      return fromBackend(dto);
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: PATCH /tasks/{id} (metadata only; status goes through transition/block).
  async updateTask(id, input, actorId) {
    void actorId;
    if (input.title !== undefined && !input.title.trim())
      throw new TaskError("guard_failed", "titleRequired");
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title.trim();
    if (input.description !== undefined) body.description = input.description;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.dueDate !== undefined) body.dueDate = input.dueDate;
    if (input.phaseId !== undefined) body.phaseId = input.phaseId;
    // INTEGRATION-GAP: backend supports one primary assignee, not a list
    if (input.assigneeIds !== undefined)
      body.primaryAssigneeId = input.assigneeIds[0] ?? null;
    try {
      return fromBackend(await http.patch<TaskDto>(`/tasks/${id}`, body));
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: POST /tasks/{id}/transition — state machine enforced server-side.
  async transition(id, to, role, actorId) {
    void role;
    void actorId;
    try {
      const dto = await http.post<TaskDto>(`/tasks/${id}/transition`, {
        status: to,
      });
      return fromBackend(dto);
    } catch (err) {
      throw mapTaskError(err, "transition");
    }
  },

  // LEFT-ON-MOCK: no backend endpoint to force a state without guards (undo).
  async restoreState(id, state, actorId) {
    // INTEGRATION-GAP: no backend endpoint — left on mock
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    const before = rec.state;
    rec.state = state;
    touch(rec);
    pushActivity(id, actorId, "status_changed", { field: "state", before, after: state });
    return present(rec);
  },

  // WIRED: POST /tasks/{id}/block. Backend captures only the reason.
  async block(id, input, actorId) {
    void actorId;
    if (!input.reason.trim()) throw new TaskError("reason_required");
    if (input.blockerTaskId && input.blockerTaskId === id)
      throw new TaskError("guard_failed", "blockerSelf");
    try {
      // INTEGRATION-GAP: blockerTaskId association — not accepted by backend
      const dto = await http.post<TaskDto>(`/tasks/${id}/block`, {
        reason: input.reason.trim(),
      });
      return fromBackend(dto);
    } catch (err) {
      throw mapTaskError(err, "transition");
    }
  },

  // WIRED: POST /tasks/{id}/unblock (defaults to `todo` server-side).
  async unblock(id, actorId) {
    void actorId;
    try {
      return fromBackend(await http.post<TaskDto>(`/tasks/${id}/unblock`));
    } catch (err) {
      throw mapTaskError(err, "transition");
    }
  },

  // WIRED: POST /tasks/{id}/dependencies (cycle rejection server-side), then re-read.
  async addDependency(id, dependsOnId, actorId) {
    void actorId;
    if (dependsOnId === id)
      throw new TaskError("dependency_cycle", "dependencyCycle");
    try {
      await http.post(`/tasks/${id}/dependencies`, {
        dependsOnTaskId: dependsOnId,
      });
      return fromBackend(await http.get<TaskDto>(`/tasks/${id}`));
    } catch (err) {
      throw mapTaskError(err, "dependency");
    }
  },

  // WIRED: DELETE /tasks/{id}/dependencies/{dependsOnId}, then re-read the task.
  async removeDependency(id, dependsOnId, actorId) {
    void actorId;
    try {
      await http.delete(`/tasks/${id}/dependencies/${dependsOnId}`);
      return fromBackend(await http.get<TaskDto>(`/tasks/${id}`));
    } catch (err) {
      throw mapTaskError(err, "dependency");
    }
  },

  // WIRED: POST /tasks/{id}/checklist (audit C12).
  async addChecklistItem(id, text, actorId) {
    void actorId;
    if (!text.trim()) throw new TaskError("guard_failed", "checklistTextRequired");
    try {
      await http.post(`/tasks/${id}/checklist`, { text: text.trim() });
      return tasksApi.getTask(id, "admin", actorId);
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: PATCH /tasks/{id}/checklist/{itemId} (audit C12).
  async toggleChecklistItem(id, itemId, actorId) {
    try {
      const current = await fetchChecklist(id);
      const item = current.find((c) => c.id === itemId);
      if (!item) throw new TaskError("not_found");
      await http.patch(`/tasks/${id}/checklist/${itemId}`, { done: !item.done });
      return tasksApi.getTask(id, "admin", actorId);
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: DELETE /tasks/{id}/checklist/{itemId} (audit C12).
  async removeChecklistItem(id, itemId, actorId) {
    try {
      await http.delete(`/tasks/${id}/checklist/${itemId}`);
      return tasksApi.getTask(id, "admin", actorId);
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // LEFT-ON-MOCK: board ordering is not persisted by the backend.
  async reorder(id, toState, toIndex, actorId) {
    // INTEGRATION-GAP: no backend endpoint — left on mock
    seed();
    await delay(MOCK_LATENCY_MS / 3);
    const rec = require_(id);
    rec.state = toState;
    // Re-sequence order within the target column so the card lands at toIndex.
    const column = [...store.values()]
      .filter((r) => r.state === toState && r.id !== id)
      .sort((a, b) => a.order - b.order);
    column.splice(Math.max(0, Math.min(toIndex, column.length)), 0, rec);
    column.forEach((r, i) => {
      r.order = i;
    });
    touch(rec);
    pushActivity(id, actorId, "updated", { field: "order" });
    return present(rec);
  },

  // WIRED: POST /tasks/{id}/duplicate (audit C13). Assignee/dependencies/
  // checklist/comments deliberately NOT copied — see the backend docstring.
  async duplicate(id, actorId) {
    void actorId;
    try {
      return fromBackend(await http.post<TaskDto>(`/tasks/${id}/duplicate`));
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: POST /tasks/{id}/archive (audit C13). Also stops any running timer
  // on the task server-side (BR-042).
  async archive(id, actorId) {
    void actorId;
    try {
      return fromBackend(await http.post<TaskDto>(`/tasks/${id}/archive`));
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: POST /tasks/{id}/restore (audit C13).
  async restore(id, actorId) {
    void actorId;
    try {
      return fromBackend(await http.post<TaskDto>(`/tasks/${id}/restore`));
    } catch (err) {
      throw mapTaskError(err);
    }
  },

  // WIRED: same soft-delete as archive (audit C13) — "remove" from the board is
  // a BR-060 archive, never a hard delete.
  async remove(id, actorId) {
    void actorId;
    try {
      return fromBackend(await http.post<TaskDto>(`/tasks/${id}/archive`));
    } catch (err) {
      throw mapTaskError(err);
    }
  },
};

/* ------------------------------------------------------------------ *
 * Collaboration adapter for the task Activity feed (#40). Merges the live task
 * activity (transitions, edits) with the shared collaboration store, exactly
 * like `projectCollaborationApi`.
 * ------------------------------------------------------------------ */

export const taskCollaborationApi: CollaborationApi = {
  listDirectory: () => collaborationApi.listDirectory(),
  listComments: (t, id) => collaborationApi.listComments(t, id),
  createComment: (input: CreateCommentInput) => collaborationApi.createComment(input),
  updateComment: (input: UpdateCommentInput) => collaborationApi.updateComment(input),
  deleteComment: (id, requesterId) => collaborationApi.deleteComment(id, requesterId),
  restoreComment: (comment: Comment) => collaborationApi.restoreComment(comment),
  // Global feed — no per-entity wrapping to do.
  listRecentActivity: (limit?: number) => collaborationApi.listRecentActivity(limit),
  async listActivity(entityType, entityId) {
    const live = await collaborationApi.listActivity(entityType, entityId);
    if (entityType !== "task") return live;
    seed();
    const seededList = activityByTask.get(entityId) ?? [];
    return [...seededList, ...live].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  },
};
