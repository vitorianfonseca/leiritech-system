"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Trophy, FolderPlus, CheckCircle2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Opportunity, WinOpportunityResult } from "@/lib/api/opportunities-types";

export interface WonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  onConfirm: (o: Opportunity) => Promise<WinOpportunityResult>;
  /** Whether the #31 conversion route exists yet. When false the CTA is shown
   * but disabled with a tooltip (no dead link / 500). */
  convertAvailable?: boolean;
  onConvert?: (result: WinOpportunityResult) => void;
}

/**
 * "Marcar como ganha": confirmation → subtle success animation. On win the
 * company is marked "cliente ativo" (BR-038) and the deal is offered for
 * conversion to a project (#31). Won is terminal (BR-013).
 */
export function WonDialog({
  open,
  onOpenChange,
  opportunity,
  onConfirm,
  convertAvailable = false,
  onConvert,
}: WonDialogProps) {
  const t = useTranslations("pipeline.won");
  const reduce = useReducedMotion();
  const [phase, setPhase] = React.useState<"confirm" | "success">("confirm");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<WinOpportunityResult | null>(null);

  // Reset to the confirm phase whenever the dialog transitions to open, using
  // the React-recommended "adjust state during render" pattern (no effect).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhase("confirm");
      setResult(null);
      setPending(false);
    }
  }

  if (!opportunity) return null;

  async function confirm() {
    if (!opportunity) return;
    try {
      setPending(true);
      const res = await onConfirm(opportunity);
      setResult(res);
      setPhase("success");
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
      <DialogContent className="max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "confirm" ? (
            <motion.div
              key="confirm"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <DialogHeader
                icon={Trophy}
                tone="success"
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("subtitle", { title: opportunity.title })}
              />
              {!opportunity.proposalSentReached ? (
                <DialogBody>
                  <div
                    role="note"
                    className="flex items-start gap-2 rounded-lg bg-warning-muted px-3 py-2.5 text-xs text-warning"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
                    <span>{t("proposalWarning")}</span>
                  </div>
                </DialogBody>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => onOpenChange(false)}>
                  {t("cancel")}
                </Button>
                <Button type="button" size="lg" disabled={pending} onClick={confirm}>
                  <Trophy aria-hidden />
                  {pending ? t("saving") : t("confirm")}
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <DialogBody className="flex flex-col items-center border-t-0 py-8 text-center">
              <motion.span
                initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 18, delay: 0.05 }}
                className="flex size-16 items-center justify-center rounded-full bg-signal-muted text-signal"
              >
                <Trophy className="size-8" strokeWidth={1.8} aria-hidden />
              </motion.span>

              <DialogTitle className="mt-4">{t("successTitle")}</DialogTitle>
              <DialogDescription className="mt-1">
                {t("successSubtitle", { title: opportunity.title })}
              </DialogDescription>

              {result?.companyActivated ? (
                <div className="mt-4 flex items-center gap-1.5 rounded-full bg-success-muted px-3 py-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="size-4" strokeWidth={1.8} aria-hidden />
                  {t("companyActivated", { name: result.companyName })}
                </div>
              ) : null}

              </DialogBody>
              <DialogFooter className="sm:justify-center">
                <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                  {t("close")}
                </Button>
                {convertAvailable ? (
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => {
                      if (result) onConvert?.(result);
                      onOpenChange(false);
                    }}
                  >
                    <FolderPlus aria-hidden />
                    {t("convert")}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled
                        aria-disabled
                        className="pointer-events-none cursor-not-allowed opacity-60"
                      >
                        <FolderPlus aria-hidden />
                        {t("convert")}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("convertSoon")}</TooltipContent>
                  </Tooltip>
                )}
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
