"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/shared";
import { formatEURWhole } from "@/components/finance/finance-format";
import { MASK, useHideAmounts } from "@/lib/use-privacy";
import { duration, easeOut, spring } from "@/lib/motion";
import type { DashboardData } from "@/lib/api/dashboard-types";

/**
 * The chain.
 *
 * LeiriTech's whole model is one sequence — an opportunity becomes a
 * proposal, a proposal becomes a project, a project becomes money received —
 * and the question a studio owner actually opens this app with is "where is
 * everything sitting right now?". So the headline visualisation is that
 * sequence, with the live count and value at each link, rather than a chart.
 *
 * It is deliberately not a time series. The honest reason: at this data
 * volume a six-month line is five months of zero and one spike, which looks
 * like a broken chart and tells nobody anything. A chart earns its place when
 * the shape carries information; here the *state* does.
 *
 * Motion is the point of the composition, not decoration on top of it: the
 * connectors draw left to right in sequence, so the eye is pulled along the
 * chain in the direction the business flows. Values count up as each link
 * lands. Under reduced motion the whole thing renders at rest, complete.
 */

interface Link_ {
  key: string;
  href: string;
  count: number;
  /** EUR cents, or null where the link has no money attached. */
  value: number | null;
  financial: boolean;
  tone?: "risk";
}

export function Momentum({
  data,
  loading,
}: {
  data: DashboardData | undefined;
  loading: boolean;
}) {
  const t = useTranslations("dashboard.momentum");
  const locale = useLocale();
  const reduced = useReducedMotion();
  const { hidden } = useHideAmounts();

  const metric = React.useCallback(
    (key: string) => data?.metrics.find((m) => m.key === key)?.value ?? 0,
    [data],
  );

  const links = React.useMemo<Link_[]>(() => {
    const received =
      data?.charts.contractedReceived?.at(-1)?.receivedCents ?? null;
    return [
      {
        key: "pipeline",
        href: "/crm/pipeline",
        count: metric("openOpportunities"),
        value: metric("pipelineValue"),
        financial: true,
      },
      {
        key: "proposals",
        href: "/crm/proposals",
        count:
          data?.attention.find((g) => g.key === "proposalsAwaiting")?.items
            .length ?? 0,
        value: null,
        financial: false,
      },
      {
        key: "projects",
        href: "/projects",
        count: metric("activeProjects"),
        value: null,
        financial: false,
        tone: metric("projectsAtRisk") > 0 ? "risk" : undefined,
      },
      {
        key: "received",
        href: "/finance",
        count: 0,
        value: received,
        financial: true,
      },
    ];
  }, [data, metric]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-9 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section aria-label={t("title")}>
      <h2 className="text-sm font-medium text-muted-foreground">{t("title")}</h2>

      <div className="relative mt-5 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        {links.map((link, i) => {
          const isLast = i === links.length - 1;
          const money = link.financial && link.value !== null;
          const masked = money && hidden;

          return (
            <motion.div
              key={link.key}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: duration.slow,
                ease: easeOut,
                delay: reduced ? 0 : i * 0.09,
              }}
              className="relative"
            >
              {/* The connector. Draws toward the next link, so the sequence
                  reads in the direction value actually moves. Hidden on the
                  last link and whenever the row wraps. */}
              {!isLast ? (
                <motion.span
                  aria-hidden
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: 0.4,
                    ease: easeOut,
                    delay: reduced ? 0 : i * 0.09 + 0.18,
                  }}
                  className={cn(
                    "pointer-events-none absolute top-[1.15rem] -right-6 hidden h-px w-6 origin-left bg-border",
                    i % 2 === 0 ? "max-md:block" : "",
                    "md:block",
                  )}
                />
              ) : null}

              <Link
                href={link.href}
                className="group block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                  {t(`links.${link.key}`)}
                  <ArrowRight
                    className="size-3 shrink-0 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-60 motion-reduce:transition-none"
                    aria-hidden
                  />
                </p>

                <p
                  className={cn(
                    "font-heading mt-1.5 text-[2rem] leading-none font-bold tracking-[-0.035em] tabular-nums",
                    link.tone === "risk" ? "text-status-overdue" : "text-foreground",
                  )}
                >
                  {masked ? (
                    <span aria-label={MASK}>{MASK}</span>
                  ) : money ? (
                    <AnimatedCounter
                      value={link.value as number}
                      format={(n) => formatEURWhole(n, locale)}
                    />
                  ) : (
                    <AnimatedCounter value={link.count} />
                  )}
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  {t(`captions.${link.key}`, {
                    count: link.count,
                    atRisk: metric("projectsAtRisk"),
                  })}
                </p>
              </Link>

              {/* A hairline that fills to the share this link holds of the
                  chain's total count — a proportion you can read at a glance
                  without a legend or an axis. */}
              <motion.span
                aria-hidden
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ ...spring.layout, delay: reduced ? 0 : i * 0.09 + 0.1 }}
                className={cn(
                  "mt-3 block h-0.5 origin-left rounded-full",
                  link.tone === "risk" ? "bg-status-overdue" : "bg-foreground/80",
                )}
                style={{
                  width: `${Math.max(
                    8,
                    Math.round(
                      (link.count /
                        Math.max(1, links.reduce((n, l) => n + l.count, 0))) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
