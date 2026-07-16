/**
 * Shared API models for the notifications center (F15).
 *
 * The backend (FastAPI notifications service + Railway Cron for the 12 fixed
 * automations) does not exist yet. These types describe the contract the
 * integration agent will fulfil; feature code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * Notification bodies are SERVER-RENDERED, localized text (matching the
 * templates in WORKFLOW_SPEC §6.1/§6.2) — the backend owns the copy exactly as
 * the collaboration comment bodies are stored as data, not UI chrome. The UI
 * derives its own localized chrome (category label, filter names, actions,
 * relative time) from `type`/`category`.
 */

/**
 * Every notification maps to one of the 12 fixed automations (§6.1) or an
 * event-driven trigger (§6.2). Kept as a discriminated string so the UI can
 * pick an icon and the integration layer can map 1:1 to backend enum values.
 */
export type NotificationType =
  // §6.1 — the 12 fixed automations
  | "task_overdue" // AUTO-01
  | "payment_overdue" // AUTO-02
  | "stale_opportunity" // AUTO-03
  | "proposal_expired" // AUTO-04
  | "health_downgrade" // AUTO-05
  | "milestone_due_soon" // AUTO-06
  | "phase_completion_suggested" // AUTO-07
  | "payment_due_soon" // AUTO-08
  | "workload_overallocated" // AUTO-09
  | "meeting_reminder" // AUTO-10
  | "won_not_converted" // AUTO-11
  | "forgotten_timer" // AUTO-12
  // §6.2 — event-driven notifications
  | "task_assigned"
  | "mention"
  | "comment"
  | "task_returned"
  | "task_approved"
  | "proposal_viewed"
  | "proposal_decided"
  | "invitation_accepted"
  | "project_member_added"
  | "blocker_resolved"
  | "payment_received";

/**
 * Coarse grouping used for the icon, the "by type" filter and — critically —
 * the financial classification that BR-008 gates from Membro.
 */
export type NotificationCategory =
  | "task"
  | "payment" // financial — hidden from Membro (BR-008)
  | "opportunity"
  | "proposal"
  | "project"
  | "meeting"
  | "workload"
  | "mention"
  | "comment"
  | "system";

/** The kind of record a notification links back to (drives the source href). */
export type NotificationEntityType =
  | "task"
  | "payment"
  | "opportunity"
  | "proposal"
  | "project"
  | "meeting"
  | "member"
  | "invite";

/** Machine-readable error codes returned by the notifications client. */
export type NotificationErrorCode = "not_found" | "forbidden" | "network";

/**
 * Typed error thrown by the notifications client. The `code` maps to an i18n
 * key so the UI can render a localized, user-safe message.
 */
export class NotificationError extends Error {
  readonly code: NotificationErrorCode;
  constructor(code: NotificationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "NotificationError";
    this.code = code;
  }
}

export interface Notification {
  id: string;
  /** Recipient user id — notifications are per-user. */
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  /** True for payment/financial notifications (BR-008 gate for Membro). */
  financial: boolean;
  entityType: NotificationEntityType;
  entityId: string;
  /** In-app route to the source record. Language-agnostic (locale never in URL). */
  href: string;
  /** Server-rendered, localized body text (§6.1/§6.2 templates). */
  body: string;
  /**
   * Groups same-entity events so the UI can collapse them into one line
   * (e.g. `task:t-14`, `project:p-3`, `thread:c-9`). BR: grouping collapses
   * same-entity events into a single digest line.
   */
  groupKey: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601 when read; null while unread. */
  readAt: string | null;
  /** ISO-8601 when archived; null while active. */
  archivedAt: string | null;
}

/** Filter for the "read state" segmented control. */
export type NotificationReadFilter = "unread" | "all";

/** Lightweight summary powering the shell bell (recent + unread count). */
export interface NotificationSummary {
  unreadCount: number;
  recent: Notification[];
}
