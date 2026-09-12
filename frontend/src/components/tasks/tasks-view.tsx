"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, TriangleAlert, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import {
  EmptyState,
  ConfirmDialog,
  toast,
  toastWithUndo,
} from "@/components/shared";
import { CalendarView } from "@/components/calendar";
import { tasksApi, canEditTask } from "@/lib/api/tasks";
import {
  checkTaskTransition,
  type CreateTaskInput,
  type Task,
  type TaskState,
} from "@/lib/api/tasks-types";
import type { Role } from "@/lib/session";
import { TASKS_VIEW_MODES, ViewSwitcher, type TasksViewMode } from "./view-switcher";
import { TaskFilters, EMPTY_FILTERS, type TaskFilterState } from "./task-filters";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { TaskSidePanel } from "./task-side-panel";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskScopeContext } from "./task-scope";
import { useUrlState } from "@/lib/use-url-state";
import { BlockReasonDialog } from "./block-reason-dialog";

export interface TasksViewProps {
  user: { id: string; name: string; role: Role; avatarUrl: string | null };
  /**
   * Scope every view to one project. Set by the project's Tasks tab, which
   * wants the whole workspace — list, board, calendar, filters and the detail
   * dialog — rather than a second, thinner list that drifts from this one.
   * The project filter is hidden while scoped, since it can only ever have
   * one answer.
   */
  projectId?: string;
  /** Name for `projectId`, so the scoped project is offered even with no tasks. */
  projectName?: string;
  /** Restrict to one phase. Driven by the phase rail on the project Work tab. */
  phaseId?: string | null;
  /**
   * Open a task's panel on arrival from another tab. A fresh object each time
   * (not a bare id) so asking for the same task twice still opens it — the
   * second request is a new object even when the id matches.
   */
  focusTask?: { id: string; at: number } | null;
}

/** Tasks workspace (F10): List / Kanban / Calendar + detail side panel. */
export function TasksView({
  user,
  projectId,
  projectName,
  phaseId,
  focusTask,
}: TasksViewProps) {
  const t = useTranslations("tasks");
  const qc = useQueryClient();
  const { id: userId, role } = user;

  const queryKey = React.useMemo(() => ["tasks", userId, role] as const, [userId, role]);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => tasksApi.listTasks(role, userId),
  });
  const refresh = React.useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  const tasks = React.useMemo(
    () => (projectId ? (data ?? []).filter((t) => t.projectId === projectId) : (data ?? [])),
    [data, projectId]
  );

  /* ---------------- view + filters ---------------- */
  const [view, setView] = useUrlState<TasksViewMode>("view", "kanban", {
    valid: TASKS_VIEW_MODES,
    history: "replace",
  });
  const [filters, setFilters] = React.useState<TaskFilterState>(EMPTY_FILTERS);

  // The rail owns the phase selection, so mirror it into the filter state the
  // views already read rather than adding a second filtering path.
  const effectiveFilters = React.useMemo(
    () => (phaseId === undefined ? filters : { ...filters, phaseId }),
    [filters, phaseId]
  );

  const filtered = React.useMemo(
    () =>
      tasks.filter((task) => {
        const f = effectiveFilters;
        if (f.projectId && task.projectId !== f.projectId) return false;
        if (f.phaseId && task.phaseId !== f.phaseId) return false;
        if (f.assigneeId && !task.assignees.some((a) => a.userId === f.assigneeId)) return false;
        if (f.state && task.state !== f.state) return false;
        if (f.priority && task.priority !== f.priority) return false;
        if (f.labelId && !task.labels.some((l) => l.id === f.labelId)) return false;
        return true;
      }),
    [tasks, effectiveFilters]
  );

  // Filter options come from the tasks on screen, not from a roster held
  // elsewhere. Both lists used to be built from the mock fixtures, so the
  // assignee filter offered people who do not work here and the project
  // filter offered ids the backend has never seen — every option looked
  // usable and matched nothing. Deriving them from loaded data means an
  // option exists only when something can match it, costs no extra request,
  // and is scoped by BR-002 for free.
  const projects = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      if (task.projectId && task.projectName) map.set(task.projectId, task.projectName);
    }
    // A project with no tasks yet has nothing to derive from, and that is
    // exactly when someone needs to create the first one.
    if (projectId && projectName && !map.has(projectId)) map.set(projectId, projectName);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-PT"));
  }, [tasks, projectId, projectName]);

  const assignees = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      for (const a of task.assignees) if (a.name) map.set(a.userId, a.name);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-PT"));
  }, [tasks]);
  const labels = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) for (const l of task.labels) map.set(l.id, l.name);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [tasks]);

  const canEdit = React.useCallback(
    (task: Task) => canEditTask(task, role, userId),
    [role, userId]
  );

  /* ---------------- side panel ---------------- */
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  // Arriving from the overview's attention list. Adjusted during render rather
  // than in an effect — the React compiler rejects setState in an effect, and
  // this is the documented pattern for reacting to a changed prop.
  const [handledAt, setHandledAt] = React.useState<number | null>(null);
  if (focusTask && focusTask.at !== handledAt) {
    setHandledAt(focusTask.at);
    setSelectedId(focusTask.id);
    setPanelOpen(true);
  }
  const selected = React.useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId]
  );

  const openTask = React.useCallback((task: Task) => {
    setSelectedId(task.id);
    setPanelOpen(true);
  }, []);

  /* ---------------- create ---------------- */
  const [createOpen, setCreateOpen] = React.useState(false);
  const allowedProjectIds = React.useMemo(() => {
    if (role !== "membro") return null;
    return [...new Set(tasks.map((task) => task.projectId))];
  }, [role, tasks]);

  const handleCreate = React.useCallback(
    async (input: CreateTaskInput) => {
      await tasksApi.createTask(input, userId);
      await refresh();
      toast({ tone: "success", title: t("toasts.created", { title: input.title }) });
    },
    [userId, refresh, t]
  );

  /* ---------------- transitions + move ---------------- */
  const [blockTarget, setBlockTarget] = React.useState<Task | null>(null);

  const applyTransition = React.useCallback(
    (task: Task, toState: TaskState) => {
      const prev = task.state;
      tasksApi
        .transition(task.id, toState, role, userId)
        .then(refresh)
        .then(() => {
          toastWithUndo({
            tone: "success",
            title: t("toasts.moved", {
              title: task.title,
              state: t(`state.${toState}`),
            }),
            onUndo: async () => {
              await tasksApi.restoreState(task.id, prev, userId);
              await refresh();
            },
          });
        })
        .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
    },
    [role, userId, refresh, t]
  );

  const requestTransition = React.useCallback(
    (task: Task, toState: TaskState) => {
      if (toState === "blocked") {
        setBlockTarget(task);
        return;
      }
      const check = checkTaskTransition(task, toState, role);
      if (!check.ok) {
        toast({
          tone: "destructive",
          title: t(`transitionErrors.${check.messageKey ?? "invalid"}`),
        });
        return;
      }
      applyTransition(task, toState);
    },
    [role, applyTransition, t]
  );

  const handleBlockConfirm = React.useCallback(
    async (reason: string) => {
      if (!blockTarget) return;
      const prev = blockTarget.state;
      const target = blockTarget;
      await tasksApi.block(target.id, { reason }, userId);
      await refresh();
      toastWithUndo({
        tone: "warning",
        title: t("toasts.blocked", { title: target.title }),
        onUndo: async () => {
          await tasksApi.restoreState(target.id, prev, userId);
          await refresh();
        },
      });
    },
    [blockTarget, userId, refresh, t]
  );

  const handleUnblock = React.useCallback(
    (task: Task) => {
      const reason = task.blockedReason ?? "";
      tasksApi
        .unblock(task.id, userId)
        .then(refresh)
        .then(() => {
          toastWithUndo({
            tone: "success",
            title: t("toasts.unblocked", { title: task.title }),
            onUndo: async () => {
              await tasksApi.block(task.id, { reason }, userId);
              await refresh();
            },
          });
        })
        .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
    },
    [userId, refresh, t]
  );

  /* ---------------- duplicate / archive ---------------- */
  const [archiveTarget, setArchiveTarget] = React.useState<Task | null>(null);

  const handleDuplicate = React.useCallback(
    (task: Task) => {
      tasksApi
        .duplicate(task.id, userId)
        .then(refresh)
        .then(() => toast({ tone: "success", title: t("toasts.duplicated", { title: task.title }) }))
        .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
    },
    [userId, refresh, t]
  );

  const confirmArchive = React.useCallback(async () => {
    const task = archiveTarget;
    if (!task) return;
    await tasksApi.archive(task.id, userId);
    await refresh();
    if (selectedId === task.id) setPanelOpen(false);
    toastWithUndo({
      tone: "default",
      title: t("toasts.archived", { title: task.title }),
      onUndo: async () => {
        await tasksApi.restore(task.id, userId);
        await refresh();
      },
    });
  }, [archiveTarget, userId, refresh, selectedId, t]);

  /* ---------------- render ---------------- */
  const currentUser = React.useMemo(
    () => ({ id: user.id, name: user.name, avatarUrl: user.avatarUrl }),
    [user.id, user.name, user.avatarUrl]
  );

  const scoped = projectId !== undefined;

  const headerActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("refresh")}
        onClick={() => refetch()}
        disabled={isFetching}
      >
        <RefreshCw
          className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined}
          aria-hidden
        />
      </Button>
      <Button onClick={() => setCreateOpen(true)}>
        <Plus aria-hidden />
        {t("newTask")}
      </Button>
    </>
  );

  return (
    <TaskScopeContext.Provider value={projectId ?? null}>
    <div className="space-y-6">
      {/* Inside a project the page already has a heading; a second "Tasks"
          title under the tab of the same name is noise. The actions still
          belong here, so they move up beside the filters instead. */}
      {scoped ? null : (
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          actions={headerActions}
        />
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TaskFilters
          filters={filters}
          onChange={setFilters}
          projects={projectId ? [] : projects}
          assignees={assignees}
          labels={labels}
        />
        <div className="flex shrink-0 items-center gap-2">
          <ViewSwitcher value={view} onChange={setView} />
          {scoped ? headerActions : null}
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      ) : !isLoading && tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t("newTask")}
            </Button>
          }
        />
      ) : view === "list" ? (
        <TaskList
          tasks={filtered}
          loading={isLoading}
          onOpen={openTask}
          onDuplicate={handleDuplicate}
          onArchive={setArchiveTarget}
          canEdit={canEdit}
        />
      ) : view === "kanban" ? (
        <TaskBoard
          tasks={filtered}
          canDrag
          onOpen={openTask}
          onRequestMove={requestTransition}
        />
      ) : (
        <CalendarView user={{ id: userId, role }} defaultView="month" embedded />
      )}

      <TaskSidePanel
        task={selected}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        role={role}
        userId={userId}
        currentUser={currentUser}
        allTasks={tasks}
        canEdit={selected ? canEdit(selected) : false}
        onChanged={refresh}
        onRequestTransition={requestTransition}
        onUnblock={handleUnblock}
      />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        allowedProjectIds={allowedProjectIds}
        projects={projects}
        defaultProjectId={projectId}
        onCreate={handleCreate}
      />

      <BlockReasonDialog
        open={blockTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBlockTarget(null);
        }}
        taskTitle={blockTarget?.title ?? null}
        onConfirm={handleBlockConfirm}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        variant="destructive"
        title={t("archive.title")}
        description={t("archive.description", { title: archiveTarget?.title ?? "" })}
        confirmLabel={t("archive.confirm")}
        onConfirm={confirmArchive}
      />
    </div>
    </TaskScopeContext.Provider>
  );
}
