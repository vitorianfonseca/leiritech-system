/**
 * Notifications API client — MOCK implementation (F15).
 *
 * Backend is not wired yet. This module exports a typed `notificationsApi`
 * object whose methods return promises exactly as the real HTTP client will.
 * The integration agent replaces the bodies with real `fetch` calls to FastAPI
 * WITHOUT changing the signatures. UI code (via TanStack Query) depends only on
 * the `NotificationsApi` interface below.
 *
 * State lives in a module-level map so mark-read / archive persist for the
 * session. Notifications are seeded per dev user so switching the `leiritech_role`
 * cookie shows a role-appropriate feed.
 *
 * Role scoping (enforced here as defence-in-depth; the backend is authoritative):
 *  - BR-008: financial notifications (`financial: true`) are never returned to a
 *    Membro.
 *  - BR-002: a Membro only ever receives own-scope notifications, so the Membro
 *    seed contains no cross-project / pipeline / workload items.
 */

import {
  NotificationError,
  type Notification,
  type NotificationSummary,
  type NotificationType,
  type NotificationCategory,
  type NotificationEntityType,
} from "./notifications-types";
import type { Role } from "@/lib/session";
import { http, HttpError } from "./http";

/* ------------------------------------------------------------------ *
 * Type → category / financial / entity metadata
 * ------------------------------------------------------------------ */

interface TypeMeta {
  category: NotificationCategory;
  financial: boolean;
  entityType: NotificationEntityType;
}

const TYPE_META: Record<NotificationType, TypeMeta> = {
  task_overdue: { category: "task", financial: false, entityType: "task" },
  payment_overdue: { category: "payment", financial: true, entityType: "payment" },
  stale_opportunity: { category: "opportunity", financial: false, entityType: "opportunity" },
  proposal_expired: { category: "proposal", financial: false, entityType: "proposal" },
  health_downgrade: { category: "project", financial: false, entityType: "project" },
  milestone_due_soon: { category: "project", financial: false, entityType: "project" },
  phase_completion_suggested: { category: "project", financial: false, entityType: "project" },
  payment_due_soon: { category: "payment", financial: true, entityType: "payment" },
  workload_overallocated: { category: "workload", financial: false, entityType: "project" },
  meeting_reminder: { category: "meeting", financial: false, entityType: "meeting" },
  won_not_converted: { category: "opportunity", financial: false, entityType: "opportunity" },
  forgotten_timer: { category: "task", financial: false, entityType: "task" },
  task_assigned: { category: "task", financial: false, entityType: "task" },
  mention: { category: "mention", financial: false, entityType: "task" },
  comment: { category: "comment", financial: false, entityType: "task" },
  task_returned: { category: "task", financial: false, entityType: "task" },
  task_approved: { category: "task", financial: false, entityType: "task" },
  proposal_viewed: { category: "proposal", financial: false, entityType: "proposal" },
  proposal_decided: { category: "proposal", financial: false, entityType: "proposal" },
  invitation_accepted: { category: "system", financial: false, entityType: "invite" },
  project_member_added: { category: "project", financial: false, entityType: "project" },
  blocker_resolved: { category: "task", financial: false, entityType: "task" },
  payment_received: { category: "payment", financial: true, entityType: "payment" },
};

function hrefFor(entityType: NotificationEntityType, entityId: string): string {
  switch (entityType) {
    case "task":
      return `/tasks?task=${entityId}`;
    case "payment":
      return `/finance?milestone=${entityId}`;
    case "opportunity":
      return `/crm/opportunities/${entityId}`;
    case "proposal":
      return `/crm/proposals/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "meeting":
      return `/calendar?meeting=${entityId}`;
    case "member":
      return `/team`;
    case "invite":
      return `/settings/team`;
    default:
      return "/";
  }
}

/* ------------------------------------------------------------------ *
 * Backend mapping (real endpoints)
 * ------------------------------------------------------------------ */

/** Backend notification row (camelCased by the HTTP client). */
interface RawNotification {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  body: string | null;
  readAt: string | null;
  archivedAt: string | null;
  groupKey: string | null;
  createdAt: string;
}

/**
 * Map a backend row to the client `Notification`. The backend does not return
 * `category`/`financial`/`href`; those are DERIVED from `type` via TYPE_META +
 * hrefFor (deterministic, not fabricated).
 */
function toNotification(raw: RawNotification, userId: string): Notification {
  const type = raw.type as NotificationType;
  const meta =
    TYPE_META[type] ?? { category: "system" as NotificationCategory, financial: false, entityType: "task" as NotificationEntityType };
  const entityType = (raw.entityType as NotificationEntityType | null) ?? meta.entityType;
  const entityId = raw.entityId ?? "";
  return {
    id: raw.id,
    userId,
    type,
    category: meta.category,
    financial: meta.financial,
    entityType,
    entityId,
    href: entityId ? hrefFor(entityType, entityId) : "/",
    body: raw.body ?? "",
    groupKey: raw.groupKey ?? "",
    createdAt: raw.createdAt,
    readAt: raw.readAt,
    archivedAt: raw.archivedAt,
  };
}


/* ------------------------------------------------------------------ *
 * Role scoping + helpers
 * ------------------------------------------------------------------ */

/** Newest first — the feed leads with the most recent event. */
function byNewest(a: Notification, b: Notification): number {
  return b.createdAt.localeCompare(a.createdAt);
}


/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface NotificationsApi {
  /** All active notifications for the user (role-scoped), newest first. */
  list(userId: string, role: Role): Promise<Notification[]>;
  /** Lightweight bell summary: unread count + a few recent items. */
  summary(userId: string, role: Role, limit?: number): Promise<NotificationSummary>;
  markRead(id: string): Promise<Notification>;
  /** Mark every active, visible notification for the user read. Returns the
   *  ids that were changed so the caller can offer undo. */
  markAllRead(userId: string, role: Role): Promise<string[]>;
  /** Undo helper for mark-all: restore the given notifications to unread. */
  markUnread(ids: string[]): Promise<void>;
  archive(id: string): Promise<Notification>;
  /** Undo helper for archive. */
  unarchive(id: string): Promise<Notification>;
}

export const notificationsApi: NotificationsApi = {
  // WIRED — GET /notifications. `role` kept for signature/defence-in-depth; the
  // backend already own-scopes. Financial rows re-filtered for Membro (BR-008).
  async list(userId, role) {
    const page = await http.get<{ items: RawNotification[] }>("/notifications", {
      query: { page_size: 100 },
    });
    const rows = page.items.map((r) => toNotification(r, userId));
    const visible = role === "membro" ? rows.filter((n) => !n.financial) : rows;
    return visible.sort(byNewest);
  },

  // WIRED — GET /notifications/unread-count + GET /notifications (recent slice).
  async summary(userId, role, limit = 5) {
    const [count, page] = await Promise.all([
      http.get<{ unread: number }>("/notifications/unread-count"),
      http.get<{ items: RawNotification[] }>("/notifications", {
        query: { page_size: limit },
      }),
    ]);
    const rows = page.items.map((r) => toNotification(r, userId));
    const recent = role === "membro" ? rows.filter((n) => !n.financial) : rows;
    return { unreadCount: count.unread, recent: recent.sort(byNewest) };
  },

  // WIRED — POST /notifications/{id}/read.
  async markRead(id) {
    try {
      // INTEGRATION-GAP: userId — single-item response omits the recipient id;
      // safe to default because notifications are own-scoped.
      const raw = await http.post<RawNotification>(`/notifications/${id}/read`);
      return toNotification(raw, "");
    } catch (err) {
      if (err instanceof HttpError) {
        throw new NotificationError(err.status === 404 ? "not_found" : "network");
      }
      throw err;
    }
  },

  // WIRED — POST /notifications/read-all. The bulk endpoint returns only a
  // count, so the unread ids (for the undo affordance) are gathered first.
  async markAllRead(userId, role) {
    const page = await http.get<{ items: RawNotification[] }>("/notifications", {
      query: { unread_only: true, page_size: 100 },
    });
    let rows = page.items.map((r) => toNotification(r, userId));
    if (role === "membro") rows = rows.filter((n) => !n.financial);
    await http.post("/notifications/read-all");
    return rows.map((n) => n.id);
  },

  // INTEGRATION-GAP: no backend endpoint — there is no per-notification or bulk
  // "mark unread" route (only read / read-all). The mark-all-read undo therefore
  // cannot round-trip; it resolves as a no-op so the UI stays consistent.
  async markUnread(ids) {
    void ids;
  },

  // WIRED — POST /notifications/{id}/archive.
  async archive(id) {
    try {
      const raw = await http.post<RawNotification>(`/notifications/${id}/archive`);
      return toNotification(raw, "");
    } catch (err) {
      if (err instanceof HttpError) {
        throw new NotificationError(err.status === 404 ? "not_found" : "network");
      }
      throw err;
    }
  },

  // WIRED — POST /notifications/{id}/unarchive (undo helper for archive).
  async unarchive(id) {
    try {
      const raw = await http.post<RawNotification>(`/notifications/${id}/unarchive`);
      return toNotification(raw, "");
    } catch (err) {
      if (err instanceof HttpError) {
        throw new NotificationError(err.status === 404 ? "not_found" : "network");
      }
      throw err;
    }
  },
};
