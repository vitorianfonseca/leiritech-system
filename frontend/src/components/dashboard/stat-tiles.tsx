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
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/shared";
import { cellVariants, cellsVariants, lift } from "@/lib/motion";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { MASK, useHideAmounts } from "@/lib/use-privacy";
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

/** State is a 2px rule along the cell's top edge — readable at a glance,
    and it does not turn six figures into six coloured badges. */
/** Only a non-neutral state earns a mark, and it is the icon that carries it.
    A coloured rule across the top of every cell turned a quiet strip of
    figures into a row of warning tape. */
const TONE_ICON: Record<MetricTone, string> = {
  neutral: "text-muted-foreground",
  signal: "text-muted-foreground",
  success: "text-health-healthy",
  warning: "text-health-attention",
  destructive: "text-status-overdue",
  info: "text-muted-foreground",
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
  const { hidden } = useHideAmounts();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2.5 bg-card p-3">
            <div className="h-2.5 w-16 animate-pulse rounded-sm bg-muted" />
            <div className="h-7 w-20 animate-pulse rounded-sm bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  function renderValue(m: DashboardMetric): React.ReactNode {
    // The curtain covers money only. Counts of overdue tasks or projects at
    // risk are not sensitive, and blanking them would make the toggle useless.
    if (hidden && m.financial) {
      return <span aria-label={MASK}>{MASK}</span>;
    }
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
    // A strip of cells sharing hairline gutters — one instrument, six
    // readouts. Not six cards, each with its own border, radius and shadow.
    <motion.div
      variants={cellsVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6"
    >
      {metrics.map((m) => {
        const Icon = METRIC_ICON[m.key];
        return (
          <motion.div key={m.key} variants={cellVariants} {...lift}>
          <Link
            href={m.href}
            aria-label={t(`${m.key}.label`)}
            className="group relative block h-full bg-card p-3.5 transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
          >
            {/* Labels wrap rather than truncate: "Oportunidades abertas"
                clipped to "Oportunidades abert…" tells a reader less than a
                second line costs them. */}
            <p className="label-micro flex items-start gap-1.5 text-muted-foreground">
              <Icon
                className={cn("mt-px size-3.5 shrink-0", TONE_ICON[m.tone])}
                strokeWidth={2}
                aria-hidden
              />
              <span className="leading-[1.35]">{t(`${m.key}.label`)}</span>
            </p>
            <p
              className={cn(
                "font-data mt-2.5 text-[1.7rem] leading-none font-normal tracking-[-0.045em]",
                TONE_VALUE[m.tone]
              )}
            >
              {renderValue(m)}
            </p>
            <p className="mt-1.5 flex items-start gap-1 text-[0.7rem] leading-[1.35] text-muted-foreground">
              <span>{t(`${m.key}.hint`)}</span>
              <ArrowUpRight
                className="size-2.5 shrink-0 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 motion-reduce:transition-none"
                aria-hidden
              />
            </p>
          </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
