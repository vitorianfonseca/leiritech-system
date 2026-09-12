"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { isToday } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/api/calendar-types";
import { EventChip } from "./event-chip";
import { eventsOnDay, weekDays } from "./calendar-utils";

export interface WeekViewProps {
  anchor: Date;
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
}

/**
 * Seven day-columns, each listing its events in time order (all-day first).
 * A column layout rather than a pixel-timed grid keeps the view light and
 * responsive; on narrow screens the columns scroll inside their own container.
 */
export function WeekView({ anchor, events, onOpenEvent }: WeekViewProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const days = React.useMemo(() => weekDays(anchor), [anchor]);

  const dayFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }),
    [locale]
  );

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[840px] grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEvents = eventsOnDay(events, day).sort((a, b) => {
            if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
            return a.start.localeCompare(b.start);
          });
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex flex-col rounded-lg border border-border bg-card/40",
                today && "border-signal/60"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-between gap-1 rounded-t-lg border-b border-border px-2.5 py-2",
                  today && "bg-signal-muted"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-medium capitalize",
                    today ? "text-signal" : "text-foreground"
                  )}
                  aria-current={today ? "date" : undefined}
                >
                  {dayFmt.format(day)}
                </span>
                {dayEvents.length > 0 ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {dayEvents.length}
                  </span>
                ) : null}
              </div>
              <div className="flex-1 space-y-1.5 p-1.5">
                {dayEvents.length === 0 ? (
                  <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                    {t("noEventsDay")}
                  </p>
                ) : (
                  dayEvents.map((event) => (
                    <EventChip
                      key={event.id}
                      event={event}
                      onOpen={onOpenEvent}
                      variant="compact"
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
