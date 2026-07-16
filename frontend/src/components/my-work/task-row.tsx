"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import {
  Check,
  Circle,
  Play,
  Square,
  MessageSquare,
  CalendarClock,
  Flag,
  CircleDot,
  Ban,
  PanelRightOpen,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { VariantProps } from "class-variance-authority";
import type { Role } from "@/lib/session";
import type {
  MyTask,
  TaskPriority,
  TaskStatus,
} from "@/lib/api/my-work-types";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const STATUS_META: Record<TaskStatus, { variant: BadgeVariant; icon: typeof Circle }> = {
  todo: { variant: "outline", icon: Circle },
  in_progress: { variant: "info", icon: CircleDot },
  in_review: { variant: "due", icon: CircleDot },
  done: { variant: "done", icon: Check },
};

const PRIORITY_META: Record<TaskPriority, BadgeVariant> = {
  low: "outline",
  medium: "default",
  high: "attention",
  urgent: "destructive",
};

const ALL_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
const ALL_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

/** Statuses a role may set inline. Approving to `done` is Gestor+/Admin (C3). */
function allowedStatuses(role: Role): TaskStatus[] {
  return role === "membro"
    ? ["todo", "in_progress", "in_review"]
    : ALL_STATUSES;
}

export interface TaskRowProps {
  task: MyTask;
  role: Role;
  isTimerRunning: boolean;
  onStartTimer: (task: MyTask) => void;
  onStopTimer: () => void;
  onComplete: (task: MyTask) => void;
  onSetStatus: (task: MyTask, status: TaskStatus) => void;
  onSetPriority: (task: MyTask, priority: TaskPriority) => void;
  onSetDeadline: (task: MyTask, dueDate: string | null) => void;
  onOpen: (task: MyTask, tab?: "details" | "comments") => void;
}

/**
 * One task with inline actions: complete, status, priority, deadline, timer,
 * comment and open-in-side-panel. Blocked tasks stay visible and read as
 * blocked (BR-046). Overdue due-dates render in the alarm zone; the three
 * urgency treatments never collapse into one (DESIGN.md).
 */
export function TaskRow({
  task,
  role,
  isTimerRunning,
  onStartTimer,
  onStopTimer,
  onComplete,
  onSetStatus,
  onSetPriority,
  onSetDeadline,
  onOpen,
}: TaskRowProps) {
  const t = useTranslations("myWork");
  const statusMeta = STATUS_META[task.status];

  const dueInfo = describeDue(task.dueDate);
  const completeLabel =
    role === "membro" ? t("actions.submitReview") : t("actions.complete");

  return (
    <div
      className={cn(
        "group flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 transition-colors",
        task.blocked
          ? "border-status-blocked/30 bg-status-blocked-bg/40"
          : "border-border bg-card hover:bg-accent/40"
      )}
    >
      {/* Complete toggle */}
      <button
        type="button"
        onClick={() => onComplete(task)}
        aria-label={completeLabel}
        title={completeLabel}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-input text-transparent transition-colors hover:border-success hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Check className="size-3.5" strokeWidth={2.4} aria-hidden />
      </button>

      {/* Title + meta */}
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
        <button
          type="button"
          onClick={() => onOpen(task, "details")}
          className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:text-gold focus-visible:outline-none focus-visible:underline"
        >
          {task.title}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{task.projectName}</span>
          {dueInfo ? (
            <>
              <span aria-hidden>·</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  dueInfo.overdue && "font-medium text-status-overdue"
                )}
              >
                {dueInfo.overdue ? (
                  <TriangleAlert className="size-3" strokeWidth={2} aria-hidden />
                ) : (
                  <CalendarClock className="size-3" strokeWidth={1.8} aria-hidden />
                )}
                {t(`due.${dueInfo.key}`, dueInfo.values)}
              </span>
            </>
          ) : null}
          {task.blocked ? (
            <Badge variant="blocked" className="gap-1">
              <Ban className="size-3" strokeWidth={2} aria-hidden />
              {t("taskStatus.blocked")}
            </Badge>
          ) : null}
        </div>
        {task.blocked && task.blockedReason ? (
          <p className="mt-1 text-xs text-status-blocked">{task.blockedReason}</p>
        ) : null}
      </div>

      {/* Inline action cluster */}
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("actions.changeStatus")}
            className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge variant={statusMeta.variant} className="gap-1">
              <statusMeta.icon className="size-3" strokeWidth={2} aria-hidden />
              {t(`taskStatus.${task.status}`)}
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("actions.changeStatus")}</DropdownMenuLabel>
            {allowedStatuses(role).map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={s === task.status}
                onClick={() => onSetStatus(task, s)}
              >
                {React.createElement(STATUS_META[s].icon, {
                  className: "size-4",
                  strokeWidth: 1.8,
                  "aria-hidden": true,
                })}
                {t(`taskStatus.${s}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Priority */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("actions.changePriority")}
            className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge variant={PRIORITY_META[task.priority]} className="gap-1">
              <Flag className="size-3" strokeWidth={2} aria-hidden />
              {t(`priority.${task.priority}`)}
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("actions.changePriority")}</DropdownMenuLabel>
            {ALL_PRIORITIES.map((p) => (
              <DropdownMenuItem
                key={p}
                disabled={p === task.priority}
                onClick={() => onSetPriority(task, p)}
              >
                <Flag className="size-4" strokeWidth={1.8} aria-hidden />
                {t(`priority.${p}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Deadline */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("actions.changeDeadline")}
              />
            }
          >
            <CalendarClock aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("actions.changeDeadline")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onSetDeadline(task, isoOffset(0))}>
              {t("deadline.today")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetDeadline(task, isoOffset(1))}>
              {t("deadline.tomorrow")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetDeadline(task, isoOffset(7))}>
              {t("deadline.nextWeek")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={task.dueDate === null}
              onClick={() => onSetDeadline(task, null)}
            >
              {t("deadline.clear")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Timer */}
        <Button
          variant={isTimerRunning ? "default" : "ghost"}
          size="icon-sm"
          aria-label={isTimerRunning ? t("actions.stopTimer") : t("actions.startTimer")}
          title={isTimerRunning ? t("actions.stopTimer") : t("actions.startTimer")}
          onClick={() => (isTimerRunning ? onStopTimer() : onStartTimer(task))}
          className={cn(!isTimerRunning && "text-gold hover:text-gold")}
        >
          {isTimerRunning ? (
            <Square className="fill-current" strokeWidth={0} aria-hidden />
          ) : (
            <Play className="fill-current" strokeWidth={0} aria-hidden />
          )}
        </Button>

        {/* Comments */}
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("actions.openComments", { count: task.commentCount })}
          onClick={() => onOpen(task, "comments")}
          className="gap-1 px-2 text-muted-foreground"
        >
          <MessageSquare aria-hidden />
          <span className="tabular-nums">{task.commentCount}</span>
        </Button>

        {/* Open side panel */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("actions.openDetails")}
          onClick={() => onOpen(task, "details")}
        >
          <PanelRightOpen aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function isoOffset(days: number): string {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

interface DueDescription {
  key: "today" | "tomorrow" | "overdueBy" | "inDays" | "on";
  values?: Record<string, string | number>;
  overdue: boolean;
}

function describeDue(dueDate: string | null): DueDescription | null {
  if (!dueDate) return null;
  const diff = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
  if (diff < 0) return { key: "overdueBy", values: { days: Math.abs(diff) }, overdue: true };
  if (diff === 0) return { key: "today", overdue: false };
  if (diff === 1) return { key: "tomorrow", overdue: false };
  if (diff <= 7) return { key: "inDays", values: { days: diff }, overdue: false };
  return { key: "on", values: { date: format(parseISO(dueDate), "dd/MM") }, overdue: false };
}
