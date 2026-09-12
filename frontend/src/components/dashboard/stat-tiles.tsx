"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  GitBranch,
  Coins,
  FolderKanban,
  TriangleAlert,
  ListChecks,
  CalendarClock,
  Hourglass,
  Wallet,
  UsersRound,
  ArrowUpRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatEURWhole } from "@/components/finance/finance-format";
import type { DashboardMetric, MetricKey, MetricTone } from "@/lib/api/dashboard-types";

const METRIC_ICON: Record<MetricKey, LucideIcon> = {
  openOpportunities: GitBranch,
  pipelineValue: Coins,
  activeProjects: FolderKanban,
  projectsAtRisk: TriangleAlert,
  overdueTasks: ListChecks,
  deliveriesNext7Days: CalendarClock,
  pendingPayments: Hourglass,
  overduePayments: Wallet,
  teamLoad: UsersRound,
};

const TONE_CHIP: Record<MetricTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  signal: "bg-signal-muted text-signal",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning-foreground",
  destructive: "bg-status-overdue-bg text-status-overdue",
  info: "bg-info-muted text-info",
};

const TONE_VALUE: Record<MetricTone, string> = {
  neutral: "text-foreground",
  signal: "text-foreground",
  success: "text-health-healthy",
  warning: "text-foreground",
  destructive: "text-status-overdue",
  info: "text-foreground",
};

/**
 * Dashboard headline tiles (F2). Values count up via AnimatedCounter (respecting
 * prefers-reduced-motion) and each tile is a link into the underlying list.
 * State is conveyed with icon + label + token colour, never colour alone.
 * Financial tiles are already stripped upstream for unauthorized users (BR-008).
 */
export function StatTiles({
  metrics,
  loading = false,
}: {
  metrics: DashboardMetric[];
  loading?: boolean;
}) {
  const t = useTranslations("dashboard.metrics");
  const locale = useLocale();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
              <div className="size-8 animate-pulse rounded-lg bg-muted" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted/70" />
          </Card>
        ))}
      </div>
    );
  }

  function renderValue(m: DashboardMetric): React.ReactNode {
    switch (m.format) {
      case "currencyCents":
        return (
          <AnimatedCounter value={m.value} format={(n) => formatEURWhole(n, locale)} />
        );
      case "percent":
        return <AnimatedCounter value={m.value} suffix="%" />;
      default:
        return <AnimatedCounter value={m.value} />;
    }
  }

  return (
    // 3-up on ≥sm: every role payload has a count divisible by 3 (9 full / 6
    // finance-gated / 3 scoped-membro), so rows always fill with no dead column.
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {metrics.map((m) => {
        const Icon = METRIC_ICON[m.key];
        return (
          <Card key={m.key} className="p-0">
            <Link
              href={m.href}
              className="group flex h-full flex-col gap-3 rounded-[inherit] p-5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={t(`${m.key}.label`)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`${m.key}.label`)}
                </p>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    TONE_CHIP[m.tone]
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                </span>
              </div>

              <p
                className={cn(
                  "font-heading text-2xl font-semibold tracking-tight tabular-nums md:text-3xl",
                  TONE_VALUE[m.tone]
                )}
              >
                {renderValue(m)}
              </p>

              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {t(`${m.key}.hint`)}
                <ArrowUpRight
                  className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </p>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
