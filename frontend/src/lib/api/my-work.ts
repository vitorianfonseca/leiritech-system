/**
 * My Work API client — REAL implementation (F3 / integration issue #44).
 *
 * The backend `GET /my-work` endpoint returns the exact camelCase `MyWork` shape
 * (buckets + meetings + mentions + review queue + project cards + recent time
 * entries), already scoped to the authenticated caller (BR-002) with the review
 * queue gated to Gestor+/Admin (BR C3). Inline edits are written through the real
 * task endpoints (transition / PATCH); the view discards the return value and
 * re-fetches the hub, so each mutation re-reads `/my-work` to return the fresh,
 * fully-enriched task.
 */

import type { Role } from "@/lib/session";
import { http } from "./http";
import {
  type MyReviewRequest,
  type MyTask,
  type MyWork,
  type TaskPriority,
  type TaskStatus,
} from "./my-work-types";

/** Backend task priority vocabulary (`medium` on the hub is `normal` server-side). */
function toBackendPriority(p: TaskPriority): string {
  return p === "medium" ? "normal" : p;
}

async function fetchMyWork(): Promise<MyWork> {
  return http.get<MyWork>("/my-work");
}

/** Locate a task across all hub buckets after a write (return discarded by UI). */
function findTask(mw: MyWork, taskId: string): MyTask | undefined {
  return [...mw.today, ...mw.overdue, ...mw.thisWeek, ...mw.noDate].find(
    (t) => t.id === taskId
  );
}

/**
 * Re-read the hub and return the mutated task. When a transition drops the task
 * out of the active buckets (e.g. → done), fall back to a thin projection with
 * the applied patch so the (discarded) return still satisfies `MyTask`.
 */
async function reloadTask(taskId: string, patch: Partial<MyTask>): Promise<MyTask> {
  const mw = await fetchMyWork();
  const found = findTask(mw, taskId);
  if (found) return { ...found, ...patch };
  return {
    id: taskId,
    title: "",
    projectId: "",
    projectName: "",
    status: "done",
    priority: "medium",
    dueDate: null,
    blocked: false,
    blockedReason: null,
    commentCount: 0,
    ...patch,
  };
}

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

export const myWorkApi: MyWorkApi = {
  async getMyWork() {
    // The backend authoritatively scopes to the caller (BR-002) and gates the
    // review queue (C3) from the JWT — the args are kept for signature parity.
    return fetchMyWork();
  },

  async setTaskStatus(taskId, status) {
    await http.post(`/tasks/${taskId}/transition`, { status });
    return reloadTask(taskId, { status });
  },

  async setTaskPriority(taskId, priority) {
    await http.patch(`/tasks/${taskId}`, { priority: toBackendPriority(priority) });
    return reloadTask(taskId, { priority });
  },

  async setTaskDeadline(taskId, dueDate) {
    await http.patch(`/tasks/${taskId}`, { dueDate });
    return reloadTask(taskId, { dueDate });
  },

  async approveReview(reviewId) {
    // Approving = advancing the underlying task in_review → done. The review id
    // is not the task id, so resolve the task id from the current hub first.
    const mw = await fetchMyWork();
    const review = mw.reviewRequests.find((r) => r.id === reviewId);
    if (!review) throw new Error(`Unknown review: ${reviewId}`);
    await http.post(`/tasks/${review.taskId}/transition`, { status: "done" });
    return review;
  },

  async restoreReview(review) {
    // Undo an approval by sending the task back to in_review.
    await http.post(`/tasks/${review.taskId}/transition`, { status: "in_review" });
  },
};
