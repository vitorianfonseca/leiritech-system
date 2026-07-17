"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHART_FILL_OPACITY } from "@/lib/chart-style";
import type { FinancialSummary } from "@/lib/api/finance-types";
import { formatEUR, formatPercent } from "./finance-format";

export interface MarginCardProps {
  summary: FinancialSummary;
  loading?: boolean;
  className?: string;
}

/**
 * Live project margin (BR-065): contracted − costs − time cost. Renders the
 * composition as a Recharts horizontal bar plus an itemized breakdown. Reusable
 * by the projects Financeiro tab (#32). Health is read via icon + label +
 * token colour (never colour alone).
 */
export function MarginCard({ summary, loading = false, className }: MarginCardProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const positive = summary.marginCents >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  const chartData = React.useMemo(
    () => [
      { key: "contracted", value: summary.contractedCents, fill: "var(--chart-1)" },
      { key: "costs", value: summary.costsCents, fill: "var(--chart-5)" },
      { key: "timeCost", value: summary.timeCostCents, fill: "var(--chart-4)" },
      {
        key: "margin",
        value: Math.max(0, summary.marginCents),
        fill: positive ? "var(--chart-3)" : "var(--chart-5)",
      },
    ],
    [summary, positive]
  );

  const breakdown: Array<{ key: string; cents: number; sign: "plus" | "minus" | "result" }> = [
    { key: "contracted", cents: summary.contractedCents, sign: "plus" },
    { key: "costs", cents: summary.costsCents, sign: "minus" },
    { key: "timeCost", cents: summary.timeCostCents, sign: "minus" },
    { key: "margin", cents: summary.marginCents, sign: "result" },
  ];

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("margin.title")}</CardTitle>
            <CardDescription>{t("margin.subtitle")}</CardDescription>
          </div>
          <Badge variant={positive ? "healthy" : "overdue"}>
            <Icon aria-hidden />
            {loading ? "…" : formatPercent(summary.marginRatio, locale)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("margin.liveLabel")}
          </p>
          {loading ? (
            <div className="mt-1 h-9 w-40 animate-pulse rounded-md bg-muted" />
          ) : (
            <p
              className={cn(
                "font-heading text-3xl font-semibold tracking-tight tabular-nums",
                positive ? "text-health-healthy" : "text-status-overdue"
              )}
            >
              {formatEUR(summary.marginCents, locale)}
            </p>
          )}
        </div>

        {!loading && (
          <div className="h-[132px] w-full" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="key"
                  width={92}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(k: string) => t(`margin.items.${k}`)}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)" }}
                  formatter={(value) => formatEUR(Number(value), locale)}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => t(`margin.items.${String(label)}`)}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16} fillOpacity={CHART_FILL_OPACITY}>
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <dl className="space-y-2 border-t border-border pt-4 text-sm">
          {breakdown.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4">
              <dt
                className={cn(
                  item.sign === "result"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {t(`margin.items.${item.key}`)}
              </dt>
              <dd
                className={cn(
                  "tabular-nums",
                  item.sign === "result" && "font-semibold",
                  item.sign === "minus" && "text-muted-foreground",
                  item.sign === "result" &&
                    (positive ? "text-health-healthy" : "text-status-overdue")
                )}
              >
                {loading ? (
                  <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  <>
                    {item.sign === "minus" ? "− " : ""}
                    {formatEUR(item.cents, locale)}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
