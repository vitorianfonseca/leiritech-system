"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@/lib/form/zod-resolver";
import { taskSchema, parseHours, type TaskFormValues } from "@/lib/validation/template-schemas";
import {
  TEMPLATE_TASK_ROLES,
  type TaskInput,
  type TemplateTask,
} from "@/lib/api/template-types";
import { TemplateField, TemplateSelect } from "./template-field";

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing task when editing; null when adding. */
  task: TemplateTask | null;
  onSubmit: (input: TaskInput) => Promise<void>;
}

/** Add / edit a template task (title, responsible role, estimate hours). */
export function TaskFormDialog({ open, onOpenChange, task, onSubmit }: TaskFormDialogProps) {
  const t = useTranslations("templates");
  const tv = useTranslations("templates.validation");
  const tr = useTranslations("templates.roles");
  const isEdit = task !== null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema((k) => tv(k))),
    defaultValues: {
      title: "",
      roleResponsible: "developer",
      estimateHours: "4",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({
      title: task?.title ?? "",
      roleResponsible: task?.roleResponsible ?? "developer",
      estimateHours: task ? String(task.estimateHours) : "4",
    });
  }, [open, task, reset]);

  async function submit(values: TaskFormValues) {
    const input: TaskInput = {
      title: values.title.trim(),
      roleResponsible: values.roleResponsible,
      estimateHours: parseHours(values.estimateHours),
    };
    await onSubmit(input);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md p-6">
        <div className="space-y-1.5">
          <DialogTitle>{isEdit ? t("taskForm.editTitle") : t("taskForm.addTitle")}</DialogTitle>
          <DialogDescription>{t("taskForm.subtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <TemplateField label={t("taskForm.title")} required error={errors.title?.message}>
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("title")}
                placeholder={t("taskForm.titlePlaceholder")}
                autoFocus
              />
            )}
          </TemplateField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TemplateField label={t("taskForm.role")} error={errors.roleResponsible?.message}>
              {({ controlProps }) => (
                <TemplateSelect {...controlProps} {...register("roleResponsible")}>
                  {TEMPLATE_TASK_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {tr(role)}
                    </option>
                  ))}
                </TemplateSelect>
              )}
            </TemplateField>

            <TemplateField
              label={t("taskForm.estimateHours")}
              error={errors.estimateHours?.message}
            >
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("estimateHours")}
                  inputMode="decimal"
                  placeholder="4"
                />
              )}
            </TemplateField>
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("form.saving") : isEdit ? t("form.saveEdit") : t("taskForm.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
