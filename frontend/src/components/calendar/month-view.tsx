"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/api/calendar-types";
import { EventChip } from "./event-chip";
import { eventsOnDay, monthGridDays } from "./calendar-utils";

const MAX_CHIPS_PER_CELL = 3;

export interface MonthViewProps {
  anchor: Date;
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
  /** "+N more" → jump to that day (agenda). */
  onOpenDay: (day: Date) => void;
}

export function MonthView({
  anchor,
  events,
  onOpenEvent,
  onOpenDay,
}: MonthViewProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const days = React.useMemo(() => monthGridDays(anchor), [anchor]);

  const weekdayFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale]
  );

  // The seven weekday headers, derived from the first grid row (Monday-first).
  const weekdayLabels = days.slice(0, 7).map((d) => weekdayFmt.format(d));

  return (
    // The grid keeps a comfortable min width and scrolls inside its own
    // container on narrow screens — the page never scrolls horizontally.
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayLabels.map((label, i) => (
            <div
              key={i}
              className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayEvents = eventsOnDay(events, day);
            const inMonth = isSameMonth(day, anchor);
            const today = isToday(day);
            const overflow = dayEvents.length - MAX_CHIPS_PER_CELL;
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[104px] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-muted/30"
                )}
              >
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      today
                        ? "bg-signal text-signal-foreground font-semibold"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground"
                    )}
                    aria-current={today ? "date" : undefined}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, MAX_CHIPS_PER_CELL).map((event) => (
                    <EventChip
                      key={event.id}
                      event={event}
                      onOpen={onOpenEvent}
                      variant="compact"
                    />
                  ))}
                  {overflow > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className="w-full rounded-[6px] px-1.5 py-0.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("moreEvents", { count: overflow })}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
