"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { SmartTable, EmptyState, type SmartTableColumn } from "@/components/shared";
import { Lock } from "lucide-react";
import { StatusBadge } from "@/components/finance/milestone-status";
import type { ReportDataset } from "@/lib/api/reports-types";
import {
  financeTotals,
  pendingPayments,
  marginByProject,
  monthlyEvolution,
  type PaymentRow,
  type ProjectMarginRow,
} from "./report-compute";
import { ReportSection } from "./report-section";
import { DualBars, StatGrid, type DualPoint } from "./report-charts";
import { formatEUR, formatDate, formatRatio, compactNumber } from "./reports-format";

/** yyyy-mm → short "mm/yyyy" for the monthly axis. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${m}/${y.slice(2)}`;
}

export function FinanceiroReports({ data }: { data: ReportDataset }) {
  const t = useTranslations("reports.financeiro");
  const tStatus = useTranslations("finance.status");
  const locale = useLocale();
  const gen = data.generatedAt;

  // Gated at the route + nav; this is the last-line UX guard (BR-008).
  if (!data.canFinance || !data.finance) {
    return (
      <EmptyState
        icon={Lock}
        title={t("gated.title")}
        description={t("gated.description")}
      />
    );
  }

  const finance = data.finance;
  const totals = financeTotals(finance);
  const payments = pendingPayments(finance);
  const margins = marginByProject(finance);
  const monthly = monthlyEvolution(finance);
  const monthlyBars: DualPoint[] = monthly.map((r) => ({
    label: monthLabel(r.month),
    a: Math.round(r.contractedCents / 100),
    b: Math.round(r.receivedCents / 100),
  }));

  const paymentCols: SmartTableColumn<PaymentRow>[] = [
    {
      id: "project",
      header: t("payments.project"),
      cell: (r) => <span className="font-medium text-foreground">{r.projectName}</span>,
      accessor: (r) => r.projectName,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "client",
      header: t("payments.client"),
      cell: (r) => <span className="text-muted-foreground">{r.clientName}</span>,
      accessor: (r) => r.clientName,
      cardPriority: 5,
    },
    {
      id: "amount",
      header: t("payments.amount"),
      cell: (r) => <span className="tabular-nums">{formatEUR(r.amountCents, locale)}</span>,
      accessor: (r) => r.amountCents,
      sortable: true,
      align: "right",
      cardPriority: 3,
    },
    {
      id: "outstanding",
      header: t("payments.outstanding"),
      cell: (r) => (
        <span className="tabular-nums font-medium">{formatEUR(r.outstandingCents, locale)}</span>
      ),
      accessor: (r) => r.outstandingCents,
      sortable: true,
      align: "right",
      cardPriority: 2,
    },
    {
      id: "expected",
      header: t("payments.expected"),
      cell: (r) => <span className="tabular-nums">{formatDate(r.expectedDate)}</span>,
      accessor: (r) => r.expectedDate,
      sortable: true,
      align: "right",
      cardPriority: 4,
    },
    {
      id: "status",
      header: t("payments.status"),
      cell: (r) => <StatusBadge status={r.status} />,
      accessor: (r) => r.status,
      filterOptions: ["planned", "invoiced", "partially_paid", "overdue"].map((s) => ({
        label: tStatus(s),
        value: s,
      })),
      cardPriority: 6,
    },
  ];

  const marginCols: SmartTableColumn<ProjectMarginRow>[] = [
    {
      id: "project",
      header: t("margin.project"),
      cell: (r) => <span className="font-medium text-foreground">{r.projectName}</span>,
      accessor: (r) => r.projectName,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "contracted",
      header: t("margin.contracted"),
      cell: (r) => <span className="tabular-nums">{formatEUR(r.contractedCents, locale)}</span>,
      accessor: (r) => r.contractedCents,
      sortable: true,
      align: "right",
      cardPriority: 3,
    },
    {
      id: "received",
      header: t("margin.received"),
      cell: (r) => (
        <span className="tabular-nums text-success">{formatEUR(r.receivedCents, locale)}</span>
      ),
      accessor: (r) => r.receivedCents,
      sortable: true,
      align: "right",
      cardPriority: 4,
    },
    {
      id: "costs",
      header: t("margin.costs"),
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">{formatEUR(r.costsCents, locale)}</span>
      ),
      accessor: (r) => r.costsCents,
      sortable: true,
      align: "right",
      cardPriority: 5,
    },
    {
      id: "margin",
      header: t("margin.margin"),
      cell: (r) => (
        <span
          className={`tabular-nums font-medium ${r.marginCents >= 0 ? "text-success" : "text-destructive"}`}
        >
          {formatEUR(r.marginCents, locale)}
        </span>
      ),
      accessor: (r) => r.marginCents,
      sortable: true,
      align: "right",
      cardPriority: 2,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <ReportSection
        title={t("revenue.title")}
        description={t("revenue.description")}
        wide
        csv={{
          headers: [t("revenue.metric"), t("revenue.value")],
          rows: [
            [t("revenue.contracted"), formatEUR(totals.contractedCents, locale)],
            [t("revenue.received"), formatEUR(totals.receivedCents, locale)],
            [t("revenue.pending"), formatEUR(totals.pendingCents, locale)],
            [t("revenue.overdue"), formatEUR(totals.overdueCents, locale)],
          ],
          filenameStem: t("revenue.title"),
          generatedAt: gen,
        }}
      >
        <StatGrid
          items={[
            {
              key: "contracted",
              label: t("revenue.contracted"),
              value: formatEUR(totals.contractedCents, locale),
            },
            {
              key: "received",
              label: t("revenue.received"),
              value: formatEUR(totals.receivedCents, locale),
              tone: "success",
            },
            {
              key: "pending",
              label: t("revenue.pending"),
              value: formatEUR(totals.pendingCents, locale),
            },
            {
              key: "overdue",
              label: t("revenue.overdue"),
              value: formatEUR(totals.overdueCents, locale),
              tone: totals.overdueCents > 0 ? "destructive" : "default",
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        title={t("monthly.title")}
        description={t("monthly.description")}
        wide
        empty={monthly.length === 0}
        csv={{
          headers: [t("monthly.month"), t("monthly.contracted"), t("monthly.received")],
          rows: monthly.map((r) => [
            r.month,
            formatEUR(r.contractedCents, locale),
            formatEUR(r.receivedCents, locale),
          ]),
          filenameStem: t("monthly.title"),
          generatedAt: gen,
        }}
      >
        <DualBars
          data={monthlyBars}
          series={{
            a: { label: t("monthly.contracted"), color: "var(--chart-1)" },
            b: { label: t("monthly.received"), color: "var(--chart-3)" },
          }}
          valueFormatter={(n) => formatEUR(n * 100, locale)}
          yTickFormatter={(n) => compactNumber(n, locale)}
        />
      </ReportSection>

      <ReportSection
        title={t("payments.title")}
        description={t("payments.description")}
        wide
        empty={payments.length === 0}
        emptyLabel={t("payments.empty")}
        csv={{
          headers: [
            t("payments.project"),
            t("payments.client"),
            t("payments.amount"),
            t("payments.outstanding"),
            t("payments.expected"),
            t("payments.status"),
          ],
          rows: payments.map((r) => [
            r.projectName,
            r.clientName,
            formatEUR(r.amountCents, locale),
            formatEUR(r.outstandingCents, locale),
            formatDate(r.expectedDate),
            tStatus(r.status),
          ]),
          filenameStem: t("payments.title"),
          generatedAt: gen,
        }}
      >
        <SmartTable data={payments} columns={paymentCols} getRowId={(r) => r.id} pageSize={10} />
      </ReportSection>

      <ReportSection
        title={t("margin.title")}
        description={t("margin.description")}
        wide
        empty={margins.length === 0}
        csv={{
          headers: [
            t("margin.project"),
            t("margin.contracted"),
            t("margin.received"),
            t("margin.costs"),
            t("margin.margin"),
            t("margin.ratio"),
          ],
          rows: margins.map((r) => [
            r.projectName,
            formatEUR(r.contractedCents, locale),
            formatEUR(r.receivedCents, locale),
            formatEUR(r.costsCents, locale),
            formatEUR(r.marginCents, locale),
            formatRatio(r.marginRatio, locale),
          ]),
          filenameStem: t("margin.title"),
          generatedAt: gen,
        }}
      >
        <SmartTable data={margins} columns={marginCols} getRowId={(r) => r.projectId} pageSize={10} />
      </ReportSection>
    </div>
  );
}
