"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  milestoneSchema,
  eurosToCents,
  centsToEurosInput,
  type MilestoneFormValues,
} from "@/lib/validation/finance-schemas";
import type { MilestoneInput, PaymentMilestone } from "@/lib/api/finance-types";
import { FinanceField } from "./finance-field";

export interface MilestoneFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selectable projects (value = projectId). */
  projects: ComboboxItem[];
  /** Existing milestone when editing; null when creating. */
  milestone: PaymentMilestone | null;
  /** Lock the project select (e.g. embedded in a single project — #32). */
  lockedProjectId?: string;
  onSubmit: (input: MilestoneInput) => Promise<void>;
}

/**
 * Create / edit a payment milestone (F14). Client-side validation with visible
 * inline errors; completion criteria are REQUIRED (BR-071). Non-fiscal wording
 * throughout (BR-070/072).
 */
export function MilestoneFormDialog({
  open,
  onOpenChange,
  projects,
  milestone,
  lockedProjectId,
  onSubmit,
}: MilestoneFormDialogProps) {
  const t = useTranslations("finance");
  const tv = useTranslations("finance.validation");
  const isEdit = milestone !== null;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneSchema((k) => tv(k))),
    defaultValues: {
      projectId: "",
      description: "",
      amount: "",
      expectedDate: "",
      completionCriteria: "",
      externalInvoiceRef: "",
    },
  });

  // Re-seed the form whenever the dialog opens (create vs edit).
  React.useEffect(() => {
    if (!open) return;
    reset({
      projectId: milestone?.projectId ?? lockedProjectId ?? "",
      description: milestone?.description ?? "",
      amount: milestone ? centsToEurosInput(milestone.amountCents) : "",
      expectedDate: milestone?.expectedDate ?? "",
      completionCriteria: milestone?.completionCriteria ?? "",
      externalInvoiceRef: milestone?.externalInvoiceRef ?? "",
    });
  }, [open, milestone, lockedProjectId, reset]);

  React.useEffect(() => {
    register("projectId");
  }, [register]);

  const projectId = useWatch({ control, name: "projectId" });

  async function submit(values: MilestoneFormValues) {
    const input: MilestoneInput = {
      projectId: values.projectId,
      description: values.description.trim(),
      amountCents: eurosToCents(values.amount),
      expectedDate: values.expectedDate,
      completionCriteria: values.completionCriteria.trim(),
      externalInvoiceRef: values.externalInvoiceRef?.trim()
        ? values.externalInvoiceRef.trim()
        : null,
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
      <DialogContent className="max-w-lg p-6">
        <div className="space-y-1.5">
          <DialogTitle>
            {isEdit ? t("form.editTitle") : t("form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("form.subtitle")}</DialogDescription>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit(submit)}
          className="mt-5 flex flex-col gap-4"
        >
          <FinanceField label={t("form.project")} error={errors.projectId?.message}>
            {({ controlProps }) => (
              <SearchableCombobox
                id={controlProps.id}
                aria-label={t("form.project")}
                items={projects}
                value={projectId || null}
                onValueChange={(v) =>
                  setValue("projectId", v ?? "", { shouldValidate: true })
                }
                disabled={Boolean(lockedProjectId)}
                placeholder={t("form.projectPlaceholder")}
              />
            )}
          </FinanceField>

          <FinanceField
            label={t("form.description")}
            error={errors.description?.message}
          >
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("description")}
                placeholder={t("form.descriptionPlaceholder")}
                autoFocus
              />
            )}
          </FinanceField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FinanceField label={t("form.amount")} error={errors.amount?.message}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("amount")}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              )}
            </FinanceField>

            <FinanceField
              label={t("form.expectedDate")}
              error={errors.expectedDate?.message}
            >
              {({ controlProps }) => (
                <Input {...controlProps} {...register("expectedDate")} type="date" />
              )}
            </FinanceField>
          </div>

          <FinanceField
            label={t("form.completionCriteria")}
            required
            hint={t("form.completionCriteriaHint")}
            error={errors.completionCriteria?.message}
          >
            {({ controlProps }) => (
              <textarea
                {...controlProps}
                {...register("completionCriteria")}
                rows={3}
                placeholder={t("form.completionCriteriaPlaceholder")}
                className="flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
              />
            )}
          </FinanceField>

          <FinanceField
            label={t("form.externalRef")}
            hint={t("form.externalRefHint")}
            error={errors.externalInvoiceRef?.message}
          >
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("externalInvoiceRef")}
                placeholder={t("form.externalRefPlaceholder")}
              />
            )}
          </FinanceField>

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
              {isSubmitting
                ? t("form.saving")
                : isEdit
                  ? t("form.saveEdit")
                  : t("form.saveCreate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
