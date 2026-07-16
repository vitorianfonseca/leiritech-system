"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Confirm button label; defaults per variant. */
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /**
   * Action to run on confirm. May be async — the dialog shows a pending state
   * and closes on success. Throwing keeps the dialog open so callers can
   * surface an error.
   */
  onConfirm: () => void | Promise<void>;
  /** Extra content between the description and the actions. */
  children?: React.ReactNode;
}

/**
 * Destructive-action confirmation. Focus trap + Escape-to-cancel come from the
 * base-ui Dialog. Confirm button reflects the variant (destructive = red) and
 * an async `onConfirm` disables the buttons while pending.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const t = useTranslations("shared.confirm");
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    try {
      setPending(true);
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
        <div className="flex gap-4">
          {variant === "destructive" ? (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive-muted text-destructive">
              <AlertTriangle className="size-5" strokeWidth={1.8} aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <DialogTitle>{title ?? t("defaultTitle")}</DialogTitle>
            <DialogDescription>{description ?? t("defaultDescription")}</DialogDescription>
            {children ? <div className="pt-2">{children}</div> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            size="lg"
            disabled={pending}
            onClick={handleConfirm}
            className={cn(variant === "destructive" && "font-medium")}
          >
            {pending ? t("processing") : confirmLabel ?? t("confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Convenience hook for imperative confirm flows. Returns dialog props plus a
 * `confirm(action)` helper that opens the dialog and wires the callback.
 */
export function useConfirmDialog() {
  const [open, setOpen] = React.useState(false);
  const actionRef = React.useRef<(() => void | Promise<void>) | null>(null);

  const confirm = React.useCallback((action: () => void | Promise<void>) => {
    actionRef.current = action;
    setOpen(true);
  }, []);

  const onConfirm = React.useCallback(async () => {
    await actionRef.current?.();
  }, []);

  return { open, onOpenChange: setOpen, confirm, onConfirm };
}
