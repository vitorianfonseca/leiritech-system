"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Ban,
  MessageSquare,
  ListChecks,
  Link2,
  CalendarClock,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/api/tasks-types";
import { PriorityBadge, describeDue, initials } from "./task-meta";
import { useTaskScope } from "./task-scope";

interface CardViewProps {
  task: Task;
  dragging?: boolean;
  overlay?: boolean;
  /** Rendered drag handle (draggable activator). Omitted in the overlay. */
  handle?: React.ReactNode;
  onOpen?: (task: Task) => void;
}

/** Presentational task card — reused inside the DragOverlay (no dnd hooks). */
export function TaskCardView({
  task,
  dragging,
  overlay,
  handle,
  onOpen,
}: CardViewProps) {
  const t = useTranslations("tasks");
  const due = describeDue(task.dueDate);
  const scopedProjectId = useTaskScope();
  const inScope = scopedProjectId !== null && scopedProjectId === task.projectId;
  const checklistTotal = task.checklist.length;
  const checklistDone = task.checklist.filter((c) => c.done).length;

  return (
    <div
      className={cn(
        "group/card rounded-xl border bg-card p-3 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/50",
        task.state === "blocked"
          ? "border-status-blocked/40"
          : "border-border",
        dragging && "opacity-40",
        overlay && "rotate-2 shadow-lg ring-1 ring-signal/40"
      )}
    >
      <div className="flex items-start gap-1.5">
        {handle}
        <button
          type="button"
          onClick={onOpen ? () => onOpen(task) : undefined}
          disabled={!onOpen}
          className="min-w-0 flex-1 rounded text-left text-sm font-medium leading-snug text-foreground outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          {task.title}
        </button>
        <PriorityBadge priority={task.priority} className="shrink-0" />
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        {inScope ? (
          (task.phaseName ?? t("card.noPhase"))
        ) : (
          <>
            {task.projectName}
            {task.phaseName ? <span aria-hidden> · {task.phaseName}</span> : null}
          </>
        )}
      </p>

      {task.state === "blocked" && task.blockedReason ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-status-blocked-bg px-2 py-1.5 text-xs text-status-blocked">
          <Ban className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="min-w-0">
            <span className="font-medium">{t("state.blocked")}</span>
            <span className="block truncate opacity-90">{task.blockedReason}</span>
          </span>
        </div>
      ) : null}

      {due ? (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs",
            due.overdue ? "font-medium text-status-overdue" : "text-muted-foreground"
          )}
        >
          {due.overdue ? (
            <TriangleAlert className="size-3.5" strokeWidth={2} aria-hidden />
          ) : (
            <CalendarClock className="size-3.5" strokeWidth={1.8} aria-hidden />
          )}
          {t(`due.${due.key}`, due.values)}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {task.assignees.slice(0, 3).map((a) => (
            // Initials alone are ambiguous once a second person shares them;
            // the full name is one hover away and reaches a screen reader.
            <Avatar key={a.userId} className="size-6 ring-2 ring-card" title={a.name}>
              <AvatarFallback className="text-[0.625rem]">
                {initials(a.name)}
              </AvatarFallback>
              <span className="sr-only">{a.name}</span>
            </Avatar>
          ))}
          {task.assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t("card.unassigned")}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.hasUnresolvedDependencies ? (
            <span
              className="inline-flex items-center gap-0.5 text-status-blocked"
              title={t("card.hasDependencies")}
            >
              <Link2 className="size-3.5" strokeWidth={1.8} aria-hidden />
              <span className="sr-only">{t("card.hasDependencies")}</span>
            </span>
          ) : null}
          {checklistTotal > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 tabular-nums"
              title={t("card.checklist", { done: checklistDone, total: checklistTotal })}
            >
              <ListChecks className="size-3.5" strokeWidth={1.8} aria-hidden />
              {checklistDone}/{checklistTotal}
            </span>
          ) : null}
          {task.commentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <MessageSquare className="size-3.5" strokeWidth={1.8} aria-hidden />
              {task.commentCount}
            </span>
          ) : null}
        </div>
      </div>

      {task.labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <Badge key={l.id} variant="outline" className="text-[0.6875rem]">
              {l.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface SortableProps {
  task: Task;
  canDrag: boolean;
  onOpen: (task: Task) => void;
}

/**
 * Draggable board card. The drag activator is a dedicated handle
 * (keyboard-accessible via dnd-kit's KeyboardSensor); the card body stays
 * clickable to open the side panel.
 */
export function SortableTaskCard({ task, canDrag, onOpen }: SortableProps) {
  const t = useTranslations("tasks");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { state: task.state },
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
  };

  const handle = canDrag ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t("card.dragHandle", { title: task.title })}
      className="-ml-0.5 mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <GripVertical className="size-4" strokeWidth={1.8} aria-hidden />
    </button>
  ) : null;

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCardView task={task} dragging={isDragging} handle={handle} onOpen={onOpen} />
    </div>
  );
}
