"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
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
import { Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog, EmptyState, toast } from "@/components/shared";
import { projectsApi, phaseCompletable } from "@/lib/api/projects";
import {
  ProjectError,
  type PhaseInput,
  type PhaseTransition,
  type Project,
  type ProjectPhase,
} from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";
import { SortablePhaseRow } from "./sortable-phase-row";
import { PhaseFormDialog } from "./phase-form-dialog";
import { ReasonDialog } from "./reason-dialog";

export interface PhasesTabProps {
  project: Project;
  user: { role: Role; userId: string };
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}

export function PhasesTab({ project, user, canManage, onChanged }: PhasesTabProps) {
  const t = useTranslations("projects.phases");
  const tErr = useTranslations("projects.errors");

  // Local order mirror for optimistic reorder; reseeded when the project changes
  // (React's sanctioned "adjust state during render on prop change" pattern).
  const [phases, setPhases] = React.useState<ProjectPhase[]>(project.phases);
  const [syncedProject, setSyncedProject] = React.useState(project);
  if (project !== syncedProject) {
    setSyncedProject(project);
    setPhases(project.phases);
  }

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingPhase, setEditingPhase] = React.useState<ProjectPhase | null>(null);
  const [blockingPhase, setBlockingPhase] = React.useState<ProjectPhase | null>(null);
  const [removingPhase, setRemovingPhase] = React.useState<ProjectPhase | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const guardToast = React.useCallback(
    (error: unknown) => {
      const detail = error instanceof ProjectError && error.detailKey ? error.detailKey : undefined;
      const code = error instanceof ProjectError ? error.code : "network";
      toast({ tone: "destructive", title: detail ? tErr(`guard.${detail}`) : tErr(code) });
    },
    [tErr]
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = phases.map((p) => p.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      const byId = new Map(phases.map((p) => [p.id, p]));
      setPhases(nextIds.map((id, i) => ({ ...byId.get(id)!, order: i + 1 })));
      void projectsApi
        .reorderPhases(project.id, nextIds, user.userId)
        .then(() => onChanged())
        .catch(() => {
          toast({ tone: "destructive", title: tErr("reorderFailed") });
          setPhases(project.phases);
        });
    },
    [phases, project.id, project.phases, user.userId, onChanged, tErr]
  );

  const transition = React.useCallback(
    async (phase: ProjectPhase, transition: PhaseTransition, reason?: string) => {
      try {
        await projectsApi.transitionPhase(project.id, phase.id, { transition, reason }, user.userId);
        await onChanged();
        toast({ tone: "success", title: t(`toast.${transition}`) });
      } catch (error) {
        guardToast(error);
      }
    },
    [project.id, user.userId, onChanged, t, guardToast]
  );

  const submitForm = React.useCallback(
    async (input: PhaseInput) => {
      if (editingPhase) {
        await projectsApi.updatePhase(project.id, editingPhase.id, input, user.userId);
      } else {
        await projectsApi.addPhase(project.id, input, user.userId);
      }
      await onChanged();
      toast({ tone: "success", title: editingPhase ? t("toast.updated") : t("toast.added") });
    },
    [editingPhase, project.id, user.userId, onChanged, t]
  );

  const removePhase = React.useCallback(async () => {
    if (!removingPhase) return;
    await projectsApi.removePhase(project.id, removingPhase.id, user.userId);
    await onChanged();
    toast({ tone: "warning", title: t("toast.removed") });
  }, [removingPhase, project.id, user.userId, onChanged, t]);

  const openCreate = () => {
    setEditingPhase(null);
    setFormOpen(true);
  };
  const openEdit = (p: ProjectPhase) => {
    setEditingPhase(p);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        {canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus aria-hidden />
            {t("addPhase")}
          </Button>
        ) : null}
      </div>

      {phases.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState
              variant="bare"
              icon={Layers}
              title={t("empty.title")}
              description={t("empty.description")}
              action={
                canManage ? (
                  <Button variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden />
                    {t("addPhase")}
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {phases.map((phase) => (
                <SortablePhaseRow
                  key={phase.id}
                  phase={phase}
                  canManage={canManage}
                  completable={phaseCompletable(phase)}
                  onStart={(p) => transition(p, "start")}
                  onBlock={(p) => setBlockingPhase(p)}
                  onUnblock={(p) => transition(p, "unblock")}
                  onComplete={(p) => transition(p, "complete")}
                  onReopen={(p) => transition(p, "reopen")}
                  onEdit={openEdit}
                  onRemove={(p) => setRemovingPhase(p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canManage ? (
        <>
          <PhaseFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            phase={editingPhase}
            onSubmit={submitForm}
          />
          <ReasonDialog
            open={blockingPhase !== null}
            onOpenChange={(open) => {
              if (!open) setBlockingPhase(null);
            }}
            title={t("blockDialog.title")}
            description={t("blockDialog.description")}
            label={t("blockDialog.label")}
            placeholder={t("blockDialog.placeholder")}
            confirmLabel={t("actions.block")}
            onConfirm={async (reason) => {
              if (blockingPhase) await transition(blockingPhase, "block", reason);
            }}
          />
          <ConfirmDialog
            open={removingPhase !== null}
            onOpenChange={(open) => {
              if (!open) setRemovingPhase(null);
            }}
            variant="destructive"
            title={t("removeConfirm.title")}
            description={
              removingPhase ? t("removeConfirm.description", { name: removingPhase.name }) : undefined
            }
            confirmLabel={t("removeConfirm.confirm")}
            onConfirm={removePhase}
          />
        </>
      ) : null}
    </div>
  );
}
