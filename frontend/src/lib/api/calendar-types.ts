/**
 * Shared API models for the aggregate Calendar (F12).
 *
 * The calendar is a READ-ONLY projection: it aggregates dated items produced by
 * other domains (tasks, meetings, milestones, deliveries, commercial
 * next-actions, expiring proposals, expected payments) into a single timeline.
 * It never creates or edits — clicking an event opens its source record.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers. Lists are scoped to the signed-in user (BR-002); financial payment
 * events are withheld from Membro entirely (BR-008).
 */

import type { Role } from "@/lib/session";

/** The aggregate event families surfaced on the calendar. */
export type CalendarEventType =
  | "task" // task deadline
  | "meeting"
  | "milestone" // project milestone
  | "delivery" // deliverable due
  | "next_action" // commercial follow-up
  | "proposal_expiry" // proposal validity expiring
  | "payment"; // expected payment milestone (financial — BR-008)

/**
 * Urgency of a dated item. Consumes the DESIGN.md status zones and is rendered
 * independently of the per-type colour (as an icon + label), so overdue / due /
 * done never collapse into one visual treatment.
 */
export type CalendarUrgency = "overdue" | "due" | "upcoming" | "done";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  /** ISO-8601 datetime (start). All-day events use local midnight. */
  start: string;
  /** ISO-8601 datetime (end) or null when the event has no duration. */
  end: string | null;
  /** All-day events are placed in the date header, not a time slot. */
  allDay: boolean;
  projectId: string | null;
  projectName: string | null;
  /** Route to the source record (read-only projection → open the record). */
  sourceHref: string;
  /** Optional urgency for dated deliverables (tasks / payments / proposals). */
  urgency: CalendarUrgency | null;
  location: string | null;
  description: string | null;
  /** EUR amount in cents for payment events (withheld from Membro — BR-008). */
  amountCents: number | null;
}

/** A half-open date range `[start, end)` in ISO date form (yyyy-MM-dd). */
export interface CalendarRange {
  /** Inclusive ISO date (yyyy-MM-dd). */
  start: string;
  /** Exclusive ISO date (yyyy-MM-dd). */
  end: string;
}

/** Query context — drives BR-002 scope and BR-008 financial gating. */
export interface CalendarQueryContext {
  userId: string;
  role: Role;
  /** When set, restrict to a single project (project-scoped embed — #32). */
  projectId?: string;
}

export type CalendarErrorCode = "network" | "forbidden";

export class CalendarError extends Error {
  readonly code: CalendarErrorCode;
  constructor(code: CalendarErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CalendarError";
    this.code = code;
  }
}
