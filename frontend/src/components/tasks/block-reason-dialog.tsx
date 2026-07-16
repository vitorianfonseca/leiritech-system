"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface BlockReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string | null;
  /** Called with the captured reason; may be async. */
  onConfirm: (reason: string) => void | Promise<void>;
}

/**
 * Captures the mandatory blocker reason before a task moves to `blocked`
 * (BR-046 — a blocked task must surface WHY). Prevents an empty reason.
 */
export function BlockReasonDialog({
  open,
  onOpenChange,
  taskTitle,
  onConfirm,
}: BlockReasonDialogProps) {
  const t = useTranslations("tasks");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const fieldId = React.useId();

  // Reset the field each time the dialog opens (adjust state on prop change —
  // done during render, not in an effect, per the React docs pattern).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      setError(false);
    }
  }

  async function handleConfirm() {
    if (!reason.trim()) {
      setError(true);
      return;
    }
    try {
      setPending(true);
      await onConfirm(reason.trim());
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
        <div className="flex gap-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-status-blocked-bg text-status-blocked">
            <Ban className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <DialogTitle>{t("block.title")}</DialogTitle>
            <DialogDescription>
              {taskTitle
                ? t("block.description", { task: taskTitle })
                : t("block.descriptionGeneric")}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor={fieldId}>{t("block.reasonLabel")}</Label>
          <textarea
            id={fieldId}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(false);
            }}
            rows={3}
            autoFocus
            aria-invalid={error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            placeholder={t("block.reasonPlaceholder")}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
          />
          {error ? (
            <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive">
              {t("block.reasonRequired")}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("block.cancel")}
          </Button>
          <Button size="lg" disabled={pending} onClick={handleConfirm}>
            {pending ? t("block.processing") : t("block.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
