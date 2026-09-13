"use client";

import * as React from "react";
import { Layers } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@/lib/form/zod-resolver";
import { phaseSchema, type PhaseFormValues } from "@/lib/validation/template-schemas";
import type { PhaseInput, TemplatePhase } from "@/lib/api/template-types";
import { TemplateField } from "./template-field";

export interface PhaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing phase when editing; null when adding. */
  phase: TemplatePhase | null;
  onSubmit: (input: PhaseInput) => Promise<void>;
}

/** Add / edit a template phase (name, expected duration, milestone flag). */
export function PhaseFormDialog({ open, onOpenChange, phase, onSubmit }: PhaseFormDialogProps) {
  const t = useTranslations("templates");
  const tv = useTranslations("templates.validation");
  const isEdit = phase !== null;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseSchema((k) => tv(k))),
    defaultValues: {
      name: "",
      expectedDurationDays: "5",
      isMilestone: false,
      milestoneName: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({
      name: phase?.name ?? "",
      expectedDurationDays: String(phase?.expectedDurationDays ?? 5),
      isMilestone: phase?.isMilestone ?? false,
      milestoneName: phase?.milestoneName ?? "",
    });
  }, [open, phase, reset]);

  const isMilestone = useWatch({ control, name: "isMilestone" });

  async function submit(values: PhaseFormValues) {
    const input: PhaseInput = {
      name: values.name.trim(),
      expectedDurationDays: Number(values.expectedDurationDays),
      isMilestone: values.isMilestone,
      milestoneName: values.isMilestone ? (values.milestoneName?.trim() ?? "") : null,
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
      <DialogContent className="max-w-md">
        <DialogHeader
          icon={Layers}
          title={isEdit ? t("phaseForm.editTitle") : t("phaseForm.addTitle")}
          description={t("phaseForm.subtitle")}
        />
        <form noValidate onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <TemplateField label={t("phaseForm.name")} required error={errors.name?.message}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("name")}
                  placeholder={t("phaseForm.namePlaceholder")}
                  autoFocus
                />
              )}
            </TemplateField>

            <TemplateField
              label={t("phaseForm.expectedDuration")}
              error={errors.expectedDurationDays?.message}
            >
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("expectedDurationDays")}
                  inputMode="numeric"
                  placeholder="5"
                />
              )}
            </TemplateField>

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                {...register("isMilestone")}
                className="size-4 rounded border-input text-signal accent-signal focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span>
                {t("phaseForm.isMilestone")}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t("phaseForm.isMilestoneHint")}
                </span>
              </span>
            </label>

            {isMilestone ? (
              <TemplateField
                label={t("phaseForm.milestoneName")}
                required
                error={errors.milestoneName?.message}
              >
                {({ controlProps }) => (
                  <Input
                    {...controlProps}
                    {...register("milestoneName")}
                    placeholder={t("phaseForm.milestoneNamePlaceholder")}
                  />
                )}
              </TemplateField>
            ) : null}
          </DialogBody>
          <DialogFooter>
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
              {isSubmitting ? t("form.saving") : isEdit ? t("form.saveEdit") : t("phaseForm.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
