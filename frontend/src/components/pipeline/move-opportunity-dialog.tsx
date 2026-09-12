"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
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
import { moveSchema, type MoveFormValues } from "@/lib/validation/opportunity-schemas";
import type {
  MoveOpportunityInput,
  Opportunity,
  PipelineStageId,
} from "@/lib/api/opportunities-types";

export interface MoveOpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  toStageId: PipelineStageId | null;
  onConfirm: (input: MoveOpportunityInput) => Promise<void>;
}

/**
 * Shown when a card is dropped on a new column. Enforces a próxima ação
 * (BR-010) before the move commits — this IS the block. The card does not move
 * until this dialog resolves successfully.
 */
export function MoveOpportunityDialog({
  open,
  onOpenChange,
  opportunity,
  toStageId,
  onConfirm,
}: MoveOpportunityDialogProps) {
  const t = useTranslations("pipeline.move");
  const tStages = useTranslations("pipeline.stages");
  const tv = useTranslations("pipeline.validation");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MoveFormValues>({
    resolver: zodResolver(moveSchema((k) => tv(k))),
    defaultValues: { toStageId: "new_contact", nextAction: "", nextActionAt: "" },
  });

  React.useEffect(() => {
    if (open && opportunity && toStageId) {
      reset({
        toStageId,
        nextAction: opportunity.nextAction ?? "",
        nextActionAt: opportunity.nextActionAt ?? "",
      });
    }
  }, [open, opportunity, toStageId, reset]);

  if (!opportunity || !toStageId) return null;

  async function submit(values: MoveFormValues) {
    await onConfirm({
      toStageId: values.toStageId as PipelineStageId,
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
      <DialogContent className="max-w-md p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
              {tStages(opportunity.stageId)}
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="rounded-md bg-signal-muted px-1.5 py-0.5 text-xs font-medium text-signal">
              {tStages(toStageId)}
            </span>
          </DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("nextAction")} required error={errors.nextAction?.message} hint={t("nextActionHint")}>
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("nextAction")}
                placeholder={t("nextActionPlaceholder")}
                autoFocus
              />
            )}
          </CrmField>
          <CrmField label={t("dueDate")} error={errors.nextActionAt?.message}>
            {({ controlProps }) => <Input {...controlProps} {...register("nextActionAt")} type="date" />}
          </CrmField>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("moving") : t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
