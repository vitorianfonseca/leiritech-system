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
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import { reopenSchema, type ReopenFormValues } from "@/lib/validation/opportunity-schemas";
import {
  PIPELINE_STAGE_IDS,
  type Opportunity,
  type PipelineStageId,
  type ReopenOpportunityInput,
} from "@/lib/api/opportunities-types";

export interface ReopenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  onConfirm: (input: ReopenOpportunityInput) => Promise<void>;
}

/** Reopen a lost opportunity into an active stage (WORKFLOW_SPEC §1.1) — a
 * re-open note is required. */
export function ReopenDialog({ open, onOpenChange, opportunity, onConfirm }: ReopenDialogProps) {
  const t = useTranslations("pipeline.reopen");
  const tStages = useTranslations("pipeline.stages");
  const tv = useTranslations("pipeline.validation");

  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReopenFormValues>({
    resolver: zodResolver(reopenSchema((k) => tv(k))),
    defaultValues: { toStageId: "qualification", note: "" },
  });

  React.useEffect(() => {
    register("toStageId");
  }, [register]);

  React.useEffect(() => {
    if (open) reset({ toStageId: "qualification", note: "" });
  }, [open, reset]);

  const toStageId = useWatch({ control, name: "toStageId" });

  if (!opportunity) return null;

  const stageOptions: ComboboxItem[] = PIPELINE_STAGE_IDS.map((s) => ({ value: s, label: tStages(s) }));

  async function submit(values: ReopenFormValues) {
    await onConfirm({ toStageId: values.toStageId as PipelineStageId, note: values.note.trim() });
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle", { title: opportunity.title })}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("stage")} required error={errors.toStageId?.message}>
            {({ controlProps }) => (
              <SearchableCombobox
                id={controlProps.id}
                aria-label={t("stage")}
                items={stageOptions}
                value={(toStageId as string) || null}
                clearable={false}
                onValueChange={(v) => setValue("toStageId", (v ?? "qualification") as PipelineStageId, { shouldValidate: true })}
              />
            )}
          </CrmField>
          <CrmField label={t("note")} required error={errors.note?.message}>
            {({ controlProps }) => (
              <Input {...controlProps} {...register("note")} placeholder={t("notePlaceholder")} autoFocus />
            )}
          </CrmField>

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
