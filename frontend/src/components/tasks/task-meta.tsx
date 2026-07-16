"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import {
  Circle,
  CircleDot,
  Eye,
  Ban,
  CheckCircle2,
  Flag,
  CalendarClock,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskState } from "@/lib/api/tasks-types";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

/**
 * Single source of truth for how a task state / priority reads across the list,
 * board, calendar and side panel. State is ALWAYS icon + colour + label, never
 * colour alone (WCAG AA / DESIGN.md); blocked uses the distinct violet zone
 * token + Ban icon so it can never be confused with overdue (BR-046).
 */
export const STATE_META: Record<
  TaskState,
  { variant: BadgeVariant; icon: LucideIcon }
> = {
  todo: { variant: "outline", icon: Circle },
  in_progress: { variant: "info", icon: CircleDot },
  in_review: { variant: "due", icon: Eye },
  blocked: { variant: "blocked", icon: Ban },
  done: { variant: "done", icon: CheckCircle2 },
};

export const PRIORITY_META: Record<TaskPriority, BadgeVariant> = {
  low: "outline",
  normal: "default",
  high: "attention",
  urgent: "destructive",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function StateBadge({
  state,
  className,
}: {
  state: TaskState;
  className?: string;
}) {
  const t = useTranslations("tasks");
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={cn("gap-1", className)}>
      <Icon aria-hidden />
      {t(`state.${state}`)}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const t = useTranslations("tasks");
  return (
    <Badge variant={PRIORITY_META[priority]} className={cn("gap-1", className)}>
      <Flag aria-hidden />
      {t(`priority.${priority}`)}
    </Badge>
  );
}

interface DueDescription {
  key: "today" | "tomorrow" | "overdueBy" | "inDays" | "on";
  values?: Record<string, string | number>;
  overdue: boolean;
}

export function describeDue(dueDate: string | null): DueDescription | null {
  if (!dueDate) return null;
  const diff = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
  if (diff < 0) return { key: "overdueBy", values: { days: Math.abs(diff) }, overdue: true };
  if (diff === 0) return { key: "today", overdue: false };
  if (diff === 1) return { key: "tomorrow", overdue: false };
  if (diff <= 7) return { key: "inDays", values: { days: diff }, overdue: false };
  return { key: "on", values: { date: format(parseISO(dueDate), "dd/MM/yyyy") }, overdue: false };
}

/** Inline due-date label. Overdue reads in the alarm zone (red + warning icon). */
export function DueLabel({
  dueDate,
  className,
}: {
  dueDate: string | null;
  className?: string;
}) {
  const t = useTranslations("tasks");
  const info = describeDue(dueDate);
  if (!info) return <span className="text-muted-foreground">{t("due.none")}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        info.overdue && "font-medium text-status-overdue",
        className
      )}
    >
      {info.overdue ? (
        <TriangleAlert className="size-3.5" strokeWidth={2} aria-hidden />
      ) : (
        <CalendarClock className="size-3.5" strokeWidth={1.8} aria-hidden />
      )}
      {t(`due.${info.key}`, info.values)}
    </span>
  );
}

export function formatDueDate(dueDate: string): string {
  return format(parseISO(dueDate), "dd/MM/yyyy");
}
