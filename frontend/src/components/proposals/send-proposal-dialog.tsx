"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, X, Send, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { meetsSendRequirements, type Proposal } from "@/lib/api/proposals-types";
import { formatEUR, formatDate } from "./proposal-format";
import { cn } from "@/lib/utils";

export interface SendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  onConfirm: () => Promise<void>;
}

/**
 * Send a proposal (`draft → sent`). Surfaces the BR-025 prerequisite checklist
 * (PDF attached · value set · validity set) so the requirement is legible before
 * the action; the confirm button stays disabled until all three are met, and the
 * canonical pt-PT guard message is shown when they are not.
 */
export function SendProposalDialog({
  open,
  onOpenChange,
  proposal,
  onConfirm,
}: SendProposalDialogProps) {
  const t = useTranslations("proposals.send");
  const tErr = useTranslations("proposals.errors");
  const locale = useLocale();
  const [pending, setPending] = React.useState(false);

  const checks = [
    { key: "pdf", met: proposal.file != null, value: proposal.file?.name ?? null },
    {
      key: "value",
      met: proposal.valueCents != null,
      value: proposal.valueCents != null ? formatEUR(proposal.valueCents, locale) : null,
    },
    {
      key: "validUntil",
      met: proposal.validUntil != null,
      value: proposal.validUntil ? formatDate(proposal.validUntil) : null,
    },
  ] as const;

  const ready = meetsSendRequirements(proposal);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle", { reference: proposal.reference })}</DialogDescription>
        </div>

        <ul className="mt-4 space-y-2">
          {checks.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    c.met ? "bg-success-muted text-success" : "bg-destructive-muted text-destructive"
                  )}
                >
                  {c.met ? (
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                  )}
                </span>
                {t(`checks.${c.key}`)}
              </span>
              {c.value ? (
                <span className="truncate text-xs text-muted-foreground" title={c.value}>
                  {c.value}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        {!ready ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {tErr("send_requirements_missing")}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button size="lg" disabled={pending || !ready} onClick={handleConfirm}>
            <Send aria-hidden />
            {pending ? t("sending") : t("confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
