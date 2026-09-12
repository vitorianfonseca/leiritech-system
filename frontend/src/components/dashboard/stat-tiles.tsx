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

/** Pastel chips, one family per tone — the reference's visual signature. */
const TONE_CHIP: Record<MetricTone, string> = {
  neutral: "text-status-blocked",
  signal: "text-signal",
  success: "text-health-healthy",
  warning: "text-health-attention",
  destructive: "text-status-overdue",
  info: "text-info",
};

/**
 * Dashboard headline tiles (F2). Values count up via AnimatedCounter (respecting
 * prefers-reduced-motion) and each tile is a link into the underlying list.
 * State is conveyed with icon + label + token colour, never colour alone.
 * Financial tiles are already stripped upstream for unauthorized users (BR-008).
 */
/**
 * The four figures that answer the question this app is opened with — what
 * needs me, and what is the work doing. Ordered by urgency: what is wrong,
 * what is late, what lands next, what is running.
 *
 * The commercial pair (open opportunities, pipeline value) is deliberately
 * absent. Money belongs in Finance, where someone goes when that is the
 * question; on the home screen it pushed the urgent figures below the fold.
 */
const SHOWN: MetricKey[] = [
  "projectsAtRisk",
  "overdueTasks",
  "deliveriesNext7Days",
  "activeProjects",
];

export function StatTiles({
  metrics: allMetrics,
  loading = false,
}: {
  metrics: DashboardMetric[];
  loading?: boolean;
}) {
  const metrics = React.useMemo(
    () =>
      SHOWN.map((key) => allMetrics.find((m) => m.key === key)).filter(
        (m): m is DashboardMetric => m !== undefined,
      ),
    [allMetrics],
  );
  const t = useTranslations("dashboard.metrics");
  const locale = useLocale();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {metrics.map((m) => {
        const Icon = METRIC_ICON[m.key];
        // Colour has to mean "act on this". A metric only earns the alert
        // treatment when it is both a problem tone and actually non-zero:
        // "0 overdue" is good news and must not look like a warning, and four
        // tinted tiles are decoration rather than hierarchy.
        const raising =
          (m.tone === "destructive" || m.tone === "warning") &&
          typeof m.value === "number" &&
          m.value > 0;
        const alertVar =
          m.tone === "destructive" ? "var(--status-overdue)" : "var(--health-attention)";
        return (
          <Card
            key={m.key}
            className={cn("gap-0 p-0 py-0", raising && "card-alert")}
            style={raising ? ({ "--alert": alertVar } as React.CSSProperties) : undefined}
          >
            <Link
              href={m.href}
              className="group flex h-full flex-col gap-3 rounded-[inherit] p-5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={t(`${m.key}.label`)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`${m.key}.label`)}
                </p>
                <span
                  className={cn(
                    "glass-chip flex size-9 shrink-0 items-center justify-center rounded-lg",
                    raising ? "[--chip:var(--alert)]" : "glass-chip-neutral",
                    TONE_CHIP[m.tone]
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                </span>
              </div>

              {/* The figure is the point of the tile, so it is set at display
                  size rather than at heading size. */}
              <p
                className={cn(
                  "font-heading text-3xl font-bold tracking-tight tabular-nums md:text-4xl",
                  raising ? "text-[var(--alert)]" : "text-foreground"
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
