"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeiritechColorToken, Tag } from "@/lib/api/settings-types";
import { ColorPicker, ColorChip } from "./settings-colors";

export interface TagFormValues {
  label: string;
  color: LeiritechColorToken;
}

export interface TagFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing tag when editing; null when creating. */
  tag: Tag | null;
  onSubmit: (values: TagFormValues) => Promise<void>;
  /** Server-side validation message key to surface (e.g. duplicate). */
  serverErrorKey?: string | null;
  onClearServerError?: () => void;
}

export function TagFormDialog({
  open,
  onOpenChange,
  tag,
  onSubmit,
  serverErrorKey,
  onClearServerError,
}: TagFormDialogProps) {
  const t = useTranslations("settings.tags");
  const tErr = useTranslations("settings.tags.errors");
  const labelId = React.useId();

  const [label, setLabel] = React.useState(tag?.label ?? "");
  const [color, setColor] = React.useState<LeiritechColorToken>(tag?.color ?? "signal");
  const [pending, setPending] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  // Reset form on open / target change (render-phase pattern).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLabel(tag?.label ?? "");
      setColor(tag?.color ?? "signal");
      setShowErrors(false);
    }
  }

  const trimmed = label.trim();
  const clientInvalid = trimmed.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (clientInvalid) return;
    try {
      setPending(true);
      await onSubmit({ label: trimmed, color });
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
          <DialogTitle>{tag ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("formDescription")}</DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={labelId}>{t("fields.label")}</Label>
            <Input
              id={labelId}
              value={label}
              maxLength={40}
              autoFocus
              onChange={(e) => {
                setLabel(e.target.value);
                onClearServerError?.();
              }}
              aria-invalid={(showErrors && clientInvalid) || Boolean(serverErrorKey)}
            />
            {showErrors && clientInvalid ? (
              <p role="alert" className="text-xs text-destructive">
                {tErr("labelRequired")}
              </p>
            ) : serverErrorKey ? (
              <p role="alert" className="text-xs text-destructive">
                {tErr(serverErrorKey)}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>{t("fields.color")}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("preview")}</p>
            <ColorChip color={color}>{trimmed || t("previewPlaceholder")}</ColorChip>
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? t("saving") : tag ? t("save") : t("createAction")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
