"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ListTodo, PanelRightOpen, CopyPlus, Archive } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SmartTable, type SmartTableColumn, type RowAction } from "@/components/shared";
import {
  TASK_PRIORITIES,
  TASK_STATES,
  type Task,
} from "@/lib/api/tasks-types";
import { StateBadge, PriorityBadge, DueLabel, initials } from "./task-meta";

export interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  onOpen: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onArchive: (task: Task) => void;
  canEdit: (task: Task) => boolean;
}

/** List projection of the tasks board, built on the shared SmartTable (#7). */
export function TaskList({
  tasks,
  loading,
  onOpen,
  onDuplicate,
  onArchive,
  canEdit,
}: TaskListProps) {
  const t = useTranslations("tasks");

  const columns = React.useMemo<SmartTableColumn<Task>[]>(
    () => [
      {
        id: "title",
        header: t("list.columns.title"),
        accessor: (task) => task.title,
        sortable: true,
        cardPriority: 0,
        cell: (task) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{task.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {task.projectName}
              {task.phaseName ? <span aria-hidden> · {task.phaseName}</span> : null}
            </p>
          </div>
        ),
      },
      {
        id: "state",
        header: t("list.columns.state"),
        accessor: (task) => t(`state.${task.state}`),
        sortable: true,
        cardPriority: 1,
        filterOptions: TASK_STATES.map((s) => ({
          label: t(`state.${s}`),
          value: t(`state.${s}`),
        })),
        cell: (task) => <StateBadge state={task.state} />,
      },
      {
        id: "priority",
        header: t("list.columns.priority"),
        accessor: (task) => t(`priority.${task.priority}`),
        sortable: true,
        cardPriority: 2,
        filterOptions: TASK_PRIORITIES.map((p) => ({
          label: t(`priority.${p}`),
          value: t(`priority.${p}`),
        })),
        cell: (task) => <PriorityBadge priority={task.priority} />,
      },
      {
        id: "assignees",
        header: t("list.columns.assignees"),
        cell: (task) =>
          task.assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t("card.unassigned")}</span>
          ) : (
            <div className="flex -space-x-1.5">
              {task.assignees.slice(0, 3).map((a) => (
                <Avatar key={a.userId} className="size-6 ring-2 ring-card">
                  <AvatarFallback className="text-[0.625rem]">
                    {initials(a.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          ),
      },
      {
        id: "due",
        header: t("list.columns.due"),
        accessor: (task) => task.dueDate ?? "",
        sortable: true,
        cardPriority: 3,
        cell: (task) => <DueLabel dueDate={task.dueDate} className="text-sm" />,
      },
    ],
    [t]
  );

  const rowActions = React.useCallback(
    (task: Task): RowAction<Task>[] => {
      const actions: RowAction<Task>[] = [
        { label: t("list.actions.open"), icon: PanelRightOpen, onSelect: onOpen },
      ];
      if (canEdit(task)) {
        actions.push(
          { label: t("list.actions.duplicate"), icon: CopyPlus, onSelect: onDuplicate },
          {
            label: t("list.actions.archive"),
            icon: Archive,
            onSelect: onArchive,
            variant: "destructive",
          }
        );
      }
      return actions;
    },
    [t, onOpen, onDuplicate, onArchive, canEdit]
  );

  return (
    <SmartTable<Task>
      data={tasks}
      columns={columns}
      getRowId={(task) => task.id}
      loading={loading}
      searchPlaceholder={t("list.searchPlaceholder")}
      onRowClick={onOpen}
      rowActions={rowActions}
      emptyIcon={ListTodo}
      emptyTitle={t("empty.title")}
      emptyDescription={t("empty.description")}
    />
  );
}
