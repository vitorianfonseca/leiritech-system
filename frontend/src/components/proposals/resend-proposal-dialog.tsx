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
import {
  resendProposalSchema,
  type ResendProposalFormValues,
} from "@/lib/validation/proposal-schemas";
import type { Proposal, ResendProposalInput } from "@/lib/api/proposals-types";

export interface ResendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  onConfirm: (input: ResendProposalInput) => Promise<void>;
}

/**
 * Reissue an expired proposal (§1.2: `expired → sent`). A new validity date is
 * mandatory — reissuing without extending the deadline would immediately
 * auto-expire again (BR-027).
 */
export function ResendProposalDialog({
  open,
  onOpenChange,
  proposal,
  onConfirm,
}: ResendProposalDialogProps) {
  const t = useTranslations("proposals.resend");
  const tv = useTranslations("proposals.validation");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResendProposalFormValues>({
    resolver: zodResolver(resendProposalSchema((k) => tv(k))),
    defaultValues: { validUntil: "" },
  });

  React.useEffect(() => {
    if (open) reset({ validUntil: "" });
  }, [open, reset]);

  async function submit(values: ResendProposalFormValues) {
    await onConfirm({ validUntil: values.validUntil });
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
          <DialogDescription>{t("subtitle", { reference: proposal.reference })}</DialogDescription>
        </div>

        <form noValidate onSubmit={handleSubmit(submit)} className="mt-5 flex flex-col gap-4">
          <CrmField label={t("validUntil")} required error={errors.validUntil?.message} hint={t("validUntilHint")}>
            {({ controlProps }) => (
              <Input {...controlProps} {...register("validUntil")} type="date" autoFocus />
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
