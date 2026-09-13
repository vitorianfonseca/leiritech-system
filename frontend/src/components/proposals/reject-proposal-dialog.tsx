"use client";

import * as React from "react";
import { ThumbsDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CrmField } from "@/components/crm/crm-field";
import { zodResolver } from "@/lib/form/zod-resolver";
import {
  rejectProposalSchema,
  type RejectProposalFormValues,
} from "@/lib/validation/proposal-schemas";
import type { Proposal, RejectProposalInput } from "@/lib/api/proposals-types";

export interface RejectProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  onConfirm: (input: RejectProposalInput) => Promise<void>;
}

/**
 * Mark a proposal rejected (§1.2, terminal — BR-026). A rejection note is
 * mandatory so the loss is auditable; the state cannot be flipped back to
 * accepted afterwards (a new proposal must be issued).
 */
export function RejectProposalDialog({
  open,
  onOpenChange,
  proposal,
  onConfirm,
}: RejectProposalDialogProps) {
  const t = useTranslations("proposals.reject");
  const tv = useTranslations("proposals.validation");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RejectProposalFormValues>({
    resolver: zodResolver(rejectProposalSchema((k) => tv(k))),
    defaultValues: { note: "" },
  });

  React.useEffect(() => {
    if (open) reset({ note: "" });
  }, [open, reset]);

  async function submit(values: RejectProposalFormValues) {
    await onConfirm({ note: values.note.trim() });
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
          icon={ThumbsDown}
          tone="danger"
          title={t("title")}
          description={t("subtitle", { reference: proposal.reference })}
        />
        <form noValidate onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <CrmField label={t("note")} required error={errors.note?.message}>
              {({ controlProps }) => (
                <textarea
                  {...controlProps}
                  {...register("note")}
                  rows={3}
                  autoFocus
                  placeholder={t("notePlaceholder")}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
                />
              )}
            </CrmField>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
