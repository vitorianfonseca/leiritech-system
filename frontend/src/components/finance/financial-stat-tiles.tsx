"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  FileSignature,
  Banknote,
  Hourglass,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { FinancialSummary } from "@/lib/api/finance-types";
import { formatEURWhole, formatPercent } from "./finance-format";

export interface FinancialStatTilesProps {
  summary: FinancialSummary;
  /** Skeleton state. */
  loading?: boolean;
  className?: string;
}

interface Tile {
  key: string;
  icon: LucideIcon;
  cents: number;
  /** Accent for the icon chip. */
  tone: "neutral" | "success" | "warning" | "margin";
}

/**
 * Live financial headline tiles (F14 / BR-065): contracted, received, pending
 * and margin. Values count up (AnimatedCounter) and are formatted EUR/pt-PT.
 * Reusable — the projects Financeiro tab (#32) embeds this with a per-project
 * summary. State is conveyed with icon + label, never colour alone.
 */
export function FinancialStatTiles({
  summary,
  loading = false,
  className,
}: FinancialStatTilesProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const marginPositive = summary.marginCents >= 0;

  const tiles: Tile[] = [
    { key: "contracted", icon: FileSignature, cents: summary.contractedCents, tone: "neutral" },
    { key: "received", icon: Banknote, cents: summary.receivedCents, tone: "success" },
    { key: "pending", icon: Hourglass, cents: summary.pendingCents, tone: "warning" },
    {
      key: "margin",
      icon: marginPositive ? TrendingUp : TrendingDown,
      cents: summary.marginCents,
      tone: "margin",
    },
  ];

  const chipTone: Record<Tile["tone"], string> = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success-muted text-success",
    warning: "bg-warning-muted text-warning-foreground",
    margin: marginPositive
      ? "bg-health-healthy-bg text-health-healthy"
      : "bg-status-overdue-bg text-status-overdue",
  };

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card key={tile.key} className="gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`tiles.${tile.key}.label`)}
              </p>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  chipTone[tile.tone]
                )}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden />
              </span>
            </div>

            {loading ? (
              <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
            ) : (
              <p
                className={cn(
                  "font-heading text-2xl font-semibold tracking-tight md:text-3xl",
                  tile.tone === "margin" &&
                    (marginPositive ? "text-health-healthy" : "text-status-overdue")
                )}
              >
                <AnimatedCounter
                  value={tile.cents}
                  format={(n) => formatEURWhole(n, locale)}
                />
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {tile.key === "margin"
                ? t("tiles.margin.hint", {
                    percent: formatPercent(summary.marginRatio, locale),
                  })
                : t(`tiles.${tile.key}.hint`)}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
