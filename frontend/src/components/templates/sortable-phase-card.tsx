"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import {
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  Flag,
  Clock,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { TemplatePhase, TemplateTask } from "@/lib/api/template-types";
import { SortableTaskRow } from "./sortable-task-row";

export interface SortablePhaseCardProps {
  phase: TemplatePhase;
  index: number;
  canManage: boolean;
  onEditPhase: (phase: TemplatePhase) => void;
  onRemovePhase: (phase: TemplatePhase) => void;
  onAddTask: (phase: TemplatePhase) => void;
  onEditTask: (phase: TemplatePhase, task: TemplateTask) => void;
  onRemoveTask: (phase: TemplatePhase, task: TemplateTask) => void;
  onReorderTasks: (phase: TemplatePhase, orderedIds: string[]) => void;
}

/**
 * A draggable phase card (F9 editor). Contains its own nested DnD context for
 * reordering the phase's tasks. Milestone phases carry a gold flag badge.
 */
export function SortablePhaseCard({
  phase,
  index,
  canManage,
  onEditPhase,
  onRemovePhase,
  onAddTask,
  onEditTask,
  onRemoveTask,
  onReorderTasks,
}: SortablePhaseCardProps) {
  const t = useTranslations("templates");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: phase.id, disabled: !canManage });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const taskHours = phase.tasks.reduce((sum, task) => sum + task.estimateHours, 0);

  function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = phase.tasks.map((task) => task.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderTasks(phase, arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 text-card-foreground shadow-sm",
        isDragging && "z-10 opacity-90 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2">
        {canManage ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="mt-0.5 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            aria-label={t("actions.reorderPhase", { name: phase.name })}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <h3 className="font-heading text-base font-semibold text-foreground">{phase.name}</h3>
            {phase.isMilestone ? (
              <Badge variant="gold" className="gap-1">
                <Flag className="size-3" strokeWidth={2} aria-hidden />
                {phase.milestoneName || t("phaseForm.milestone")}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" strokeWidth={1.8} aria-hidden />
              {t("durationDays", { count: phase.expectedDurationDays })}
            </span>
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" strokeWidth={1.8} aria-hidden />
              {t("tasksValue", { count: phase.tasks.length })}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              {t("hoursValue", { count: taskHours })}
            </span>
          </div>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("actions.editPhase", { name: phase.name })}
              onClick={() => onEditPhase(phase)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("actions.removePhase", { name: phase.name })}
              onClick={() => onRemovePhase(phase)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>

      {/* Tasks */}
      {phase.tasks.length === 0 ? (
        <EmptyState
          variant="bare"
          icon={ListChecks}
          title={t("taskEmpty.title")}
          description={canManage ? t("taskEmpty.description") : undefined}
          className="py-6"
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTaskDragEnd}
        >
          <SortableContext
            items={phase.tasks.map((task) => task.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1.5">
              {phase.tasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  canManage={canManage}
                  onEdit={(tk) => onEditTask(phase, tk)}
                  onRemove={(tk) => onRemoveTask(phase, tk)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canManage ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => onAddTask(phase)}>
            <Plus aria-hidden />
            {t("actions.addTask")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
