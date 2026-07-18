"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatEUR } from "@/components/finance/finance-format";
import type { Totals } from "@/lib/api/proposal-content-types";

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? "text-sm text-muted-foreground" : "text-sm text-foreground"}>
        {label}
      </span>
      <span
        className={
          strong
            ? "font-heading text-lg font-semibold tabular-nums text-foreground"
            : "text-sm tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Totals summary grouped by billing cadence. The one-time block is always
 * shown (it is what feeds `proposals.value`); the recurring blocks appear only
 * when there are monthly/annual lines, so a one-off proposal stays clean.
 */
export function TotalsPanel({ totals }: { totals: Totals }) {
  const t = useTranslations("proposals.totals");
  const locale = useLocale();
  const f = (cents: number) => formatEUR(cents, locale);
  const hasMonthly = totals.monthly.gross > 0;
  const hasAnnual = totals.annual.gross > 0;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("oneTime")}
        </p>
        <Row label={t("net")} value={f(totals.oneTime.net)} muted />
        <Row label={t("vat")} value={f(totals.oneTime.tax)} muted />
        <Row label={t("total")} value={f(totals.oneTime.gross)} strong />
      </div>

      {hasMonthly ? (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("monthly")}
          </p>
          <Row label={t("net")} value={f(totals.monthly.net)} muted />
          <Row label={t("totalPerMonth")} value={f(totals.monthly.gross)} strong />
        </div>
      ) : null}

      {hasAnnual ? (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("annual")}
          </p>
          <Row label={t("net")} value={f(totals.annual.net)} muted />
          <Row label={t("totalPerYear")} value={f(totals.annual.gross)} strong />
        </div>
      ) : null}
    </div>
  );
}
