"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import {
  SmartTable,
  ProgressBar,
  type SmartTableColumn,
} from "@/components/shared";
import { cn } from "@/lib/utils";
import { formatHours } from "./time-format";
import {
  ROLLUP_DIMENSIONS,
  type RollupDimension,
  type RollupRow,
} from "@/lib/api/time-types";

export interface RollupsPanelProps {
  rows: RollupRow[];
  loading?: boolean;
  dimension: RollupDimension;
  onDimensionChange: (dimension: RollupDimension) => void;
}

/**
 * Rollups (F11): time aggregated per task / phase / project / user, split into
 * billable vs non-billable, with an hours-vs-budget bar where a budget applies
 * (project & phase). Over-budget rows read red AND carry an explicit label
 * (never colour alone — WCAG AA).
 */
export function RollupsPanel({
  rows,
  loading,
  dimension,
  onDimensionChange,
}: RollupsPanelProps) {
  const t = useTranslations("time.rollups");
  const locale = useLocale();

  const columns = React.useMemo<SmartTableColumn<RollupRow>[]>(
    () => [
      {
        id: "label",
        header: t("columns.name"),
        accessor: (r) => r.label,
        sortable: true,
        cardPriority: 0,
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {r.label || t("noPhase")}
            </p>
            {r.sublabel ? (
              <p className="truncate text-xs text-muted-foreground">{r.sublabel}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "billable",
        header: t("columns.billable"),
        accessor: (r) => r.billableMinutes,
        sortable: true,
        align: "right",
        cardPriority: 2,
        cell: (r) => (
          <span className="tabular-nums text-success">
            {formatHours(r.billableMinutes, locale)}
          </span>
        ),
      },
      {
        id: "nonBillable",
        header: t("columns.nonBillable"),
        accessor: (r) => r.nonBillableMinutes,
        sortable: true,
        align: "right",
        defaultHidden: false,
        cardPriority: 3,
        cell: (r) => (
          <span className="tabular-nums text-muted-foreground">
            {formatHours(r.nonBillableMinutes, locale)}
          </span>
        ),
      },
      {
        id: "total",
        header: t("columns.total"),
        accessor: (r) => r.totalMinutes,
        sortable: true,
        align: "right",
        cardPriority: 1,
        cell: (r) => (
          <span className="font-medium tabular-nums text-foreground">
            {formatHours(r.totalMinutes, locale)}
          </span>
        ),
      },
      {
        id: "budget",
        header: t("columns.budget"),
        cardPriority: 4,
        className: "min-w-[180px]",
        cell: (r) => <BudgetCell row={r} locale={locale} />,
      },
    ],
    [t, locale]
  );

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("dimensionLabel")}
        className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1"
      >
        {ROLLUP_DIMENSIONS.map((dim) => {
          const active = dim === dimension;
          return (
            <button
              key={dim}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onDimensionChange(dim)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`dimensions.${dim}`)}
            </button>
          );
        })}
      </div>

      <SmartTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        loading={loading}
        searchable={false}
        pageSize={8}
        emptyIcon={BarChart3}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
      />
    </div>
  );
}

function BudgetCell({ row, locale }: { row: RollupRow; locale: string }) {
  const t = useTranslations("time.rollups");
  if (row.budgetHours == null) {
    return <span className="text-sm text-muted-foreground">{t("noBudget")}</span>;
  }
  const usedHours = row.totalMinutes / 60;
  const ratio = usedHours / row.budgetHours;
  const pct = Math.min(100, Math.round(ratio * 100));
  const over = ratio > 1;
  const tone = over ? "destructive" : ratio >= 0.85 ? "warning" : "gold";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">
          {t("budgetValue", {
            used: formatHours(row.totalMinutes, locale),
            budget: row.budgetHours,
          })}
        </span>
        {over ? (
          <span className="shrink-0 rounded-full bg-destructive-muted px-1.5 py-0.5 text-[0.6875rem] font-semibold text-destructive">
            {t("overBudget")}
          </span>
        ) : (
          <span className="shrink-0 tabular-nums font-medium text-foreground">
            {Math.round(ratio * 100)}%
          </span>
        )}
      </div>
      <ProgressBar
        value={pct}
        tone={tone}
        size="sm"
        aria-label={t("budgetBarLabel", { name: row.label })}
      />
    </div>
  );
}
