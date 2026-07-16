"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, TriangleAlert, OctagonAlert, Sparkles, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ProjectHealth } from "@/lib/api/projects-types";

const OPTIONS: { value: ProjectHealth; icon: LucideIcon; tone: string; ring: string }[] = [
  { value: "healthy", icon: CircleCheck, tone: "text-health-healthy", ring: "data-[selected=true]:border-health-healthy data-[selected=true]:bg-health-healthy-bg" },
  { value: "attention", icon: TriangleAlert, tone: "text-health-attention", ring: "data-[selected=true]:border-health-attention data-[selected=true]:bg-health-attention-bg" },
  { value: "at_risk", icon: OctagonAlert, tone: "text-health-at-risk", ring: "data-[selected=true]:border-health-at-risk data-[selected=true]:bg-health-at-risk-bg" },
];

export interface HealthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggested: ProjectHealth;
  published: ProjectHealth | null;
  onConfirm: (health: ProjectHealth, reason: string) => Promise<void>;
}

/**
 * Publish or override project health (§1.4). The system never publishes on the
 * human's behalf (BR-030) — the user picks. When the pick differs from the
 * daily `suggested_health`, an override reason is mandatory (BR-031).
 */
export function HealthDialog({
  open,
  onOpenChange,
  suggested,
  published,
  onConfirm,
}: HealthDialogProps) {
  const t = useTranslations("projects.healthDialog");
  const tHealth = useTranslations("projects.health");

  const [selected, setSelected] = React.useState<ProjectHealth>(published ?? suggested);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset the form when the dialog opens (render-time "adjust state on prop change").
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected(published ?? suggested);
      setReason("");
      setError(null);
    }
  }

  const differs = selected !== suggested;

  async function submit() {
    if (differs && reason.trim().length < 5) {
      setError(t("reasonRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(selected, differs ? reason.trim() : "");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <Sparkles className="size-4 shrink-0 text-gold" strokeWidth={1.8} aria-hidden />
            <span className="text-muted-foreground">
              {t("suggestion", { health: tHealth(suggested) })}
            </span>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("pickLabel")}</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("pickLabel")}>
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSel = selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSel}
                    data-selected={isSel}
                    onClick={() => setSelected(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-xs font-medium outline-none transition-colors",
                      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      opt.ring
                    )}
                  >
                    <Icon className={cn("size-5", opt.tone)} strokeWidth={1.8} aria-hidden />
                    {tHealth(opt.value)}
                    {opt.value === suggested ? (
                      <span className="text-[0.625rem] text-muted-foreground">{t("suggestedTag")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {differs ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="health-reason">
                {t("reasonLabel")}
                <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <textarea
                id="health-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
                rows={3}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "health-reason-error" : undefined}
                placeholder={t("reasonPlaceholder")}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
              />
              {error ? (
                <p id="health-reason-error" role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("acceptHint")}</p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" size="lg" disabled={submitting} onClick={submit}>
            {submitting ? t("saving") : differs ? t("override") : t("accept")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
