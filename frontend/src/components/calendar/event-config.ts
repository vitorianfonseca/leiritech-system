/**
 * Per-type visual configuration for calendar events (F12).
 *
 * Colours are DESIGN.md tokens (never invented): each event family maps to a
 * distinct hue drawn from the semantic + chart token set. Colour is ALWAYS
 * paired with an icon and a label (WCAG AA, F10/§10) — the legend and every
 * chip render both, so the palette is never load-bearing on its own.
 *
 * These tokens flip automatically between light/dark because they reference the
 * raw CSS variables that `globals.css` redefines under `.dark`.
 */

import type { LucideIcon } from "lucide-react";
import {
  ListChecks,
  Users,
  Flag,
  PackageCheck,
  PhoneCall,
  FileClock,
  Coins,
} from "lucide-react";
import type { CalendarEventType, CalendarUrgency } from "@/lib/api/calendar-types";

export interface EventTypeConfig {
  icon: LucideIcon;
  /** CSS variable expression for the accent colour (a DESIGN token). */
  accentVar: string;
  /** i18n key under `calendar.types`. */
  labelKey: string;
  /** Financial family — withheld from Membro (BR-008). */
  financial: boolean;
}

export const EVENT_TYPE_CONFIG: Record<CalendarEventType, EventTypeConfig> = {
  task: { icon: ListChecks, accentVar: "var(--info)", labelKey: "task", financial: false },
  meeting: { icon: Users, accentVar: "var(--chart-4)", labelKey: "meeting", financial: false },
  milestone: { icon: Flag, accentVar: "var(--signal)", labelKey: "milestone", financial: false },
  delivery: {
    icon: PackageCheck,
    accentVar: "var(--chart-2)",
    labelKey: "delivery",
    financial: false,
  },
  next_action: {
    icon: PhoneCall,
    accentVar: "var(--status-blocked)",
    labelKey: "nextAction",
    financial: false,
  },
  proposal_expiry: {
    icon: FileClock,
    accentVar: "var(--destructive)",
    labelKey: "proposalExpiry",
    financial: false,
  },
  payment: { icon: Coins, accentVar: "var(--success)", labelKey: "payment", financial: true },
};

/** Stable render order for the legend and any grouped listing. */
export const EVENT_TYPE_ORDER: CalendarEventType[] = [
  "task",
  "meeting",
  "milestone",
  "delivery",
  "next_action",
  "proposal_expiry",
  "payment",
];

/** Event families visible to the given role (BR-008 hides financial from Membro). */
export function visibleEventTypes(isMembro: boolean): CalendarEventType[] {
  return EVENT_TYPE_ORDER.filter(
    (type) => !(isMembro && EVENT_TYPE_CONFIG[type].financial)
  );
}

export interface UrgencyConfig {
  /** i18n key under `calendar.urgency`. */
  labelKey: string;
  /** Tailwind text-colour class for the trailing urgency indicator. */
  className: string;
}

/**
 * Urgency indicator styling. Rendered as a trailing icon + label, separate from
 * the per-type colour, so overdue / due / done never share one treatment
 * (DESIGN.md urgency rule).
 */
export const URGENCY_CONFIG: Record<CalendarUrgency, UrgencyConfig> = {
  overdue: { labelKey: "overdue", className: "text-status-overdue" },
  due: { labelKey: "due", className: "text-status-due" },
  upcoming: { labelKey: "upcoming", className: "text-muted-foreground" },
  done: { labelKey: "done", className: "text-status-done" },
};
