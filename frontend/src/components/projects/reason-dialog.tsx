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
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import { reasonSchema, type ReasonFormValues } from "@/lib/validation/project-schemas";

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  /** "destructive" tints the confirm button. */
  variant?: "default" | "destructive";
  onConfirm: (reason: string) => Promise<void>;
}

/**
 * A focused dialog that captures a mandatory reason before a guarded action
 * (pause / cancel a project, block a phase). The reason is validated (min 5
 * chars) with an i18n message; submitting is disabled while pending.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  variant = "default",
  onConfirm,
}: ReasonDialogProps) {
  const tv = useTranslations("projects.validation");
  const t = useTranslations("projects.actions");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReasonFormValues>({
    resolver: zodResolver(reasonSchema((k) => tv(k))),
    defaultValues: { reason: "" },
  });

  React.useEffect(() => {
    if (open) reset({ reason: "" });
  }, [open, reset]);

  async function submit(values: ReasonFormValues) {
    await onConfirm(values.reason.trim());
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
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </div>
        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={label} required error={errors.reason?.message}>
            {({ controlProps }) => (
              <textarea
                {...controlProps}
                {...register("reason")}
                rows={3}
                placeholder={placeholder}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
              />
            )}
          </CrmField>
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" variant={variant} disabled={isSubmitting}>
              {isSubmitting ? t("saving") : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
