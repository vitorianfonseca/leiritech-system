"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, CircleDollarSign, CircleSlash, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedCounter } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { TimeTotals } from "@/lib/api/time-types";

interface Tile {
  key: string;
  icon: LucideIcon;
  minutes: number;
  tone: "signal" | "success" | "muted" | "info";
  isCount?: boolean;
}

const toneClasses: Record<Tile["tone"], { ring: string; icon: string }> = {
  signal: { ring: "bg-signal-muted", icon: "text-signal" },
  success: { ring: "bg-success-muted", icon: "text-success" },
  muted: { ring: "bg-muted", icon: "text-muted-foreground" },
  info: { ring: "bg-info-muted", icon: "text-info" },
};

/** Summary tiles for the time surface — total / billable / non-billable / entries. */
export function SummaryCards({
  totals,
  loading = false,
}: {
  totals: TimeTotals;
  loading?: boolean;
}) {
  const t = useTranslations("time.summary");
  const locale = useLocale();

  const billablePct =
    totals.totalMinutes > 0
      ? Math.round((totals.billableMinutes / totals.totalMinutes) * 100)
      : 0;

  const tiles: Tile[] = [
    { key: "total", icon: Clock, minutes: totals.totalMinutes, tone: "signal" },
    { key: "billable", icon: CircleDollarSign, minutes: totals.billableMinutes, tone: "success" },
    { key: "nonBillable", icon: CircleSlash, minutes: totals.nonBillableMinutes, tone: "muted" },
    { key: "entries", icon: ListChecks, minutes: totals.entryCount, tone: "info", isCount: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const tone = toneClasses[tile.tone];
        return (
          <div
            key={tile.key}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  tone.ring
                )}
              >
                <Icon className={cn("size-4", tone.icon)} strokeWidth={1.8} aria-hidden />
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(`${tile.key}.label`)}
              </p>
            </div>
            <p className="mt-3 font-heading text-2xl font-semibold text-foreground">
              {loading ? (
                <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted align-middle" />
              ) : tile.isCount ? (
                <AnimatedCounter value={tile.minutes} />
              ) : (
                <AnimatedCounter
                  value={tile.minutes / 60}
                  decimals={1}
                  suffix=" h"
                  format={(n) =>
                    new Intl.NumberFormat(locale, {
                      minimumFractionDigits: n % 1 === 0 ? 0 : 1,
                      maximumFractionDigits: 1,
                    }).format(n)
                  }
                />
              )}
            </p>
            {!loading && tile.key === "billable" && totals.totalMinutes > 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("billable.share", { pct: billablePct })}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
