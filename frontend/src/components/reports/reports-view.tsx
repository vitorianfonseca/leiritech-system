"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, SkeletonCard } from "@/components/shared";
import { cn } from "@/lib/utils";
import { reportsApi } from "@/lib/api/reports";
import {
  EMPTY_FILTERS,
  REPORT_GROUPS,
  type ReportContext,
  type ReportFilters,
  type ReportGroupKey,
} from "@/lib/api/reports-types";
import type { Role } from "@/lib/session";
import { filterDataset } from "./report-compute";
import { ReportFiltersBar } from "./report-filters";
import { ComercialReports } from "./comercial-reports";
import { ProjetosReports } from "./projetos-reports";
import { EquipaReports } from "./equipa-reports";
import { FinanceiroReports } from "./financeiro-reports";

export interface ReportsViewProps {
  user: { id: string; role: Role; paymentsGrant: boolean };
}

export function ReportsView({ user }: ReportsViewProps) {
  const t = useTranslations("reports");

  const ctx = React.useMemo<ReportContext>(
    () => ({ role: user.role, userId: user.id, paymentsGrant: user.paymentsGrant }),
    [user.id, user.role, user.paymentsGrant]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["reports", ctx.role, ctx.userId, ctx.paymentsGrant] as const,
    queryFn: () => reportsApi.getDataset(ctx),
  });

  const [filters, setFilters] = React.useState<ReportFilters>(EMPTY_FILTERS);
  const patchFilters = React.useCallback(
    (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch })),
    []
  );
  const clearFilters = React.useCallback(() => setFilters(EMPTY_FILTERS), []);

  // Groups the caller may actually see (BR-002 / BR-008).
  const groups = React.useMemo<ReportGroupKey[]>(() => {
    if (!data) return [];
    return REPORT_GROUPS.filter((g) => {
      if (g === "comercial") return data.canComercial;
      if (g === "financeiro") return data.canFinance;
      return true; // projetos + equipa: all roles
    });
  }, [data]);

  const [active, setActive] = React.useState<ReportGroupKey>("projetos");
  // Derive the effective tab so a group the caller may not see never renders,
  // without a setState-in-effect (falls back to the first visible group).
  const activeTab: ReportGroupKey =
    groups.includes(active) ? active : (groups[0] ?? "projetos");

  const filtered = React.useMemo(
    () => (data ? filterDataset(data, filters) : null),
    [data, filters]
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t("refresh")}
          >
            <RefreshCw aria-hidden className={cn(isFetching && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          <SkeletonCard />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      ) : isError || !data || !filtered ? (
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t("empty.noGroupsTitle")}
          description={t("empty.noGroupsDescription")}
        />
      ) : (
        <>
          {/* Group tabs */}
          <div
            role="tablist"
            aria-label={t("tabsAriaLabel")}
            className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1"
          >
            {groups.map((g) => {
              const selected = g === activeTab;
              return (
                <button
                  key={g}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  id={`report-tab-${g}`}
                  aria-controls={`report-panel-${g}`}
                  onClick={() => setActive(g)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`groups.${g}`)}
                </button>
              );
            })}
          </div>

          <ReportFiltersBar
            value={filters}
            onChange={patchFilters}
            onClear={clearFilters}
            options={data.filterOptions}
          />

          <div
            role="tabpanel"
            id={`report-panel-${activeTab}`}
            aria-labelledby={`report-tab-${activeTab}`}
          >
            {activeTab === "comercial" ? <ComercialReports data={filtered} /> : null}
            {activeTab === "projetos" ? <ProjetosReports data={filtered} /> : null}
            {activeTab === "equipa" ? <EquipaReports data={filtered} /> : null}
            {activeTab === "financeiro" ? <FinanceiroReports data={filtered} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
