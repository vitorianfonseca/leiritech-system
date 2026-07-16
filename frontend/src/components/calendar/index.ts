/**
 * Reusable aggregate-calendar components (F12 / issue #36).
 *
 * The projects Calendário tab (#32) and the tasks calendar view (#34) consume
 * these — import from `@/components/calendar`, never reach into the files. All
 * consume DESIGN.md tokens, are fully i18n'd (next-intl), read-only, and meet
 * WCAG AA. `CalendarView` accepts `projectId` for project-scoped embeds.
 */

export { CalendarView } from "./calendar-view";
export type { CalendarViewProps } from "./calendar-view";

export { EventChip } from "./event-chip";
export type { EventChipProps } from "./event-chip";

export { CalendarLegend } from "./calendar-legend";
export type { CalendarLegendProps } from "./calendar-legend";

export { ViewSwitcher, CALENDAR_VIEW_MODES } from "./view-switcher";
export type { ViewSwitcherProps, CalendarViewMode } from "./view-switcher";

export { MonthView } from "./month-view";
export type { MonthViewProps } from "./month-view";
export { WeekView } from "./week-view";
export type { WeekViewProps } from "./week-view";
export { AgendaView } from "./agenda-view";
export type { AgendaViewProps } from "./agenda-view";

export { EventDetailPanel } from "./event-detail-panel";
export type { EventDetailPanelProps } from "./event-detail-panel";

export {
  EVENT_TYPE_CONFIG,
  EVENT_TYPE_ORDER,
  URGENCY_CONFIG,
  visibleEventTypes,
} from "./event-config";
export type { EventTypeConfig, UrgencyConfig } from "./event-config";

export {
  monthGridDays,
  weekDays,
  rangeForView,
  eventsOnDay,
  groupByDay,
  iso,
} from "./calendar-utils";
export type { DayGroup } from "./calendar-utils";
