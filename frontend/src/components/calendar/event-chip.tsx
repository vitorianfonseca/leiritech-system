"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/api/calendar-types";
import { EVENT_TYPE_CONFIG, URGENCY_CONFIG } from "./event-config";

export interface EventChipProps {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  /**
   * `compact` — single dense line for month cells.
   * `full` — icon + title + time/project for week & agenda.
   */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * A single calendar event, rendered as an accessible button. Colour comes from
 * the per-type DESIGN token but is always paired with the type icon and (in
 * `full`) the type label, so meaning never rests on colour alone. Urgency is a
 * separate trailing indicator (icon + tone) so overdue / due / done stay
 * visually distinct. Clicking opens the source record (read-only projection).
 */
export function EventChip({
  event,
  onOpen,
  variant = "full",
  className,
}: EventChipProps) {
  const t = useTranslations("calendar");
  const config = EVENT_TYPE_CONFIG[event.type];
  const Icon = config.icon;
  const typeLabel = t(`types.${config.labelKey}`);
  const isDone = event.urgency === "done";

  const timeLabel = event.allDay
    ? t("allDay")
    : format(new Date(event.start), "HH:mm");

  const ariaLabel = `${typeLabel}: ${event.title}${
    event.allDay ? "" : `, ${timeLabel}`
  }${event.urgency && event.urgency !== "upcoming" ? `, ${t(`urgency.${URGENCY_CONFIG[event.urgency].labelKey}`)}` : ""}`;

  const accentStyle = { "--evt": config.accentVar } as React.CSSProperties;

  const urgencyIndicator =
    event.urgency === "overdue" ? (
      <span
        className={cn("flex items-center gap-0.5", URGENCY_CONFIG.overdue.className)}
        title={t("urgency.overdue")}
      >
        <AlertTriangle className="size-3" strokeWidth={1.8} aria-hidden />
      </span>
    ) : event.urgency === "due" ? (
      <span
        className={cn("flex items-center gap-0.5", URGENCY_CONFIG.due.className)}
        title={t("urgency.due")}
      >
        <Clock className="size-3" strokeWidth={1.8} aria-hidden />
      </span>
    ) : null;

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={ariaLabel}
        style={accentStyle}
        className={cn(
          "group flex w-full items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-left text-xs",
          "bg-[color-mix(in_oklch,var(--evt)_13%,transparent)] hover:bg-[color-mix(in_oklch,var(--evt)_22%,transparent)]",
          "border-l-2 border-[var(--evt)] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDone && "opacity-60",
          className
        )}
      >
        <Icon
          className="size-3 shrink-0 text-[var(--evt)]"
          strokeWidth={1.8}
          aria-hidden
        />
        {!event.allDay ? (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {timeLabel}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-foreground",
            isDone && "line-through"
          )}
        >
          {event.title}
        </span>
        {urgencyIndicator}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={ariaLabel}
      style={accentStyle}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left",
        "bg-[color-mix(in_oklch,var(--evt)_11%,transparent)] hover:bg-[color-mix(in_oklch,var(--evt)_20%,transparent)]",
        "border-l-[3px] border-[var(--evt)] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDone && "opacity-60",
        className
      )}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklch,var(--evt)_18%,transparent)] text-[var(--evt)]">
        <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium text-foreground",
              isDone && "line-through"
            )}
          >
            {event.title}
          </span>
          {urgencyIndicator}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{timeLabel}</span>
          <span aria-hidden>·</span>
          <span>{typeLabel}</span>
          {event.projectName ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{event.projectName}</span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}
