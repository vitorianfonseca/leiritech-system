"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  TASK_BOARD_STATES,
  type Task,
  type TaskState,
} from "@/lib/api/tasks-types";
import { STATE_META } from "./task-meta";
import { SortableTaskCard, TaskCardView } from "./task-card";

export interface TaskBoardProps {
  tasks: Task[];
  canDrag: boolean;
  onOpen: (task: Task) => void;
  /** Called when a card is dropped on a different column. The parent runs the
   * §1.6 guards, prompts for a blocker reason and applies the transition. */
  onRequestMove: (task: Task, toState: TaskState) => void;
}

/** Kanban board: five columns by task state, keyboard-accessible drag (BR-046
 * blocked column is visually distinct via the violet zone token). */
export function TaskBoard({ tasks, canDrag, onOpen, onRequestMove }: TaskBoardProps) {
  const t = useTranslations("tasks");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);

  const byState = React.useMemo(() => {
    const map = new Map<TaskState, Task[]>();
    for (const state of TASK_BOARD_STATES) map.set(state, []);
    for (const task of tasks) {
      const list = map.get(task.state);
      if (list) list.push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t2) => t2.id === activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t2) => t2.id === String(active.id));
    if (!task) return;
    const toState = String(over.id) as TaskState;
    if (!TASK_BOARD_STATES.includes(toState)) return;
    if (toState === task.state) return; // dropped on own column — no-op
    onRequestMove(task, toState);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 lg:grid lg:snap-none lg:grid-cols-5 lg:overflow-visible">
        {TASK_BOARD_STATES.map((state) => (
          <BoardColumn
            key={state}
            state={state}
            count={byState.get(state)?.length ?? 0}
          >
            {(byState.get(state) ?? []).length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
                {t("board.columnEmpty")}
              </p>
            ) : (
              (byState.get(state) ?? []).map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  canDrag={canDrag}
                  onOpen={onOpen}
                />
              ))
            )}
          </BoardColumn>
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCardView task={activeTask} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  state,
  count,
  children,
}: {
  state: TaskState;
  count: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("tasks");
  const { setNodeRef, isOver } = useDroppable({ id: state, data: { state } });
  const meta = STATE_META[state];
  const Icon = meta.icon;

  return (
    <section
      aria-label={t(`state.${state}`)}
      className="flex w-72 shrink-0 snap-start flex-col lg:w-full"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-t-xl border-x border-t border-border px-3 py-2.5",
          state === "blocked" ? "bg-status-blocked-bg/60" : "bg-muted/40"
        )}
      >
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon
            className={cn(
              "size-4 shrink-0",
              state === "blocked" && "text-status-blocked"
            )}
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="truncate">{t(`state.${state}`)}</span>
        </h2>
        <Badge variant={state === "blocked" ? "blocked" : "default"} className="tabular-nums">
          {count}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-b-xl border border-t-0 border-border bg-card/30 p-2 transition-colors",
          isOver && "bg-gold-muted/60 ring-2 ring-inset ring-gold/40"
        )}
      >
        {children}
      </div>
    </section>
  );
}
