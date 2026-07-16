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
  projectCostSchema,
  eurosToCents,
  type ProjectCostFormValues,
} from "@/lib/validation/finance-schemas";
import type { ProjectCostCategory, ProjectCostInput } from "@/lib/api/finance-types";
import { FinanceField } from "./finance-field";

const CATEGORIES: ProjectCostCategory[] = [
  "subcontracting",
  "software",
  "hardware",
  "travel",
  "other",
];

export interface ProjectCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ComboboxItem[];
  lockedProjectId?: string;
  onSubmit: (input: ProjectCostInput) => Promise<void>;
}

/**
 * Record a project cost (F14 / BR-069 — Admin/grant only; the caller only
 * mounts this for authorized users). Feeds the live margin (BR-065).
 */
export function ProjectCostDialog({
  open,
  onOpenChange,
  projects,
  lockedProjectId,
  onSubmit,
}: ProjectCostDialogProps) {
  const t = useTranslations("finance");
  const tv = useTranslations("finance.validation");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProjectCostFormValues>({
    resolver: zodResolver(projectCostSchema((k) => tv(k))),
    defaultValues: {
      projectId: "",
      description: "",
      category: "other",
      amount: "",
      incurredDate: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({
      projectId: lockedProjectId ?? "",
      description: "",
      category: "other",
      amount: "",
      incurredDate: new Date().toISOString().slice(0, 10),
    });
  }, [open, lockedProjectId, reset]);

  React.useEffect(() => {
    register("projectId");
    register("category");
  }, [register]);

  const projectId = useWatch({ control, name: "projectId" });
  const category = useWatch({ control, name: "category" });

  const categoryItems: ComboboxItem[] = CATEGORIES.map((c) => ({
    value: c,
    label: t(`costCategory.${c}`),
  }));

  async function submit(values: ProjectCostFormValues) {
    const input: ProjectCostInput = {
      projectId: values.projectId,
      description: values.description.trim(),
      category: values.category,
      amountCents: eurosToCents(values.amount),
      incurredDate: values.incurredDate,
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
          <DialogTitle>{t("cost.createTitle")}</DialogTitle>
          <DialogDescription>{t("cost.subtitle")}</DialogDescription>
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
            label={t("cost.description")}
            error={errors.description?.message}
          >
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("description")}
                placeholder={t("cost.descriptionPlaceholder")}
                autoFocus
              />
            )}
          </FinanceField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FinanceField
              label={t("cost.category")}
              error={errors.category?.message}
            >
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("cost.category")}
                  items={categoryItems}
                  value={category}
                  clearable={false}
                  onValueChange={(v) =>
                    setValue("category", (v ?? "other") as ProjectCostCategory, {
                      shouldValidate: true,
                    })
                  }
                />
              )}
            </FinanceField>

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
              label={t("cost.incurredDate")}
              error={errors.incurredDate?.message}
            >
              {({ controlProps }) => (
                <Input {...controlProps} {...register("incurredDate")} type="date" />
              )}
            </FinanceField>
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
              {isSubmitting ? t("form.saving") : t("cost.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
