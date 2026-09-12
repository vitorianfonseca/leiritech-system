"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, CalendarRange, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalendarViewMode = "month" | "week" | "agenda";

export const CALENDAR_VIEW_MODES: CalendarViewMode[] = ["month", "week", "agenda"];

const ICONS: Record<CalendarViewMode, typeof CalendarDays> = {
  month: CalendarDays,
  week: CalendarRange,
  agenda: ListOrdered,
};

export interface ViewSwitcherProps {
  value: CalendarViewMode;
  onChange: (value: CalendarViewMode) => void;
  className?: string;
}

/**
 * Segmented control for the three calendar projections. Implemented as a
 * radiogroup (arrow-key navigable, single-select) for keyboard + SR support.
 */
export function ViewSwitcher({ value, onChange, className }: ViewSwitcherProps) {
  const t = useTranslations("calendar");

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = CALENDAR_VIEW_MODES.indexOf(value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(CALENDAR_VIEW_MODES[(idx + 1) % CALENDAR_VIEW_MODES.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(
        CALENDAR_VIEW_MODES[
          (idx - 1 + CALENDAR_VIEW_MODES.length) % CALENDAR_VIEW_MODES.length
        ]
      );
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("viewSwitcher.label")}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5",
        className
      )}
    >
      {CALENDAR_VIEW_MODES.map((mode) => {
        const Icon = ICONS[mode];
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(mode)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[0.8rem] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
            <span>{t(`viewSwitcher.${mode}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
