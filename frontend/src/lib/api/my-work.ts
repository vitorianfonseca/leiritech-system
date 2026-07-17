/**
 * My Work API client — MOCK implementation (F3).
 *
 * Backend is not wired yet. This module exports a typed `myWorkApi` whose
 * methods return promises exactly as the real HTTP client will. The integration
 * agent replaces the bodies with real `fetch` calls to FastAPI WITHOUT changing
 * the signatures. UI code (via TanStack Query) depends only on the `MyWorkApi`
 * interface below.
 *
 * Task state lives in a module-level array so inline edits (complete / status /
 * priority / deadline) persist for the session — enough to exercise undo and
 * re-bucketing. Dates are seeded RELATIVE to "today" so the today / overdue /
 * this-week buckets are meaningful whenever the app runs.
 */

import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import type { Role } from "@/lib/session";
import {
  type MyMeeting,
  type MyMention,
  type MyProject,
  type MyReviewRequest,
  type MyTask,
  type MyTimeEntry,
  type MyWork,
  type TaskPriority,
  type TaskStatus,
} from "./my-work-types";

const MOCK_LATENCY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
}

function isoDateTime(offsetDays: number, hour: number, minute = 0): string {
  const d = addDays(startOfDay(new Date()), offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/* ------------------------------------------------------------------ *
 * Seed data (relative to today)
 * ------------------------------------------------------------------ */

let tasks: MyTask[] = [];
let reviews: MyReviewRequest[] = [];
let seeded = false;

function seed(): void {
  if (seeded) return;
  seeded = true;
  reviews = [...REVIEW_REQUESTS];
  tasks = [
    {
      id: "t-1",
      title: "Rever wireframes da homepage",
      projectId: "p-1",
      projectName: "Website — Solar do Douro",
      status: "in_progress",
      priority: "high",
      dueDate: isoDate(0),
      blocked: false,
      blockedReason: null,
      commentCount: 3,
    },
    {
      id: "t-2",
      title: "Preparar guião de conteúdos",
      projectId: "p-1",
      projectName: "Website — Solar do Douro",
      status: "todo",
      priority: "medium",
      dueDate: isoDate(0),
      blocked: false,
      blockedReason: null,
      commentCount: 0,
    },
    {
      id: "t-3",
      title: "Exportar assets do logótipo",
      projectId: "p-2",
      projectName: "Rebranding — Adega Vale",
      status: "todo",
      priority: "urgent",
      dueDate: isoDate(-2),
      blocked: false,
      blockedReason: null,
      commentCount: 1,
    },
    {
      id: "t-4",
      title: "Integrar gateway de pagamento",
      projectId: "p-3",
      projectName: "App Fidelização — Lumina",
      status: "in_progress",
      priority: "high",
      dueDate: isoDate(-1),
      blocked: true,
      blockedReason: "A aguardar credenciais do cliente",
      commentCount: 5,
    },
    {
      id: "t-5",
      title: "Configurar ambiente de testes",
      projectId: "p-3",
      projectName: "App Fidelização — Lumina",
      status: "todo",
      priority: "low",
      dueDate: isoDate(2),
      blocked: false,
      blockedReason: null,
      commentCount: 0,
    },
    {
      id: "t-6",
      title: "Rever copy da newsletter",
      projectId: "p-2",
      projectName: "Rebranding — Adega Vale",
      status: "todo",
      priority: "medium",
      dueDate: isoDate(4),
      blocked: false,
      blockedReason: null,
      commentCount: 2,
    },
    {
      id: "t-7",
      title: "Documentar API interna",
      projectId: "p-3",
      projectName: "App Fidelização — Lumina",
      status: "todo",
      priority: "low",
      dueDate: null,
      blocked: false,
      blockedReason: null,
      commentCount: 0,
    },
    {
      id: "t-8",
      title: "Otimizar imagens do portfólio",
      projectId: "p-1",
      projectName: "Website — Solar do Douro",
      status: "todo",
      priority: "medium",
      dueDate: null,
      blocked: false,
      blockedReason: null,
      commentCount: 0,
    },
  ];
}

const MEETINGS: MyMeeting[] = [
  {
    id: "m-1",
    title: "Reunião de arranque — Adega Vale",
    startsAt: isoDateTime(0, 11, 0),
    endsAt: isoDateTime(0, 11, 45),
    location: "Google Meet",
    attendees: 4,
  },
  {
    id: "m-2",
    title: "Revisão de sprint — Lumina",
    startsAt: isoDateTime(0, 16, 30),
    endsAt: isoDateTime(0, 17, 0),
    location: "Sala Aurea",
    attendees: 6,
  },
];

const MENTIONS: MyMention[] = [
  {
    id: "mn-1",
    commentId: "cmt-1",
    entityType: "project",
    entityId: "demo",
    entityLabel: "Website — Solar do Douro",
    authorName: "Rita Andrade",
    excerpt: "fica ao teu cuidado o arranque desta fase.",
    createdAt: isoDateTime(0, 9, 15),
  },
  {
    id: "mn-2",
    commentId: "cmt-2",
    entityType: "task",
    entityId: "t-4",
    entityLabel: "Integrar gateway de pagamento",
    authorName: "Bruno Salgado",
    excerpt: "confirmas se já temos as credenciais?",
    createdAt: isoDateTime(-1, 14, 40),
  },
];

const REVIEW_REQUESTS: MyReviewRequest[] = [
  {
    id: "rr-1",
    taskId: "t-r1",
    taskTitle: "Maquetes finais da app",
    projectName: "App Fidelização — Lumina",
    requestedByName: "Carla Nunes",
    requestedAt: isoDateTime(0, 8, 30),
  },
  {
    id: "rr-2",
    taskId: "t-r2",
    taskTitle: "Texto institucional revisto",
    projectName: "Rebranding — Adega Vale",
    requestedByName: "Diogo Ferreira",
    requestedAt: isoDateTime(-1, 17, 10),
  },
];

const PROJECTS: MyProject[] = [
  {
    id: "p-1",
    name: "Website — Solar do Douro",
    clientName: "Solar do Douro",
    health: "attention",
    progress: 40,
    openTasks: 5,
  },
  {
    id: "p-2",
    name: "Rebranding — Adega Vale",
    clientName: "Adega Vale",
    health: "healthy",
    progress: 72,
    openTasks: 3,
  },
  {
    id: "p-3",
    name: "App Fidelização — Lumina",
    clientName: "Lumina",
    health: "at_risk",
    progress: 25,
    openTasks: 7,
  },
];

function recentTimeEntries(): MyTimeEntry[] {
  return [
    {
      id: "te-1",
      taskId: "t-1",
      taskTitle: "Rever wireframes da homepage",
      projectName: "Website — Solar do Douro",
      date: isoDate(0),
      durationMs: 95 * 60_000,
    },
    {
      id: "te-2",
      taskId: "t-4",
      taskTitle: "Integrar gateway de pagamento",
      projectName: "App Fidelização — Lumina",
      date: isoDate(-1),
      durationMs: 130 * 60_000,
    },
    {
      id: "te-3",
      taskId: "t-3",
      taskTitle: "Exportar assets do logótipo",
      projectName: "Rebranding — Adega Vale",
      date: isoDate(-1),
      durationMs: 45 * 60_000,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Bucketing
 * ------------------------------------------------------------------ */

function bucketTasks(all: MyTask[]): Pick<
  MyWork,
  "today" | "overdue" | "thisWeek" | "noDate"
> {
  const today: MyTask[] = [];
  const overdue: MyTask[] = [];
  const thisWeek: MyTask[] = [];
  const noDate: MyTask[] = [];

  for (const task of all) {
    // Completed tasks drop out of the active buckets.
    if (task.status === "done") continue;
    if (task.dueDate === null) {
      noDate.push(task);
      continue;
    }
    const diff = differenceInCalendarDays(parseISO(task.dueDate), startOfDay(new Date()));
    if (diff < 0) overdue.push(task);
    else if (diff === 0) today.push(task);
    else if (diff <= 7) thisWeek.push(task);
    // Tasks further than a week out are not part of the daily hub.
  }

  const byPriority = (a: MyTask, b: MyTask) =>
    priorityRank(b.priority) - priorityRank(a.priority);
  today.sort(byPriority);
  overdue.sort(byPriority);
  thisWeek.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  return { today, overdue, thisWeek, noDate };
}

function priorityRank(p: TaskPriority): number {
  return { low: 0, medium: 1, high: 2, urgent: 3 }[p];
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface MyWorkApi {
  /** Full daily hub for the given user. `role` gates the review queue (C3). */
  getMyWork(userId: string, role: Role): Promise<MyWork>;
  setTaskStatus(taskId: string, status: TaskStatus): Promise<MyTask>;
  setTaskPriority(taskId: string, priority: TaskPriority): Promise<MyTask>;
  setTaskDeadline(taskId: string, dueDate: string | null): Promise<MyTask>;
  /** Approve a task in review (Gestor+/Admin — C3). Returns the cleared item. */
  approveReview(reviewId: string): Promise<MyReviewRequest>;
  /** Re-queue a previously approved review (powers undo). */
  restoreReview(review: MyReviewRequest): Promise<void>;
}

function mutate(taskId: string, patch: Partial<MyTask>): MyTask {
  seed();
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) {
    throw new Error(`Unknown task: ${taskId}`);
  }
  const updated = { ...tasks[idx], ...patch };
  tasks[idx] = updated;
  return updated;
}

export const myWorkApi: MyWorkApi = {
  // INTEGRATION-GAP: no backend endpoint — left on mock. The daily hub is an
  // aggregate: assigned tasks (bucketed today/overdue/week) plus meetings,
  // @mentions, a review queue, project cards, comment counts and recent time
  // entries. Meetings, mentions and comment counts come from the calendar and
  // collaboration surfaces, which have NO backend, so wiring only the task list
  // would produce a broken half-hub. Left on mock until those exist.
  async getMyWork(_userId, role) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const buckets = bucketTasks(tasks);
    return {
      ...buckets,
      meetings: [...MEETINGS].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      mentions: [...MENTIONS].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      // Only Gestor/Admin can approve — Membro never sees a review queue (C3).
      reviewRequests: role === "membro" ? [] : [...reviews],
      projects: [...PROJECTS],
      recentTimeEntries: recentTimeEntries().sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
    };
  },

  // INTEGRATION-GAP: left on mock. PATCH /tasks/{id} exists, but it returns a
  // bare task while MyTask needs enrichment (projectName, commentCount) and the
  // status/priority vocabularies differ; kept on mock with the hub aggregate.
  async setTaskStatus(taskId, status) {
    await delay(MOCK_LATENCY_MS);
    return mutate(taskId, { status });
  },

  async setTaskPriority(taskId, priority) {
    await delay(MOCK_LATENCY_MS);
    return mutate(taskId, { priority });
  },

  async setTaskDeadline(taskId, dueDate) {
    await delay(MOCK_LATENCY_MS);
    return mutate(taskId, { dueDate });
  },

  async approveReview(reviewId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const idx = reviews.findIndex((r) => r.id === reviewId);
    if (idx === -1) throw new Error(`Unknown review: ${reviewId}`);
    const [removed] = reviews.splice(idx, 1);
    return removed;
  },

  async restoreReview(review) {
    seed();
    await delay(MOCK_LATENCY_MS / 2);
    if (!reviews.some((r) => r.id === review.id)) {
      reviews.unshift(review);
    }
  },
};
