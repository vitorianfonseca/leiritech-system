"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { CircleDollarSign } from "lucide-react";
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
import {
  recordPaymentSchema,
  centsToEurosInput,
  eurosToCents,
  type RecordPaymentFormValues,
} from "@/lib/validation/finance-schemas";
import type { PaymentMilestone, RecordPaymentInput } from "@/lib/api/finance-types";
import { FinanceField } from "./finance-field";
import { formatEUR } from "./finance-format";

export interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone: PaymentMilestone | null;
  onSubmit: (input: RecordPaymentInput) => Promise<void>;
}

/**
 * Record a received payment against a milestone (F14). This form IS the
 * deliberate confirmation step for a financial write (the primary button reads
 * "Confirmar pagamento"). The amount is capped at the remaining balance. The
 * parent surfaces a Toast + Undo after a successful record (reversible).
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  milestone,
  onSubmit,
}: RecordPaymentDialogProps) {
  const t = useTranslations("finance");
  const tv = useTranslations("finance.validation");
  const locale = useLocale();

  const remainingCents = milestone
    ? Math.max(0, milestone.amountCents - milestone.receivedAmountCents)
    : 0;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentFormValues>({
    resolver: zodResolver(recordPaymentSchema((k) => tv(k), remainingCents)),
    defaultValues: { amount: "", paidDate: "", externalInvoiceRef: "" },
  });

  React.useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    reset({
      amount: centsToEurosInput(remainingCents),
      paidDate: today,
      externalInvoiceRef: milestone?.externalInvoiceRef ?? "",
    });
  }, [open, milestone, remainingCents, reset]);

  async function submit(values: RecordPaymentFormValues) {
    const input: RecordPaymentInput = {
      amountCents: eurosToCents(values.amount),
      paidDate: values.paidDate,
      externalInvoiceRef: values.externalInvoiceRef?.trim()
        ? values.externalInvoiceRef.trim()
        : null,
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
          icon={CircleDollarSign}
          tone="success"
          title={t("recordPayment.title")}
          description={milestone ? milestone.description : undefined}
        />
        <form
          noValidate
          onSubmit={handleSubmit(submit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-4">
          {milestone ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted p-3 text-sm">
              <dt className="text-muted-foreground">{t("recordPayment.amount")}</dt>
              <dd className="text-right tabular-nums font-medium">
                {formatEUR(milestone.amountCents, locale)}
              </dd>
              <dt className="text-muted-foreground">{t("recordPayment.alreadyReceived")}</dt>
              <dd className="text-right tabular-nums">
                {formatEUR(milestone.receivedAmountCents, locale)}
              </dd>
              <dt className="text-muted-foreground">{t("recordPayment.remaining")}</dt>
              <dd className="text-right tabular-nums font-semibold">
                {formatEUR(remainingCents, locale)}
              </dd>
            </dl>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FinanceField
              label={t("recordPayment.amountReceived")}
              error={errors.amount?.message}
            >
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  {...register("amount")}
                  inputMode="decimal"
                  placeholder="0,00"
                  autoFocus
                />
              )}
            </FinanceField>

            <FinanceField
              label={t("recordPayment.paidDate")}
              error={errors.paidDate?.message}
            >
              {({ controlProps }) => (
                <Input {...controlProps} {...register("paidDate")} type="date" />
              )}
            </FinanceField>
          </div>

          <FinanceField
            label={t("form.externalRef")}
            hint={t("form.externalRefHint")}
            error={errors.externalInvoiceRef?.message}
          >
            {({ controlProps }) => (
              <Input
                {...controlProps}
                {...register("externalInvoiceRef")}
                placeholder={t("form.externalRefPlaceholder")}
              />
            )}
          </FinanceField>

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
              {isSubmitting ? t("recordPayment.saving") : t("recordPayment.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
