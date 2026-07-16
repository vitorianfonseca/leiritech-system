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
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import { loseSchema, type LoseFormValues } from "@/lib/validation/opportunity-schemas";
import {
  LOST_REASONS,
  type LoseOpportunityInput,
  type LostReason,
  type Opportunity,
} from "@/lib/api/opportunities-types";

const TEXTAREA_CLASS =
  "flex w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export interface LostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  onConfirm: (input: LoseOpportunityInput) => Promise<void>;
}

/** Mark an opportunity lost. A reason is MANDATORY (BR-011); note optional. */
export function LostDialog({ open, onOpenChange, opportunity, onConfirm }: LostDialogProps) {
  const t = useTranslations("pipeline.lost");
  const tReason = useTranslations("pipeline.lostReasons");
  const tv = useTranslations("pipeline.validation");

  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LoseFormValues>({
    resolver: zodResolver(loseSchema((k) => tv(k))),
    defaultValues: { reason: "" as unknown as LostReason, note: "" },
  });

  React.useEffect(() => {
    register("reason");
  }, [register]);

  React.useEffect(() => {
    if (open) reset({ reason: "" as unknown as LostReason, note: "" });
  }, [open, reset]);

  const reason = useWatch({ control, name: "reason" });

  if (!opportunity) return null;

  const reasonOptions: ComboboxItem[] = LOST_REASONS.map((r) => ({ value: r, label: tReason(r) }));

  async function submit(values: LoseFormValues) {
    await onConfirm({
      reason: values.reason as LostReason,
      note: values.note?.trim() ? values.note.trim() : null,
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
          <DialogDescription>{t("subtitle", { title: opportunity.title })}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("reason")} required error={errors.reason?.message}>
            {({ controlProps }) => (
              <SearchableCombobox
                id={controlProps.id}
                aria-label={t("reason")}
                items={reasonOptions}
                value={(reason as string) || null}
                clearable={false}
                placeholder={t("reasonPlaceholder")}
                onValueChange={(v) =>
                  setValue("reason", (v ?? "") as LostReason, { shouldValidate: true })
                }
              />
            )}
          </CrmField>
          <CrmField label={t("note")} error={errors.note?.message}>
            {({ controlProps }) => (
              <textarea
                {...controlProps}
                {...register("note")}
                rows={3}
                placeholder={t("notePlaceholder")}
                className={TEXTAREA_CLASS}
              />
            )}
          </CrmField>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
