"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TriangleAlert,
  SlidersHorizontal,
  LayoutGrid,
  Table2,
  CalendarDays,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, AnimatedCounter } from "@/components/shared";
import { cn } from "@/lib/utils";
import { teamApi } from "@/lib/api/team";
import {
  canConfigureCapacity,
  type TeamFunction,
  type UpdateFunctionConfigInput,
} from "@/lib/api/team-types";
import type { Role } from "@/lib/session";
import { WorkloadHeatmap } from "./workload-heatmap";
import { TeamTable } from "./team-table";
import { CapacityConfigDialog } from "./capacity-config-dialog";

export interface TeamViewProps {
  user: { id: string; name: string; role: Role; avatarUrl: string | null };
}

type ViewMode = "heatmap" | "table";

/** Team & workload workspace (F13 / issue #37). */
export function TeamView({ user }: TeamViewProps) {
  const t = useTranslations("team");
  const tErr = useTranslations("team.errors");
  const qc = useQueryClient();
  const { id: userId, role } = user;
  const canConfig = canConfigureCapacity(role);

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [view, setView] = React.useState<ViewMode>("heatmap");
  const [configOpen, setConfigOpen] = React.useState(false);

  const workloadQuery = useQuery({
    queryKey: ["team-workload", userId, role, weekOffset] as const,
    queryFn: () => teamApi.getTeamWorkload(role, userId, weekOffset),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["team-workload"] });
  }, [qc]);

  const handleSaveConfig = React.useCallback(
    async (fn: TeamFunction, input: UpdateFunctionConfigInput) => {
      await teamApi.updateFunctionConfig(role, fn, input);
      refresh();
    },
    [role, refresh]
  );

  const data = workloadQuery.data;
  const members = data?.members ?? [];
  const ownOnly = data?.ownOnly ?? false;
  const configs = data?.configs ?? null;
  const loading = workloadQuery.isLoading;

  // Summary metrics (BR-082/084) — hidden in the own-only Membro view.
  const summary = React.useMemo(() => {
    const rows = data?.members ?? [];
    const overloaded = rows.filter((m) => m.availability === "sobrecarregado").length;
    const available = rows.filter((m) => m.availability === "disponivel").length;
    const away = rows.filter((m) => m.availability === "ausente").length;
    const active = rows.filter((m) => m.availability !== "ausente");
    const avgUtil =
      active.length > 0
        ? Math.round(
            (active.reduce((s, m) => s + m.utilizationRatio, 0) / active.length) * 100
          )
        : 0;
    return { total: rows.length, overloaded, available, away, avgUtil };
  }, [data]);

  const weekLabel = React.useMemo(() => {
    if (weekOffset === 0) return t("week.current");
    if (weekOffset === -1) return t("week.previous");
    if (weekOffset === 1) return t("week.next");
    return t(weekOffset < 0 ? "week.weeksAgo" : "week.weeksAhead", {
      n: Math.abs(weekOffset),
    });
  }, [weekOffset, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={ownOnly ? t("subtitleOwn") : t("subtitle")}
        actions={
          canConfig ? (
            <Button
              variant="outline"
              onClick={() => setConfigOpen(true)}
              disabled={!configs}
            >
              <SlidersHorizontal aria-hidden />
              <span className="hidden sm:inline">{t("capacity.open")}</span>
              <span className="sm:hidden">{t("capacity.openShort")}</span>
            </Button>
          ) : null
        }
      />

      {ownOnly ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
          <p>{t("ownNotice")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={t("stats.team")} value={summary.total} loading={loading} />
          <StatTile
            label={t("stats.overloaded")}
            value={summary.overloaded}
            loading={loading}
            tone={summary.overloaded > 0 ? "alarm" : "default"}
          />
          <StatTile label={t("stats.available")} value={summary.available} loading={loading} tone="good" />
          <StatTile
            label={t("stats.avgUtil")}
            value={summary.avgUtil}
            loading={loading}
            suffix="%"
          />
        </div>
      )}

      {/* Controls: week switcher + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("week.prev")}
            onClick={() => setWeekOffset((w) => w - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium">
            <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            {weekLabel}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("week.next")}
            onClick={() => setWeekOffset((w) => w + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
          {weekOffset !== 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              {t("week.today")}
            </Button>
          ) : null}
        </div>

        <div role="tablist" aria-label={t("viewLabel")} className="inline-flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {(["heatmap", "table"] as const).map((key) => {
            const active = key === view;
            const Icon = key === "heatmap" ? LayoutGrid : Table2;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                {t(`views.${key}`)}
              </button>
            );
          })}
        </div>
      </div>

      {workloadQuery.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={tErr("loadTitle")}
          description={tErr("loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => workloadQuery.refetch()}>
              <RefreshCw aria-hidden />
              {tErr("retry")}
            </Button>
          }
        />
      ) : loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-card/40" role="status" aria-live="polite">
          <span className="sr-only">{t("loading")}</span>
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          title={t("table.emptyTitle")}
          description={t("table.emptyDescription")}
        />
      ) : view === "heatmap" ? (
        <WorkloadHeatmap members={members} />
      ) : (
        <TeamTable members={members} loading={false} />
      )}

      {canConfig && configs ? (
        <CapacityConfigDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          configs={configs}
          onSave={handleSaveConfig}
        />
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  loading,
  tone = "default",
  suffix,
}: {
  label: string;
  value: number;
  loading?: boolean;
  tone?: "default" | "good" | "alarm";
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p
          className={cn(
            "mt-1 font-heading text-3xl font-semibold tabular-nums",
            tone === "alarm" && value > 0 && "text-status-overdue",
            tone === "good" && "text-health-healthy",
            tone === "default" && "text-foreground"
          )}
        >
          <AnimatedCounter value={value} />
          {suffix ? <span className="text-xl">{suffix}</span> : null}
        </p>
      )}
    </div>
  );
}
