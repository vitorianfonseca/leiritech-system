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

/** Icon colour carries tone alongside the value, so state is never colour alone. */
const TONE_ICON: Record<MetricTone, string> = {
  neutral: "text-muted-foreground/70",
  signal: "text-muted-foreground/70",
  success: "text-health-healthy",
  warning: "text-health-attention",
  destructive: "text-status-overdue",
  info: "text-muted-foreground/70",
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
 * The dashboard's figures, set as a ledger rather than a grid of cards.
 *
 * Boxing each number in its own bordered, shadowed card gives nine numbers
 * the same visual weight and none of them any hierarchy — the look this
 * redesign is getting away from. Hairline rules separate the columns
 * instead, which is what a printed table of figures does, and lets the
 * numerals themselves carry the page.
 *
 * Values count up via AnimatedCounter (which respects prefers-reduced-motion)
 * and every figure links into the list behind it. Tone is carried by the icon
 * colour *and* the value colour, never by colour alone. Financial figures are
 * stripped upstream for unauthorized users (BR-008).
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
      <div className="grid grid-cols-2 border-t border-border sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 border-b border-border p-5 [&:not(:nth-child(2n))]:border-r sm:[&:not(:nth-child(3n))]:border-r sm:[&:nth-child(2n)]:border-r"
          >
            <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-9 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted/70" />
          </div>
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
    // 3-up on ≥sm: every role payload has a count divisible by 3 (9 full /
    // 6 finance-gated / 3 scoped-membro), so rows always fill with no dead
    // column. Rules run between cells; the block is closed top and bottom.
    <div className="grid grid-cols-2 border-t border-border sm:grid-cols-3">
      {metrics.map((m) => {
        const Icon = METRIC_ICON[m.key];
        return (
          <Link
            key={m.key}
            href={m.href}
            aria-label={t(`${m.key}.label`)}
            className="group relative border-b border-border p-5 transition-colors duration-[var(--duration-fast)] [&:not(:nth-child(2n))]:border-r hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0"
          >
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon
                className={cn("size-3.5 shrink-0", TONE_ICON[m.tone])}
                strokeWidth={2}
                aria-hidden
              />
              {t(`${m.key}.label`)}
            </p>

            <p
              className={cn(
                "font-heading mt-2 text-3xl leading-none font-bold tracking-tight tabular-nums md:text-[2.125rem]",
                TONE_VALUE[m.tone]
              )}
            >
              {renderValue(m)}
            </p>

            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              {t(`${m.key}.hint`)}
              <ArrowUpRight
                className="size-3 shrink-0 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 motion-reduce:transition-none"
                aria-hidden
              />
            </p>
          </Link>
        );
      })}
    </div>
  );
}
