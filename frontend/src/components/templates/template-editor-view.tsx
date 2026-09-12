"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowLeft,
  Plus,
  Pencil,
  RefreshCw,
  TriangleAlert,
  Clock,
  Layers,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import {
  ConfirmDialog,
  EmptyState,
  SkeletonCard,
  toast,
  toastWithUndo,
} from "@/components/shared";
import { templatesApi } from "@/lib/api/templates";
import {
  canManageTemplates,
  type PhaseInput,
  type TaskInput,
  type TemplateDetail,
  type TemplateInput,
  type TemplatePhase,
  type TemplateTask,
} from "@/lib/api/template-types";
import type { Role } from "@/lib/session";
import { TemplateFormDialog } from "./template-form-dialog";
import { PhaseFormDialog } from "./phase-form-dialog";
import { TaskFormDialog } from "./task-form-dialog";
import { SortablePhaseCard } from "./sortable-phase-card";
import { TemplateTypeBadge } from "./template-helpers";

export interface TemplateEditorViewProps {
  templateId: string;
  role: Role;
}

/**
 * /settings/templates/[id] — the template editor (F9). Admin edits metadata,
 * phases and tasks with drag-and-drop ordering; Gestor gets a read-only view.
 * Add/edit use dialogs; removals confirm and offer Toast undo.
 */
export function TemplateEditorView({ templateId, role }: TemplateEditorViewProps) {
  const t = useTranslations("templates");
  const qc = useQueryClient();
  const canManage = canManageTemplates(role);

  const queryKey = React.useMemo(() => ["templates", templateId] as const, [templateId]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => templatesApi.get(templateId),
  });

  // Local, drag-friendly copy of the phases (kept in sync with the query).
  // Synced by adjusting state during render (React "you might not need an
  // effect" pattern) so a new fetch reseeds the order without an effect.
  const [phases, setPhases] = React.useState<TemplatePhase[]>(data?.phases ?? []);
  const [syncedDetail, setSyncedDetail] = React.useState<TemplateDetail | null>(data ?? null);
  if (data && data !== syncedDetail) {
    setSyncedDetail(data);
    setPhases(data.phases);
  }

  const refresh = React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey });
    await qc.invalidateQueries({ queryKey: ["templates", "list"] });
  }, [qc, queryKey]);

  const applyDetail = React.useCallback((detail: TemplateDetail) => {
    setPhases(detail.phases);
    qc.setQueryData(queryKey, detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ---------------- dialog state ---------------- */
  const [metaOpen, setMetaOpen] = React.useState(false);
  const [phaseDialogOpen, setPhaseDialogOpen] = React.useState(false);
  const [editingPhase, setEditingPhase] = React.useState<TemplatePhase | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false);
  const [taskPhase, setTaskPhase] = React.useState<TemplatePhase | null>(null);
  const [editingTask, setEditingTask] = React.useState<TemplateTask | null>(null);
  const [removingPhase, setRemovingPhase] = React.useState<TemplatePhase | null>(null);
  const [removingTask, setRemovingTask] = React.useState<{ phase: TemplatePhase; task: TemplateTask } | null>(null);

  /* ---------------- metadata ---------------- */
  const handleUpdateMeta = React.useCallback(
    async (input: TemplateInput) => {
      const detail = await templatesApi.updateTemplate(templateId, input, role);
      applyDetail(detail);
      await refresh();
      toast({ tone: "success", title: t("toasts.updated") });
    },
    [applyDetail, refresh, role, t, templateId],
  );

  /* ---------------- phases ---------------- */
  const handleAddPhase = React.useCallback(
    async (input: PhaseInput) => {
      const detail = await templatesApi.addPhase(templateId, input, role);
      applyDetail(detail);
      await refresh();
      toast({ tone: "success", title: t("toasts.phaseAdded") });
    },
    [applyDetail, refresh, role, t, templateId],
  );

  const handleEditPhase = React.useCallback(
    async (input: PhaseInput) => {
      if (!editingPhase) return;
      const detail = await templatesApi.updatePhase(editingPhase.id, input, role);
      applyDetail(detail);
      await refresh();
      toast({ tone: "success", title: t("toasts.phaseUpdated") });
    },
    [applyDetail, editingPhase, refresh, role, t],
  );

  const handleRemovePhase = React.useCallback(async () => {
    if (!removingPhase) return;
    const target = removingPhase;
    await templatesApi.removePhase(target.id, role);
    const detail = await templatesApi.get(templateId);
    if (detail) applyDetail(detail);
    await refresh();
    toastWithUndo({
      tone: "warning",
      title: t("toasts.phaseRemoved", { name: target.name }),
      onUndo: async () => {
        await templatesApi.restorePhase(templateId, target, role);
        const restored = await templatesApi.get(templateId);
        if (restored) applyDetail(restored);
        await refresh();
      },
    });
  }, [applyDetail, removingPhase, refresh, role, t, templateId]);

  const handlePhaseDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = phases.map((p) => p.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      const byId = new Map(phases.map((p) => [p.id, p]));
      setPhases(nextIds.map((id, i) => ({ ...byId.get(id)!, order: i })));
      void templatesApi
        .reorderPhases(templateId, nextIds, role)
        .then(refresh)
        .catch(() => {
          toast({ tone: "destructive", title: t("toasts.reorderFailed") });
          void refetch();
        });
    },
    [phases, refetch, refresh, role, t, templateId],
  );

  /* ---------------- tasks ---------------- */
  const handleAddOrEditTask = React.useCallback(
    async (input: TaskInput) => {
      if (!taskPhase) return;
      if (editingTask) {
        const detail = await templatesApi.updateTask(editingTask.id, input, role);
        applyDetail(detail);
        await refresh();
        toast({ tone: "success", title: t("toasts.taskUpdated") });
      } else {
        const detail = await templatesApi.addTask(taskPhase.id, input, role);
        applyDetail(detail);
        await refresh();
        toast({ tone: "success", title: t("toasts.taskAdded") });
      }
    },
    [applyDetail, editingTask, refresh, role, t, taskPhase],
  );

  const handleRemoveTask = React.useCallback(async () => {
    if (!removingTask) return;
    const { phase, task } = removingTask;
    await templatesApi.removeTask(task.id, role);
    const detail = await templatesApi.get(templateId);
    if (detail) applyDetail(detail);
    await refresh();
    toastWithUndo({
      tone: "warning",
      title: t("toasts.taskRemoved", { name: task.title }),
      onUndo: async () => {
        await templatesApi.restoreTask(phase.id, task, role);
        const restored = await templatesApi.get(templateId);
        if (restored) applyDetail(restored);
        await refresh();
      },
    });
  }, [applyDetail, removingTask, refresh, role, t, templateId]);

  const handleReorderTasks = React.useCallback(
    (phase: TemplatePhase, orderedIds: string[]) => {
      setPhases((prev) =>
        prev.map((p) => {
          if (p.id !== phase.id) return p;
          const byId = new Map(p.tasks.map((task) => [task.id, task]));
          return {
            ...p,
            tasks: orderedIds.map((id, i) => ({ ...byId.get(id)!, order: i })),
          };
        }),
      );
      void templatesApi
        .reorderTasks(phase.id, orderedIds, role)
        .then(refresh)
        .catch(() => {
          toast({ tone: "destructive", title: t("toasts.reorderFailed") });
          void refetch();
        });
    },
    [refetch, refresh, role, t],
  );

  /* ---------------- openers ---------------- */
  const openAddPhase = () => {
    setEditingPhase(null);
    setPhaseDialogOpen(true);
  };
  const openEditPhase = (phase: TemplatePhase) => {
    setEditingPhase(phase);
    setPhaseDialogOpen(true);
  };
  const openAddTask = (phase: TemplatePhase) => {
    setTaskPhase(phase);
    setEditingTask(null);
    setTaskDialogOpen(true);
  };
  const openEditTask = (phase: TemplatePhase, task: TemplateTask) => {
    setTaskPhase(phase);
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const backLink = (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/settings/templates" />}>
      <ArrowLeft aria-hidden />
      {t("editor.back")}
    </Button>
  );

  /* ---------------- states ---------------- */
  if (isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        {backLink}
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
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={TriangleAlert}
          title={t("editor.notFoundTitle")}
          description={t("editor.notFoundDescription")}
          action={
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<Link href="/settings/templates" />}
            >
              <ArrowLeft aria-hidden />
              {t("editor.back")}
            </Button>
          }
        />
      </div>
    );
  }

  const totalHours = phases.reduce(
    (sum, p) => sum + p.tasks.reduce((s, task) => s + task.estimateHours, 0),
    0,
  );
  const taskCount = phases.reduce((sum, p) => sum + p.tasks.length, 0);

  return (
    <div className="space-y-6">
      {backLink}

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {data.name}
            <TemplateTypeBadge type={data.type} />
            {!data.active ? <Badge variant="outline">{t("status.inactive")}</Badge> : null}
          </span>
        }
        subtitle={data.description}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("actions.refresh")}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden />
            </Button>
            {canManage ? (
              <Button variant="outline" onClick={() => setMetaOpen(true)}>
                <Pencil aria-hidden />
                {t("actions.editMeta")}
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
          {t("editor.phaseSummary", { count: phases.length })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
          {t("editor.taskSummary", { count: taskCount })}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Clock className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
          {t("editor.hoursSummary", { count: totalHours })}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {t("editor.durationSummary", { count: data.expectedDurationDays })}
        </span>
      </div>

      {!canManage ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("editor.readOnly")}
        </p>
      ) : null}

      {/* Phases */}
      {phases.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("phaseEmpty.title")}
          description={canManage ? t("phaseEmpty.description") : t("phaseEmpty.readOnly")}
          action={
            canManage ? (
              <Button onClick={openAddPhase}>
                <Plus aria-hidden />
                {t("actions.addPhase")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handlePhaseDragEnd}
        >
          <SortableContext
            items={phases.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-4">
              {phases.map((phase, index) => (
                <SortablePhaseCard
                  key={phase.id}
                  phase={phase}
                  index={index}
                  canManage={canManage}
                  onEditPhase={openEditPhase}
                  onRemovePhase={setRemovingPhase}
                  onAddTask={openAddTask}
                  onEditTask={openEditTask}
                  onRemoveTask={(phaseArg, task) => setRemovingTask({ phase: phaseArg, task })}
                  onReorderTasks={handleReorderTasks}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canManage && phases.length > 0 ? (
        <Button variant="outline" onClick={openAddPhase}>
          <Plus aria-hidden />
          {t("actions.addPhase")}
        </Button>
      ) : null}

      {/* Dialogs (gated to canManage) */}
      {canManage ? (
        <>
          <TemplateFormDialog
            open={metaOpen}
            onOpenChange={setMetaOpen}
            template={data}
            onSubmit={handleUpdateMeta}
          />
          <PhaseFormDialog
            open={phaseDialogOpen}
            onOpenChange={setPhaseDialogOpen}
            phase={editingPhase}
            onSubmit={editingPhase ? handleEditPhase : handleAddPhase}
          />
          <TaskFormDialog
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
            task={editingTask}
            onSubmit={handleAddOrEditTask}
          />
          <ConfirmDialog
            open={removingPhase !== null}
            onOpenChange={(open) => {
              if (!open) setRemovingPhase(null);
            }}
            variant="destructive"
            title={t("removePhaseConfirm.title")}
            description={
              removingPhase
                ? t("removePhaseConfirm.description", { name: removingPhase.name })
                : undefined
            }
            confirmLabel={t("removePhaseConfirm.confirm")}
            onConfirm={handleRemovePhase}
          />
          <ConfirmDialog
            open={removingTask !== null}
            onOpenChange={(open) => {
              if (!open) setRemovingTask(null);
            }}
            variant="destructive"
            title={t("removeTaskConfirm.title")}
            description={
              removingTask
                ? t("removeTaskConfirm.description", { name: removingTask.task.title })
                : undefined
            }
            confirmLabel={t("removeTaskConfirm.confirm")}
            onConfirm={handleRemoveTask}
          />
        </>
      ) : null}
    </div>
  );
}
