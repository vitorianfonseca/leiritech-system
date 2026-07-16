/**
 * Shared API models for the "O meu trabalho" daily hub (F3).
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers. All lists are scoped to the signed-in user (BR-002 — own scope).
 */

/** Task lifecycle (WORKFLOW_SPEC §1). Membro may advance up to `in_review`;
 * approving `in_review → done` is Gestor+/Admin only (BR C3). */
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

/** Priority ranking used for the inline priority control. */
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** Project RAG health (consumes DESIGN.md health-* zones). */
export type ProjectHealth = "healthy" | "attention" | "at_risk";

export interface MyTask {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** ISO-8601 date (yyyy-mm-dd) or null for undated (backlog) tasks. */
  dueDate: string | null;
  /** BR-046 — a blocked task must remain visible and read as blocked. */
  blocked: boolean;
  blockedReason: string | null;
  /** Number of comments on the task (drives the inline comment affordance). */
  commentCount: number;
}

export interface MyMeeting {
  id: string;
  title: string;
  /** ISO-8601 datetime. */
  startsAt: string;
  endsAt: string;
  location: string | null;
  attendees: number;
}

export interface MyMention {
  id: string;
  /** The comment the current user was mentioned in. */
  commentId: string;
  entityType: "company" | "opportunity" | "project" | "task";
  entityId: string;
  entityLabel: string;
  authorName: string;
  excerpt: string;
  createdAt: string;
}

/** A task awaiting the current user's review/approval (Gestor+/Admin — C3). */
export interface MyReviewRequest {
  id: string;
  taskId: string;
  taskTitle: string;
  projectName: string;
  requestedByName: string;
  requestedAt: string;
}

export interface MyProject {
  id: string;
  name: string;
  clientName: string;
  health: ProjectHealth;
  /** 0–100 completion. */
  progress: number;
  openTasks: number;
}

export interface MyTimeEntry {
  id: string;
  taskId: string | null;
  taskTitle: string;
  projectName: string;
  /** ISO-8601 date. */
  date: string;
  durationMs: number;
}

/** The full daily hub payload. Groups are already scoped and sorted. */
export interface MyWork {
  today: MyTask[];
  overdue: MyTask[];
  thisWeek: MyTask[];
  noDate: MyTask[];
  meetings: MyMeeting[];
  mentions: MyMention[];
  /** Empty for Membro (they cannot approve — BR C3). */
  reviewRequests: MyReviewRequest[];
  projects: MyProject[];
  recentTimeEntries: MyTimeEntry[];
}

export type MyWorkErrorCode = "network" | "forbidden";

export class MyWorkError extends Error {
  readonly code: MyWorkErrorCode;
  constructor(code: MyWorkErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MyWorkError";
    this.code = code;
  }
}
