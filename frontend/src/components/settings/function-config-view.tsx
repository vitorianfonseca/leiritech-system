"use client";

import * as React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, TriangleAlert, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, SkeletonList, toast } from "@/components/shared";
import { teamApi } from "@/lib/api/team";
import {
  TEAM_FUNCTIONS,
  netCapacityHours,
  TeamError,
  type FunctionCapacityConfig,
  type TeamFunction,
} from "@/lib/api/team-types";
import type { Role } from "@/lib/session";

export type FunctionConfigMode = "capacity" | "costs";

export interface FunctionConfigViewProps {
  role: Role;
  mode: FunctionConfigMode;
}

interface RowDraft {
  weeklyCapacityHours: string;
  nonProjectHours: string;
  utilizationTargetPct: string;
  internalCostRate: string; // euros
}

const CONFIG_KEY = ["settings-function-config"] as const;

function toDraft(cfg: FunctionCapacityConfig): RowDraft {
  return {
    weeklyCapacityHours: String(cfg.weeklyCapacityHours),
    nonProjectHours: String(cfg.nonProjectHours),
    utilizationTargetPct: String(Math.round(cfg.utilizationTarget * 100)),
    internalCostRate: String(Math.round(cfg.internalCostRateCents / 100)),
  };
}

/**
 * Per-function capacity / internal cost editor. Both /settings/capacity and
 * /settings/costs render this against the SINGLE SOURCE `teamApi` (#37) — the
 * only difference is which fields are editable. Cost rates are Admin-only
 * (BR-069); capacity targets are Admin-only (BR-081).
 */
export function FunctionConfigView({ role, mode }: FunctionConfigViewProps) {
  const t = useTranslations(mode === "capacity" ? "settings.capacity" : "settings.costs");
  const tf = useTranslations("team.heatmap.function");
  const tCommonErr = useTranslations("team.capacity.errors");
  const format = useFormatter();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [...CONFIG_KEY, role],
    queryFn: () => teamApi.getFunctionConfigs(role),
  });

  const configs = React.useMemo(() => query.data ?? [], [query.data]);
  const [drafts, setDrafts] = React.useState<Record<string, RowDraft>>({});
  const [savingFn, setSavingFn] = React.useState<TeamFunction | null>(null);

  // Seed drafts when configs load.
  const [syncedFrom, setSyncedFrom] = React.useState<FunctionCapacityConfig[] | null>(null);
  if (query.data && query.data !== syncedFrom) {
    setSyncedFrom(query.data);
    const next: Record<string, RowDraft> = {};
    for (const cfg of query.data) next[cfg.function] = toDraft(cfg);
    setDrafts(next);
  }

  function setField(fn: TeamFunction, key: keyof RowDraft, value: string) {
    setDrafts((prev) => ({ ...prev, [fn]: { ...prev[fn], [key]: value } }));
  }

  function rowErrors(draft: RowDraft): Partial<Record<keyof RowDraft, string>> {
    const cap = Number(draft.weeklyCapacityHours);
    const nonProject = Number(draft.nonProjectHours);
    const targetPct = Number(draft.utilizationTargetPct);
    const cost = Number(draft.internalCostRate);
    const e: Partial<Record<keyof RowDraft, string>> = {};
    if (!(cap > 0 && cap <= 168)) e.weeklyCapacityHours = "capacityRange";
    if (!(nonProject >= 0 && nonProject < cap)) e.nonProjectHours = "nonProjectRange";
    if (!(targetPct > 0 && targetPct <= 100)) e.utilizationTargetPct = "targetRange";
    if (!(cost >= 0)) e.internalCostRate = "costRange";
    return e;
  }

  function isDirty(cfg: FunctionCapacityConfig, draft: RowDraft): boolean {
    return JSON.stringify(toDraft(cfg)) !== JSON.stringify(draft);
  }

  async function save(cfg: FunctionCapacityConfig) {
    const draft = drafts[cfg.function];
    if (!draft) return;
    if (Object.keys(rowErrors(draft)).length > 0) return;
    try {
      setSavingFn(cfg.function);
      await teamApi.updateFunctionConfig(role, cfg.function, {
        weeklyCapacityHours: Number(draft.weeklyCapacityHours),
        nonProjectHours: Number(draft.nonProjectHours),
        utilizationTargetPct: Number(draft.utilizationTargetPct),
        internalCostRateCents: Math.round(Number(draft.internalCostRate) * 100),
      });
      await qc.invalidateQueries({ queryKey: CONFIG_KEY });
      // Keep the team workload view consistent (shared source).
      qc.invalidateQueries({ queryKey: ["team-workload"] });
      toast({ tone: "success", title: t("saved", { fn: tf(cfg.function) }) });
    } catch (err) {
      const key = err instanceof TeamError && err.detailKey ? err.detailKey : "saveFailed";
      toast({ tone: "destructive", title: t("saveFailed"), description: safe(tCommonErr, key) });
    } finally {
      setSavingFn(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        <p>{t("notice")}</p>
      </div>

      {query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => query.refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      ) : query.isLoading ? (
        <SkeletonList rows={5} media={false} />
      ) : (
        <div className="space-y-3">
          {TEAM_FUNCTIONS.map((fn) => {
            const cfg = configs.find((c) => c.function === fn);
            const draft = drafts[fn];
            if (!cfg || !draft) return null;
            const errors = rowErrors(draft);
            const dirty = isDirty(cfg, draft);
            const net = netCapacityHours(
              Number(draft.weeklyCapacityHours),
              Number(draft.nonProjectHours),
              Number(draft.utilizationTargetPct) / 100
            );
            const weeklyCost = net * Number(draft.internalCostRate || 0);
            const saving = savingFn === fn;

            return (
              <div
                key={fn}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-heading text-base font-semibold text-foreground">{tf(fn)}</h3>
                  <Button
                    size="sm"
                    onClick={() => save(cfg)}
                    disabled={!dirty || saving || Object.keys(errors).length > 0}
                  >
                    <Save aria-hidden />
                    {saving ? t("saving") : t("save")}
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mode === "capacity" ? (
                    <>
                      <NumberField
                        label={t("fields.weeklyCapacity")}
                        value={draft.weeklyCapacityHours}
                        min={1}
                        max={168}
                        onChange={(v) => setField(fn, "weeklyCapacityHours", v)}
                        error={errors.weeklyCapacityHours && tCommonErr(errors.weeklyCapacityHours)}
                      />
                      <NumberField
                        label={t("fields.nonProject")}
                        value={draft.nonProjectHours}
                        min={0}
                        onChange={(v) => setField(fn, "nonProjectHours", v)}
                        error={errors.nonProjectHours && tCommonErr(errors.nonProjectHours)}
                      />
                      <NumberField
                        label={t("fields.target")}
                        value={draft.utilizationTargetPct}
                        min={1}
                        max={100}
                        suffix="%"
                        onChange={(v) => setField(fn, "utilizationTargetPct", v)}
                        error={errors.utilizationTargetPct && tCommonErr(errors.utilizationTargetPct)}
                      />
                    </>
                  ) : (
                    <>
                      <NumberField
                        label={t("fields.costRate")}
                        value={draft.internalCostRate}
                        min={0}
                        suffix="€/h"
                        onChange={(v) => setField(fn, "internalCostRate", v)}
                        error={errors.internalCostRate && tCommonErr(errors.internalCostRate)}
                      />
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-foreground">{t("fields.netCapacity")}</p>
                        <p className="tabular-nums text-sm text-muted-foreground">
                          {t("hoursValue", { hours: Math.round(net * 10) / 10 })}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <p
                  className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  {mode === "capacity"
                    ? t("netPreview", { hours: Math.round(net * 10) / 10 })
                    : t("weeklyCostPreview", {
                        cost: format.number(Math.round(weeklyCost), {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0,
                        }),
                      })}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  error,
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (value: string) => void;
  error?: string | false;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={suffix ? "pr-10 tabular-nums" : "tabular-nums"}
          aria-invalid={Boolean(error)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function safe(t: (key: string) => string, key: string): string {
  try {
    return t(key);
  } catch {
    return t("saveFailed");
  }
}
