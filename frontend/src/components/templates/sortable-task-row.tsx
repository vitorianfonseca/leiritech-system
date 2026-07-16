"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { GripVertical, Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TemplateTask } from "@/lib/api/template-types";
import { useRoleLabel } from "./template-helpers";

export interface SortableTaskRowProps {
  task: TemplateTask;
  canManage: boolean;
  onEdit: (task: TemplateTask) => void;
  onRemove: (task: TemplateTask) => void;
}

/** A single draggable task row inside a phase (F9 editor). */
export function SortableTaskRow({ task, canManage, onEdit, onRemove }: SortableTaskRowProps) {
  const t = useTranslations("templates");
  const roleLabel = useRoleLabel();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      {canManage ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={t("actions.reorderTask", { name: task.title })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" strokeWidth={1.8} aria-hidden />
        </button>
      ) : (
        <span className="size-6 shrink-0" aria-hidden />
      )}

      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{task.title}</span>

      <Badge variant="default" className="hidden sm:inline-flex">
        {roleLabel(task.roleResponsible)}
      </Badge>

      <span className="inline-flex items-center gap-1 tabular-nums text-xs text-muted-foreground">
        <Clock className="size-3.5" strokeWidth={1.8} aria-hidden />
        {t("hoursValue", { count: task.estimateHours })}
      </span>

      {canManage ? (
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("actions.editTask", { name: task.title })}
            onClick={() => onEdit(task)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("actions.removeTask", { name: task.title })}
            onClick={() => onRemove(task)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
