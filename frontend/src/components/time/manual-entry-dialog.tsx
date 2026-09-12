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
import { BillableToggle } from "./billable-toggle";
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from "./time-format";
import { timeTaskOptions } from "@/lib/api/time";
import {
  validateTimeEntry,
  type CreateTimeEntryInput,
  type TimeEntry,
  type UpdateTimeEntryInput,
} from "@/lib/api/time-types";

export interface ManualEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this entry instead of creating a new one. */
  entry?: TimeEntry | null;
  onCreate: (input: CreateTimeEntryInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateTimeEntryInput) => Promise<void>;
}

/**
 * Manual time-entry form (F11). Task is required (BR-041); start/end ranges are
 * validated live (BR-044) via the shared `validateTimeEntry`, so the field
 * errors here exactly match the authoritative client guard. On edit the task is
 * fixed (attribution is immutable); start/end/description/billable are editable.
 */
export function ManualEntryDialog({
  open,
  onOpenChange,
  entry,
  onCreate,
  onUpdate,
}: ManualEntryDialogProps) {
  const t = useTranslations("time.entryForm");
  const tErr = useTranslations("time.entryForm.errors");
  const isEdit = entry != null;

  const tasks = React.useMemo(() => timeTaskOptions(), []);
  const taskItems = React.useMemo(
    () =>
      tasks.map((task) => ({
        value: task.taskId,
        label: task.projectActive
          ? task.taskTitle
          : `${task.taskTitle} · ${task.projectName}`,
        disabled: !task.projectActive,
      })),
    [tasks]
  );

  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [startValue, setStartValue] = React.useState("");
  const [endValue, setEndValue] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [billable, setBillable] = React.useState(true);
  const [showErrors, setShowErrors] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const descId = React.useId();
  const startId = React.useId();
  const endId = React.useId();

  // Reset the form each time the dialog opens (render-phase pattern, not effect).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setShowErrors(false);
      if (entry) {
        setTaskId(entry.taskId);
        setStartValue(toDateTimeLocalValue(new Date(entry.startedAt)));
        setEndValue(toDateTimeLocalValue(new Date(entry.endedAt)));
        setDescription(entry.description);
        setBillable(entry.billable);
      } else {
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        setTaskId(null);
        setStartValue(toDateTimeLocalValue(hourAgo));
        setEndValue(toDateTimeLocalValue(now));
        setDescription("");
        setBillable(true);
      }
    }
  }

  const selectedTask = tasks.find((task) => task.taskId === taskId) ?? null;

  const validation = React.useMemo(
    () =>
      validateTimeEntry({
        taskId,
        startedAt: fromDateTimeLocalValue(startValue),
        endedAt: fromDateTimeLocalValue(endValue),
        projectActive: isEdit ? true : selectedTask?.projectActive,
      }),
    [taskId, startValue, endValue, selectedTask, isEdit]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!validation.ok) return;
    const startedAt = fromDateTimeLocalValue(startValue);
    const endedAt = fromDateTimeLocalValue(endValue);
    try {
      setPending(true);
      if (isEdit && entry) {
        await onUpdate(entry.id, {
          startedAt,
          endedAt,
          description,
          billable,
        });
      } else {
        await onCreate({
          taskId: taskId!,
          startedAt,
          endedAt,
          description,
          billable,
        });
      }
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  const taskError = showErrors && validation.errors.task;
  const startError = showErrors && validation.errors.start;
  const endError = showErrors && validation.errors.end;

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
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label>{t("fields.task")}</Label>
            <SearchableCombobox
              items={taskItems}
              value={taskId}
              onValueChange={setTaskId}
              placeholder={t("fields.taskPlaceholder")}
              aria-label={t("fields.task")}
              disabled={isEdit}
            />
            {taskError ? (
              <p role="alert" className="text-xs text-destructive">
                {tErr(validation.errors.task!)}
              </p>
            ) : selectedTask ? (
              <p className="text-xs text-muted-foreground">{selectedTask.projectName}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={startId}>{t("fields.start")}</Label>
              <Input
                id={startId}
                type="datetime-local"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                aria-invalid={Boolean(startError)}
              />
              {startError ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(validation.errors.start!)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={endId}>{t("fields.end")}</Label>
              <Input
                id={endId}
                type="datetime-local"
                value={endValue}
                onChange={(e) => setEndValue(e.target.value)}
                aria-invalid={Boolean(endError)}
              />
              {endError ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(validation.errors.end!)}
                </p>
              ) : null}
            </div>
          </div>

          {validation.durationMinutes != null ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("duration", {
                hours: (validation.durationMinutes / 60).toFixed(2),
              })}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={descId}>{t("fields.description")}</Label>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("fields.descriptionPlaceholder")}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-signal focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("fields.billable")}</Label>
            <div>
              <BillableToggle value={billable} onChange={setBillable} />
            </div>
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? t("processing") : isEdit ? t("save") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
