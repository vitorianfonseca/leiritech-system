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
import { toast } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  netCapacityHours,
  TEAM_FUNCTIONS,
  TeamError,
  type FunctionCapacityConfig,
  type TeamFunction,
  type UpdateFunctionConfigInput,
} from "@/lib/api/team-types";

export interface CapacityConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configs: FunctionCapacityConfig[];
  onSave: (fn: TeamFunction, input: UpdateFunctionConfigInput) => Promise<void>;
}

interface FormState {
  weeklyCapacityHours: string;
  nonProjectHours: string;
  utilizationTargetPct: string;
  internalCostRate: string; // euros, not cents, in the field
}

function toForm(cfg: FunctionCapacityConfig): FormState {
  return {
    weeklyCapacityHours: String(cfg.weeklyCapacityHours),
    nonProjectHours: String(cfg.nonProjectHours),
    utilizationTargetPct: String(Math.round(cfg.utilizationTarget * 100)),
    internalCostRate: String(Math.round(cfg.internalCostRateCents / 100)),
  };
}

/**
 * Admin capacity config (BR-080/081). Per-function weekly capacity, non-project
 * hours, utilization target and internal cost rate. This is the inline editor
 * while Settings (#42) is not built; the same `teamApi.updateFunctionConfig`
 * call will back the `/settings/capacity` + `/settings/costs` sections. Cost
 * rates are Admin-only (BR-069) — this dialog is never reachable by a Membro.
 */
export function CapacityConfigDialog({
  open,
  onOpenChange,
  configs,
  onSave,
}: CapacityConfigDialogProps) {
  const t = useTranslations("team.capacity");
  const tErr = useTranslations("team.capacity.errors");
  const tf = useTranslations("team.heatmap.function");

  const [selected, setSelected] = React.useState<TeamFunction>("engineering");
  const [form, setForm] = React.useState<FormState>(() =>
    toForm(configs.find((c) => c.function === "engineering") ?? configs[0])
  );
  const [pending, setPending] = React.useState(false);

  const capId = React.useId();
  const nonProjectId = React.useId();
  const targetId = React.useId();
  const costId = React.useId();

  // Reset the form whenever the dialog opens or the selected function changes
  // (render-phase pattern, matching the manual-entry dialog).
  const [wasOpen, setWasOpen] = React.useState(open);
  const [prevSelected, setPrevSelected] = React.useState(selected);
  if (open !== wasOpen || selected !== prevSelected) {
    setWasOpen(open);
    setPrevSelected(selected);
    if (open) {
      const cfg = configs.find((c) => c.function === selected);
      if (cfg) setForm(toForm(cfg));
    }
  }

  const cap = Number(form.weeklyCapacityHours);
  const nonProject = Number(form.nonProjectHours);
  const targetPct = Number(form.utilizationTargetPct);

  const errors = React.useMemo(() => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!(cap > 0 && cap <= 168)) e.weeklyCapacityHours = "capacityRange";
    if (!(nonProject >= 0 && nonProject < cap)) e.nonProjectHours = "nonProjectRange";
    if (!(targetPct > 0 && targetPct <= 100)) e.utilizationTargetPct = "targetRange";
    if (!(Number(form.internalCostRate) >= 0)) e.internalCostRate = "costRange";
    return e;
  }, [cap, nonProject, targetPct, form.internalCostRate]);

  const valid = Object.keys(errors).length === 0;
  const previewNet = valid ? netCapacityHours(cap, nonProject, targetPct / 100) : 0;

  const [showErrors, setShowErrors] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!valid) return;
    try {
      setPending(true);
      await onSave(selected, {
        weeklyCapacityHours: cap,
        nonProjectHours: nonProject,
        utilizationTargetPct: targetPct,
        internalCostRateCents: Math.round(Number(form.internalCostRate) * 100),
      });
      toast({ tone: "success", title: t("saved", { fn: tf(selected) }) });
      onOpenChange(false);
    } catch (err) {
      const key = err instanceof TeamError && err.detailKey ? err.detailKey : "saveFailed";
      toast({ tone: "destructive", title: tErr("saveFailed"), description: tryT(tErr, key) });
    } finally {
      setPending(false);
    }
  }

  function field(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setShowErrors(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg p-6">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </div>

        {/* Function picker */}
        <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label={t("functionLabel")}>
          {TEAM_FUNCTIONS.map((fn) => {
            const active = fn === selected;
            return (
              <button
                key={fn}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(fn)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-gold bg-gold-muted text-gold"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {tf(fn)}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={capId}>{t("fields.weeklyCapacity")}</Label>
              <Input
                id={capId}
                type="number"
                inputMode="numeric"
                min={1}
                max={168}
                value={form.weeklyCapacityHours}
                onChange={(e) => field("weeklyCapacityHours", e.target.value)}
                aria-invalid={showErrors && Boolean(errors.weeklyCapacityHours)}
              />
              {showErrors && errors.weeklyCapacityHours ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(errors.weeklyCapacityHours)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={nonProjectId}>{t("fields.nonProject")}</Label>
              <Input
                id={nonProjectId}
                type="number"
                inputMode="numeric"
                min={0}
                value={form.nonProjectHours}
                onChange={(e) => field("nonProjectHours", e.target.value)}
                aria-invalid={showErrors && Boolean(errors.nonProjectHours)}
              />
              {showErrors && errors.nonProjectHours ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(errors.nonProjectHours)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={targetId}>{t("fields.target")}</Label>
              <Input
                id={targetId}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={form.utilizationTargetPct}
                onChange={(e) => field("utilizationTargetPct", e.target.value)}
                aria-invalid={showErrors && Boolean(errors.utilizationTargetPct)}
              />
              {showErrors && errors.utilizationTargetPct ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(errors.utilizationTargetPct)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={costId}>{t("fields.costRate")}</Label>
              <Input
                id={costId}
                type="number"
                inputMode="numeric"
                min={0}
                value={form.internalCostRate}
                onChange={(e) => field("internalCostRate", e.target.value)}
                aria-invalid={showErrors && Boolean(errors.internalCostRate)}
              />
              {showErrors && errors.internalCostRate ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(errors.internalCostRate)}
                </p>
              ) : null}
            </div>
          </div>

          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
            {t("netPreview", { hours: Math.round(previewNet * 10) / 10 })}
          </p>

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
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function tryT(t: (key: string) => string, key: string): string {
  try {
    return t(key);
  } catch {
    return t("saveFailed");
  }
}
