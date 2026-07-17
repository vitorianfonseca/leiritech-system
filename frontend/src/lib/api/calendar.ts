/**
 * Calendar API client — REAL implementation (F12 / integration issue #44).
 *
 * The backend `GET /calendar?from=&to=[&projectId=]` endpoint aggregates dated
 * items from every domain (task due-dates, project milestones, deliveries,
 * proposal expiries, commercial next-actions and payment milestones) into a
 * single read-only timeline and returns the exact camelCase `CalendarEvent[]`
 * contract. Role scoping (BR-002) and the financial gate (BR-008) are applied
 * server-side from the JWT, so `ctx.userId`/`ctx.role` are authoritative on the
 * server and kept here only for signature compatibility.
 */

import { http } from "./http";
import {
  type CalendarEvent,
  type CalendarQueryContext,
  type CalendarRange,
} from "./calendar-types";

export interface CalendarApi {
  /**
   * Aggregate events overlapping `range`, scoped for the authenticated caller.
   * Payment (financial) events are withheld from Membro (BR-008); Membro sees
   * only own-scope + shared events (BR-002) — enforced by the backend.
   */
  getCalendarEvents(
    range: CalendarRange,
    ctx: CalendarQueryContext
  ): Promise<CalendarEvent[]>;
}

export const calendarApi: CalendarApi = {
  async getCalendarEvents(range, ctx) {
    return http.get<CalendarEvent[]>("/calendar", {
      query: {
        from: range.start,
        to: range.end,
        projectId: ctx.projectId,
      },
    });
  },
};
