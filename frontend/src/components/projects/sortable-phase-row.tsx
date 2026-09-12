"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import {
  GripVertical,
  MoreHorizontal,
  PlayCircle,
  Ban,
  Undo2,
  CheckCircle2,
  RotateCcw,
  Pencil,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ProgressBar } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { ProjectPhase } from "@/lib/api/projects-types";
import { PhaseStateBadge } from "./status-badges";
import { formatDate } from "./project-format";

export interface SortablePhaseRowProps {
  phase: ProjectPhase;
  canManage: boolean;
  /** True when non-archived tasks are all done but the phase is not completed (BR-051). */
  completable: boolean;
  onStart: (p: ProjectPhase) => void;
  onBlock: (p: ProjectPhase) => void;
  onUnblock: (p: ProjectPhase) => void;
  onComplete: (p: ProjectPhase) => void;
  onReopen: (p: ProjectPhase) => void;
  onEdit: (p: ProjectPhase) => void;
  onRemove: (p: ProjectPhase) => void;
}

export function SortablePhaseRow({
  phase,
  canManage,
  completable,
  onStart,
  onBlock,
  onUnblock,
  onComplete,
  onReopen,
  onEdit,
  onRemove,
}: SortablePhaseRowProps) {
  const t = useTranslations("projects.phases");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: phase.id, disabled: !canManage });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const progress =
    phase.tasksTotal > 0 ? Math.round((phase.tasksDone / phase.tasksTotal) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border bg-card p-4 transition-shadow",
        isDragging && "z-10 shadow-lg"
      )}
    >
      <div className="flex items-start gap-3">
        {canManage ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("dragHandle", { name: phase.name })}
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
        ) : (
          <span className="mt-0.5 w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
            {phase.order}
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-foreground">{phase.name}</span>
              <PhaseStateBadge state={phase.state} />
            </div>

            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label={t("phaseActions")} />}
                >
                  <MoreHorizontal aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {phase.state === "not_started" ? (
                    <DropdownMenuItem onClick={() => onStart(phase)}>
                      <PlayCircle aria-hidden />
                      {t("actions.start")}
                    </DropdownMenuItem>
                  ) : null}
                  {phase.state === "in_progress" ? (
                    <DropdownMenuItem onClick={() => onBlock(phase)}>
                      <Ban aria-hidden />
                      {t("actions.block")}
                    </DropdownMenuItem>
                  ) : null}
                  {phase.state === "blocked" ? (
                    <DropdownMenuItem onClick={() => onUnblock(phase)}>
                      <Undo2 aria-hidden />
                      {t("actions.unblock")}
                    </DropdownMenuItem>
                  ) : null}
                  {phase.state === "in_progress" || phase.state === "blocked" ? (
                    <DropdownMenuItem onClick={() => onComplete(phase)}>
                      <CheckCircle2 aria-hidden />
                      {t("actions.complete")}
                    </DropdownMenuItem>
                  ) : null}
                  {phase.state === "completed" ? (
                    <DropdownMenuItem onClick={() => onReopen(phase)}>
                      <RotateCcw aria-hidden />
                      {t("actions.reopen")}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => onEdit(phase)}>
                    <Pencil aria-hidden />
                    {t("actions.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onRemove(phase)}>
                    <Trash2 aria-hidden />
                    {t("actions.remove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {t("taskCount", { done: phase.tasksDone, total: phase.tasksTotal })}
            </span>
            {phase.dueDate ? <span>· {t("due", { date: formatDate(phase.dueDate) })}</span> : null}
          </div>

          <ProgressBar
            value={progress}
            tone={phase.state === "completed" ? "success" : "primary"}
            size="sm"
            aria-label={t("progressLabel", { name: phase.name })}
          />

          {phase.state === "blocked" && phase.blockerReason ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-status-blocked-bg px-2 py-1.5 text-xs text-status-blocked">
              <Ban className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              {phase.blockerReason}
            </p>
          ) : null}

          {completable && canManage ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-signal/40 bg-signal-muted px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-foreground">
                <Sparkles className="size-3.5 shrink-0 text-signal" strokeWidth={1.8} aria-hidden />
                {t("completeSuggestion")}
              </span>
              <Button size="xs" onClick={() => onComplete(phase)}>
                <CheckCircle2 aria-hidden />
                {t("actions.complete")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
