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
import { zodResolver } from "@/lib/form/zod-resolver";
import { companySchema, type CompanyFormValues } from "@/lib/validation/crm-schemas";
import type { CompanyInput, CompanySummary } from "@/lib/api/crm-types";
import {
  CompanyFormFields,
  companyDefaults,
  toCompanyInput,
} from "./company-form-fields";

export interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing company when editing; null for quick-create. */
  company: CompanySummary | { [k: string]: unknown } | null;
  onSubmit: (input: CompanyInput) => Promise<void>;
}

/**
 * Create / edit a company (F4). Client-side validation with visible inline
 * errors; the same field set as the full create page (shared component).
 */
export function CompanyFormDialog({
  open,
  onOpenChange,
  company,
  onSubmit,
}: CompanyFormDialogProps) {
  const t = useTranslations("crm.form");
  const tv = useTranslations("crm.validation");
  const isEdit = company !== null;

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema((k) => tv(k))),
    defaultValues: companyDefaults(),
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  React.useEffect(() => {
    if (!open) return;
    reset(
      companyDefaults(
        (company as unknown as Parameters<typeof companyDefaults>[0]) ?? null
      )
    );
  }, [open, company, reset]);

  async function submit(values: CompanyFormValues) {
    await onSubmit(toCompanyInput(values));
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-6">
        <div className="space-y-1.5">
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CompanyFormFields form={form} />

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : isEdit ? t("saveEdit") : t("saveCreate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
