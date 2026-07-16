"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { List, Columns3, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TasksViewMode = "list" | "kanban" | "calendar";

export const TASKS_VIEW_MODES: TasksViewMode[] = ["list", "kanban", "calendar"];

const ICONS: Record<TasksViewMode, LucideIcon> = {
  list: List,
  kanban: Columns3,
  calendar: CalendarDays,
};

export interface ViewSwitcherProps {
  value: TasksViewMode;
  onChange: (value: TasksViewMode) => void;
  className?: string;
}

/**
 * Segmented control for the three task projections (Lista / Kanban /
 * Calendário). Implemented as a radiogroup — arrow-key navigable, single-select
 * — for keyboard + screen-reader support (WCAG AA).
 */
export function ViewSwitcher({ value, onChange, className }: ViewSwitcherProps) {
  const t = useTranslations("tasks");

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = TASKS_VIEW_MODES.indexOf(value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(TASKS_VIEW_MODES[(idx + 1) % TASKS_VIEW_MODES.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(
        TASKS_VIEW_MODES[(idx - 1 + TASKS_VIEW_MODES.length) % TASKS_VIEW_MODES.length]
      );
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("viewSwitcher.label")}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5",
        className
      )}
    >
      {TASKS_VIEW_MODES.map((mode) => {
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
