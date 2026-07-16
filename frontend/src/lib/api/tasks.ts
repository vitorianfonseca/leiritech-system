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
  checkTaskTransition,
  priorityRank,
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
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@aurea.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@aurea.pt", avatarUrl: null },
  "dev-membro": { id: "dev-membro", name: "Carla Nunes", email: "carla@aurea.pt", avatarUrl: null },
  "u-sofia": { id: "u-sofia", name: "Sofia Marques", email: "sofia@aurea.pt", avatarUrl: null },
  "u-diogo": { id: "u-diogo", name: "Diogo Ferreira", email: "diogo@aurea.pt", avatarUrl: null },
  "u-tiago": { id: "u-tiago", name: "Tiago Lopes", email: "tiago@aurea.pt", avatarUrl: null },
  "u-ines": { id: "u-ines", name: "Inês Duarte", email: "ines@aurea.pt", avatarUrl: null },
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

/** Membro is row-scoped to member projects (BR-002 / H7). */
function visibleTo(rec: StoredTask, role: Role, userId: string): boolean {
  if (role === "admin" || role === "gestor") return true;
  const project = PROJECTS[rec.projectId];
  if (!project) return false;
  return project.memberIds.includes(userId) || rec.assigneeIds.includes(userId);
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

/** True when `from` can reach `to` following dependency edges. */
function dependsOnTransitively(fromId: string, toId: string): boolean {
  const visited = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rec = store.get(current);
    if (rec) stack.push(...rec.dependencyIds);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Public interface
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

export const tasksApi: TasksApi = {
  async listTasks(role, userId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    return [...store.values()]
      .filter((rec) => !rec.archived && visibleTo(rec, role, userId))
      .sort((a, b) => {
        const p = priorityRank(b.priority) - priorityRank(a.priority);
        if (p !== 0) return p;
        return a.order - b.order;
      })
      .map(present);
  },

  async getTask(id, role, userId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    if (!visibleTo(rec, role, userId)) throw new TaskError("not_found");
    return present(rec);
  },

  async createTask(input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    if (!input.title.trim()) throw new TaskError("guard_failed", "titleRequired");
    if (!PROJECTS[input.projectId]) throw new TaskError("guard_failed", "projectRequired");
    const id = uid("tk");
    const now = new Date().toISOString();
    store.set(id, {
      id,
      title: input.title.trim(),
      description: input.description.trim(),
      projectId: input.projectId,
      phaseId: input.phaseId,
      state: "todo",
      priority: input.priority,
      assigneeIds: input.assigneeIds,
      dueDate: input.dueDate,
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
    });
    pushActivity(id, actorId, "created");
    return present(require_(id));
  },

  async updateTask(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new TaskError("guard_failed", "titleRequired");
      rec.title = input.title.trim();
    }
    if (input.description !== undefined) rec.description = input.description;
    if (input.priority !== undefined) rec.priority = input.priority;
    if (input.dueDate !== undefined) rec.dueDate = input.dueDate;
    if (input.phaseId !== undefined) rec.phaseId = input.phaseId;
    if (input.assigneeIds !== undefined) rec.assigneeIds = input.assigneeIds;
    touch(rec);
    pushActivity(id, actorId, "updated");
    return present(rec);
  },

  async transition(id, to, role, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = require_(id);
    const check = checkTaskTransition(present(rec), to, role);
    if (!check.ok) throw new TaskError("invalid_transition", check.messageKey ?? "invalid");
    const before = rec.state;
    rec.state = to;
    if (to !== "blocked") {
      rec.blockedReason = null;
      rec.blockerTaskId = null;
    }
    touch(rec);
    pushActivity(id, actorId, "status_changed", { field: "state", before, after: to });
    return present(rec);
  },

  async restoreState(id, state, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    const before = rec.state;
    rec.state = state;
    touch(rec);
    pushActivity(id, actorId, "status_changed", { field: "state", before, after: state });
    return present(rec);
  },

  async block(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = require_(id);
    if (!input.reason.trim()) throw new TaskError("reason_required");
    if (rec.state === "done") throw new TaskError("invalid_transition", "cannotBlockDone");
    if (input.blockerTaskId && input.blockerTaskId === id)
      throw new TaskError("guard_failed", "blockerSelf");
    rec.state = "blocked";
    rec.blockedReason = input.reason.trim();
    rec.blockerTaskId = input.blockerTaskId ?? null;
    touch(rec);
    pushActivity(id, actorId, "status_changed", { field: "state", after: "blocked" });
    return present(rec);
  },

  async unblock(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = require_(id);
    if (rec.state !== "blocked") throw new TaskError("invalid_transition", "notBlocked");
    rec.state = "todo";
    rec.blockedReason = null;
    rec.blockerTaskId = null;
    touch(rec);
    pushActivity(id, actorId, "status_changed", { field: "state", after: "todo" });
    return present(rec);
  },

  async addDependency(id, dependsOnId, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    require_(dependsOnId);
    if (dependsOnId === id) throw new TaskError("dependency_cycle", "dependencyCycle");
    if (rec.dependencyIds.includes(dependsOnId)) return present(rec);
    // Adding rec → dependsOnId; a cycle exists if dependsOnId already depends on rec.
    if (dependsOnTransitively(dependsOnId, id))
      throw new TaskError("dependency_cycle", "dependencyCycle");
    rec.dependencyIds.push(dependsOnId);
    touch(rec);
    pushActivity(id, actorId, "updated", { field: "dependency" });
    return present(rec);
  },

  async removeDependency(id, dependsOnId, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    rec.dependencyIds = rec.dependencyIds.filter((d) => d !== dependsOnId);
    touch(rec);
    pushActivity(id, actorId, "updated", { field: "dependency" });
    return present(rec);
  },

  async addChecklistItem(id, text, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    if (!text.trim()) throw new TaskError("guard_failed", "checklistTextRequired");
    rec.checklist.push({ id: uid("c"), text: text.trim(), done: false });
    touch(rec);
    pushActivity(id, actorId, "updated", { field: "checklist" });
    return present(rec);
  },

  async toggleChecklistItem(id, itemId, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 3);
    const rec = require_(id);
    const item = rec.checklist.find((c) => c.id === itemId);
    if (!item) throw new TaskError("not_found");
    item.done = !item.done;
    touch(rec);
    pushActivity(id, actorId, "updated", { field: "checklist" });
    return present(rec);
  },

  async removeChecklistItem(id, itemId, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 3);
    const rec = require_(id);
    rec.checklist = rec.checklist.filter((c) => c.id !== itemId);
    touch(rec);
    pushActivity(id, actorId, "updated", { field: "checklist" });
    return present(rec);
  },

  async reorder(id, toState, toIndex, actorId) {
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

  async duplicate(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const src = require_(id);
    const newId = uid("tk");
    const now = new Date().toISOString();
    store.set(newId, {
      ...src,
      id: newId,
      title: `${src.title} (cópia)`,
      state: "todo",
      blockedReason: null,
      blockerTaskId: null,
      dependencyIds: [...src.dependencyIds],
      labels: src.labels.map((l) => ({ ...l })),
      checklist: src.checklist.map((c) => ({ ...c, id: uid("c"), done: false })),
      commentCount: 0,
      archived: false,
      order: (orderCounter += 1),
      createdAt: now,
      updatedAt: now,
    });
    pushActivity(newId, actorId, "created");
    return present(require_(newId));
  },

  async archive(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    rec.archived = true;
    touch(rec);
    pushActivity(id, actorId, "archived");
    return present(rec);
  },

  async restore(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    rec.archived = false;
    touch(rec);
    pushActivity(id, actorId, "restored");
    return present(rec);
  },

  async remove(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    const rec = require_(id);
    // Soft-remove: mark archived so undo can re-list it; drop dangling deps.
    rec.archived = true;
    for (const other of store.values()) {
      other.dependencyIds = other.dependencyIds.filter((d) => d !== id);
    }
    touch(rec);
    pushActivity(id, actorId, "archived");
    return present(rec);
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
