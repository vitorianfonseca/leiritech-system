"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  createOpportunitySchema,
  type CreateOpportunityFormValues,
} from "@/lib/validation/opportunity-schemas";
import { crmApi } from "@/lib/api/crm";
import { useOwnerOptions } from "@/lib/use-owner-options";
import {
  PIPELINE_STAGE_IDS,
  type CreateOpportunityInput,
  type PipelineStageId,
} from "@/lib/api/opportunities-types";
import type { Role } from "@/lib/session";
import { parseEuroToCents } from "./pipeline-format";

export interface CreateOpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  canFinance: boolean;
  onConfirm: (input: CreateOpportunityInput) => Promise<void>;
}

const DEFAULTS: CreateOpportunityFormValues = {
  title: "",
  companyId: "",
  ownerId: "",
  stageId: "new_contact",
  value: "",
  nextAction: "",
  nextActionAt: "",
};

/** Quick-create form (PRD §31, progressive): core fields first (título,
 * empresa, responsável), then the pipeline details. Próxima ação is required
 * from the outset (BR-010). */
export function CreateOpportunityDialog({
  open,
  onOpenChange,
  user,
  canFinance,
  onConfirm,
}: CreateOpportunityDialogProps) {
  const t = useTranslations("pipeline.create");
  const tStages = useTranslations("pipeline.stages");
  const tv = useTranslations("pipeline.validation");

  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", "options", user.role, user.userId],
    queryFn: () =>
      crmApi.listCompanies({
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
      }),
    enabled: open,
  });

  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateOpportunityFormValues>({
    resolver: zodResolver(createOpportunitySchema((k) => tv(k))),
    defaultValues: DEFAULTS,
  });

  React.useEffect(() => {
    register("companyId");
    register("ownerId");
    register("stageId");
  }, [register]);

  React.useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const companyId = useWatch({ control, name: "companyId" });
  const ownerId = useWatch({ control, name: "ownerId" });
  const stageId = useWatch({ control, name: "stageId" });

  const companyOptions: ComboboxItem[] = (companiesQuery.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const { options: ownerOptions } = useOwnerOptions();
  const stageOptions: ComboboxItem[] = PIPELINE_STAGE_IDS.map((s) => ({ value: s, label: tStages(s) }));

  async function submit(values: CreateOpportunityFormValues) {
    const companyName = companyOptions.find((c) => c.value === values.companyId)?.label ?? "";
    await onConfirm({
      title: values.title.trim(),
      companyId: values.companyId,
      companyName,
      ownerId: values.ownerId,
      stageId: values.stageId as PipelineStageId,
      valueCents: values.value ? parseEuroToCents(values.value) : null,
      nextAction: values.nextAction.trim(),
      nextActionAt: values.nextActionAt ? values.nextActionAt : null,
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("fields.title")} required error={errors.title?.message}>
            {({ controlProps }) => (
              <Input {...controlProps} {...register("title")} placeholder={t("fields.titlePlaceholder")} autoFocus />
            )}
          </CrmField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CrmField label={t("fields.company")} required error={errors.companyId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.company")}
                  items={companyOptions}
                  loading={companiesQuery.isPending}
                  value={companyId || null}
                  placeholder={t("fields.companyPlaceholder")}
                  emptyMessage={t("fields.noCompanies")}
                  onValueChange={(v) => setValue("companyId", v ?? "", { shouldValidate: true })}
                />
              )}
            </CrmField>
            <CrmField label={t("fields.owner")} required error={errors.ownerId?.message}>
              {({ controlProps }) => (
                <SearchableCombobox
                  id={controlProps.id}
                  aria-label={t("fields.owner")}
                  items={ownerOptions}
                  value={ownerId || null}
                  placeholder={t("fields.ownerPlaceholder")}
                  onValueChange={(v) => setValue("ownerId", v ?? "", { shouldValidate: true })}
                />
              )}
            </CrmField>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("detailsSection")}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CrmField label={t("fields.stage")} error={errors.stageId?.message}>
                {({ controlProps }) => (
                  <SearchableCombobox
                    id={controlProps.id}
                    aria-label={t("fields.stage")}
                    items={stageOptions}
                    value={(stageId as string) || null}
                    clearable={false}
                    onValueChange={(v) => setValue("stageId", (v ?? "new_contact") as PipelineStageId)}
                  />
                )}
              </CrmField>
              {canFinance ? (
                <CrmField label={t("fields.value")} error={errors.value?.message} hint={t("fields.valueHint")}>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      {...register("value")}
                      inputMode="decimal"
                      placeholder={t("fields.valuePlaceholder")}
                    />
                  )}
                </CrmField>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <CrmField label={t("fields.nextAction")} required error={errors.nextAction?.message}>
              {({ controlProps }) => (
                <Input {...controlProps} {...register("nextAction")} placeholder={t("fields.nextActionPlaceholder")} />
              )}
            </CrmField>
            <CrmField label={t("fields.dueDate")} error={errors.nextActionAt?.message}>
              {({ controlProps }) => <Input {...controlProps} {...register("nextActionAt")} type="date" />}
            </CrmField>
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
