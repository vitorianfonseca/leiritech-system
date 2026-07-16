"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { isToday } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/api/calendar-types";
import { EventChip } from "./event-chip";
import { groupByDay } from "./calendar-utils";

export interface AgendaViewProps {
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
}

/**
 * Chronological list grouped by day — the most compact, mobile-first view.
 * Days without events are omitted. No horizontal scroll required.
 */
export function AgendaView({ events, onOpenEvent }: AgendaViewProps) {
  const locale = useLocale();
  const groups = React.useMemo(() => groupByDay(events), [events]);

  const headingFmt = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [locale]
  );

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const today = isToday(group.date);
        return (
          <div key={group.key} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <div className="sm:w-48 sm:shrink-0 sm:pt-2">
              <p
                className={cn(
                  "text-sm font-medium capitalize",
                  today ? "text-gold" : "text-foreground"
                )}
                aria-current={today ? "date" : undefined}
              >
                {headingFmt.format(group.date)}
              </p>
            </div>
            <div className="flex-1 space-y-1.5 border-l-0 sm:border-l sm:border-border sm:pl-4">
              {group.events.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  onOpen={onOpenEvent}
                  variant="full"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
