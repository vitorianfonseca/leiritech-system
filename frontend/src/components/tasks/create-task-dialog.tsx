"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableCombobox } from "@/components/shared";
import {
  TASK_DIRECTORY,
  phaseOptions,
  projectOptions,
} from "@/lib/api/tasks";
import {
  TASK_PRIORITIES,
  type CreateTaskInput,
  type TaskPriority,
} from "@/lib/api/tasks-types";
import { AssigneePicker } from "./assignee-picker";

export interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project ids the current user may create tasks on (H7). Empty = all. */
  allowedProjectIds: string[] | null;
  onCreate: (input: CreateTaskInput) => Promise<void>;
}

/** Create-task form (F10). Title + project are required; project selection is
 * scoped for a Membro to their member projects (H7). */
export function CreateTaskDialog({
  open,
  onOpenChange,
  allowedProjectIds,
  onCreate,
}: CreateTaskDialogProps) {
  const t = useTranslations("tasks");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [phaseId, setPhaseId] = React.useState<string | null>(null);
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = React.useState("");
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([]);
  const [titleError, setTitleError] = React.useState(false);
  const [projectError, setProjectError] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const titleId = React.useId();
  const descId = React.useId();
  const dueId = React.useId();

  // Reset the form each time the dialog opens (adjust state on prop change —
  // done during render, not in an effect, per the React docs pattern).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setDescription("");
      setProjectId(null);
      setPhaseId(null);
      setPriority("normal");
      setDueDate("");
      setAssigneeIds([]);
      setTitleError(false);
      setProjectError(false);
    }
  }

  const projects = React.useMemo(() => {
    const all = projectOptions();
    const scoped = allowedProjectIds
      ? all.filter((p) => allowedProjectIds.includes(p.id))
      : all;
    return scoped.map((p) => ({ value: p.id, label: p.name }));
  }, [allowedProjectIds]);

  const phases = React.useMemo(
    () => (projectId ? phaseOptions(projectId).map((p) => ({ value: p.id, label: p.name })) : []),
    [projectId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasTitle = title.trim().length > 0;
    const hasProject = projectId !== null;
    setTitleError(!hasTitle);
    setProjectError(!hasProject);
    if (!hasTitle || !hasProject) return;
    try {
      setPending(true);
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        projectId: projectId!,
        phaseId,
        assigneeIds,
        priority,
        dueDate: dueDate || null,
      });
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>{t("create.fields.title")}</Label>
            <Input
              id={titleId}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              autoFocus
              aria-invalid={titleError}
              placeholder={t("create.fields.titlePlaceholder")}
            />
            {titleError ? (
              <p role="alert" className="text-xs text-destructive">
                {t("create.errors.titleRequired")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={descId}>{t("create.fields.description")}</Label>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("create.fields.descriptionPlaceholder")}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-signal focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("create.fields.project")}</Label>
              <SearchableCombobox
                items={projects}
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setPhaseId(null);
                  if (projectError) setProjectError(false);
                }}
                placeholder={t("create.fields.projectPlaceholder")}
                aria-label={t("create.fields.project")}
              />
              {projectError ? (
                <p role="alert" className="text-xs text-destructive">
                  {t("create.errors.projectRequired")}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>{t("create.fields.phase")}</Label>
              <SearchableCombobox
                items={phases}
                value={phaseId}
                onValueChange={setPhaseId}
                placeholder={
                  projectId
                    ? t("create.fields.phasePlaceholder")
                    : t("create.fields.phaseSelectProject")
                }
                aria-label={t("create.fields.phase")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("create.fields.priority")}</Label>
              <SearchableCombobox
                items={TASK_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
                value={priority}
                onValueChange={(v) => setPriority((v as TaskPriority) ?? "normal")}
                aria-label={t("create.fields.priority")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={dueId}>{t("create.fields.due")}</Label>
              <Input
                id={dueId}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("create.fields.assignees")}</Label>
            <AssigneePicker
              directory={TASK_DIRECTORY}
              value={assigneeIds}
              onChange={setAssigneeIds}
            />
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t("create.cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? t("create.processing") : t("create.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
