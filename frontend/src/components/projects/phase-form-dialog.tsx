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
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import { phaseSchema, type PhaseFormValues } from "@/lib/validation/project-schemas";
import type { PhaseInput, ProjectPhase } from "@/lib/api/projects-types";

export interface PhaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this phase; otherwise it creates a new one. */
  phase: ProjectPhase | null;
  onSubmit: (input: PhaseInput) => Promise<void>;
}

export function PhaseFormDialog({ open, onOpenChange, phase, onSubmit }: PhaseFormDialogProps) {
  const t = useTranslations("projects.phaseDialog");
  const tv = useTranslations("projects.validation");
  const editing = phase !== null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseSchema((k) => tv(k))),
    defaultValues: { name: "", dueDate: "" },
  });

  React.useEffect(() => {
    if (open) {
      reset({ name: phase?.name ?? "", dueDate: phase?.dueDate ?? "" });
    }
  }, [open, phase, reset]);

  async function submit(values: PhaseFormValues) {
    await onSubmit({
      name: values.name.trim(),
      dueDate: values.dueDate ? values.dueDate : null,
    });
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
          <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>
        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("name")} required error={errors.name?.message}>
            {({ controlProps }) => (
              <Input {...controlProps} {...register("name")} placeholder={t("namePlaceholder")} />
            )}
          </CrmField>
          <CrmField label={t("dueDate")} error={errors.dueDate?.message}>
            {({ controlProps }) => <Input {...controlProps} {...register("dueDate")} type="date" />}
          </CrmField>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : editing ? t("save") : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
