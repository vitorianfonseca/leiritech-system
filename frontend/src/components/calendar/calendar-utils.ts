/**
 * Date helpers for the calendar views (F12). All week math is Monday-first
 * (pt-PT convention). Ranges are half-open `[start, end)` ISO dates matching the
 * `CalendarRange` API contract. Uses date-fns only — no heavy calendar library.
 */

import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent, CalendarRange } from "@/lib/api/calendar-types";
import type { CalendarViewMode } from "./view-switcher";

const WEEK_OPTS = { weekStartsOn: 1 } as const; // Monday

export function iso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** The 6-week (42-day) grid covering the anchor's month, Monday-first. */
export function monthGridDays(anchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), WEEK_OPTS);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** The 7 days of the anchor's week, Monday-first. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, WEEK_OPTS);
  return eachDayOfInterval({ start, end: endOfWeek(anchor, WEEK_OPTS) });
}

/**
 * The API range to fetch for a given view + anchor. Month fetches its whole
 * 6-week grid; week fetches its 7 days; agenda fetches a rolling window from the
 * anchor forward so the list is never empty at the tail.
 */
export function rangeForView(view: CalendarViewMode, anchor: Date): CalendarRange {
  if (view === "month") {
    const days = monthGridDays(anchor);
    return { start: iso(days[0]), end: iso(addDays(days[days.length - 1], 1)) };
  }
  if (view === "week") {
    const days = weekDays(anchor);
    return { start: iso(days[0]), end: iso(addDays(days[days.length - 1], 1)) };
  }
  // agenda: anchor day → +45 days
  return { start: iso(anchor), end: iso(addDays(anchor, 45)) };
}

/** Events whose start date falls on `day`. */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const key = iso(day);
  return events.filter((e) => format(new Date(e.start), "yyyy-MM-dd") === key);
}

export interface DayGroup {
  /** yyyy-MM-dd */
  key: string;
  date: Date;
  events: CalendarEvent[];
}

/** Group events by calendar day, ascending. Days with no events are omitted. */
export function groupByDay(events: CalendarEvent[]): DayGroup[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = format(new Date(e.start), "yyyy-MM-dd");
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evts]) => ({
      key,
      date: new Date(`${key}T00:00:00`),
      events: evts.sort((a, b) => a.start.localeCompare(b.start)),
    }));
}
