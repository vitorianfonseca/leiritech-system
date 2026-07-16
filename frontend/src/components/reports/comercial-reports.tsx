"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { SmartTable, type SmartTableColumn } from "@/components/shared";
import type { ReportDataset } from "@/lib/api/reports-types";
import { PIPELINE_STAGE_IDS } from "@/lib/api/opportunities-types";
import {
  opportunitiesByStage,
  valueByStage,
  conversionSummary,
  wonLostValue,
  avgDaysToClose,
  ownerPerformance,
  lostReasons,
  clientSources,
  type OwnerPerfRow,
} from "./report-compute";
import { ReportSection } from "./report-section";
import { CountBars, StatGrid, type Datum } from "./report-charts";
import { formatEUR, formatCount, formatRatio, compactNumber } from "./reports-format";
import type { CsvCell } from "./csv";

export function ComercialReports({ data }: { data: ReportDataset }) {
  const t = useTranslations("reports.comercial");
  const tStage = useTranslations("pipeline.stages");
  const tReason = useTranslations("pipeline.lostReasons");
  const tSource = useTranslations("crm.source");
  const locale = useLocale();
  const gen = data.generatedAt;
  const fin = data.canFinance;

  /* ---- oportunidades por etapa ---- */
  const byStage = opportunitiesByStage(data.opportunities, PIPELINE_STAGE_IDS);
  const stageBars: Datum[] = byStage.map((r) => ({
    key: r.stageId,
    label: tStage(r.stageId),
    value: r.count,
    color: "var(--chart-1)",
  }));

  /* ---- valor por etapa (gated) ---- */
  const valStage = valueByStage(data.opportunities, PIPELINE_STAGE_IDS);
  const valStageBars: Datum[] = valStage.map((r) => ({
    key: r.stageId,
    label: tStage(r.stageId),
    value: Math.round(r.valueCents / 100),
    color: "var(--chart-1)",
  }));

  /* ---- conversão + valor ganho/perdido + tempo até fecho ---- */
  const conv = conversionSummary(data.opportunities);
  const wl = wonLostValue(data.opportunities);
  const close = avgDaysToClose(data.opportunities);

  /* ---- desempenho por responsável ---- */
  const owners = ownerPerformance(data.opportunities);

  /* ---- motivos de perda ---- */
  const reasons = lostReasons(data.opportunities);
  const reasonBars: Datum[] = reasons.map((r) => ({
    key: r.reason,
    label: tReason(r.reason),
    value: r.count,
    color: "var(--chart-5)",
  }));

  /* ---- origem dos clientes ---- */
  const sources = clientSources(data.companies);
  const sourceBars: Datum[] = sources.map((r) => ({
    key: r.source,
    label: tSource(r.source),
    value: r.count,
    color: "var(--chart-2)",
  }));

  const ownerCols: SmartTableColumn<OwnerPerfRow>[] = [
    {
      id: "ownerName",
      header: t("owner.name"),
      cell: (r) => <span className="font-medium text-foreground">{r.ownerName}</span>,
      accessor: (r) => r.ownerName,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "open",
      header: t("owner.open"),
      cell: (r) => <span className="tabular-nums">{r.open}</span>,
      accessor: (r) => r.open,
      sortable: true,
      align: "right",
      cardPriority: 3,
    },
    {
      id: "won",
      header: t("owner.won"),
      cell: (r) => <span className="tabular-nums text-success">{r.won}</span>,
      accessor: (r) => r.won,
      sortable: true,
      align: "right",
      cardPriority: 2,
    },
    {
      id: "lost",
      header: t("owner.lost"),
      cell: (r) => <span className="tabular-nums text-muted-foreground">{r.lost}</span>,
      accessor: (r) => r.lost,
      sortable: true,
      align: "right",
      cardPriority: 4,
    },
    ...(fin
      ? [
          {
            id: "wonValue",
            header: t("owner.wonValue"),
            cell: (r: OwnerPerfRow) => (
              <span className="tabular-nums">{formatEUR(r.wonValueCents, locale)}</span>
            ),
            accessor: (r: OwnerPerfRow) => r.wonValueCents,
            sortable: true,
            align: "right" as const,
            cardPriority: 5,
          },
        ]
      : []),
  ];

  const ownerCsv: CsvCell[][] = owners.map((r) => [
    r.ownerName,
    r.open,
    r.won,
    r.lost,
    ...(fin ? [formatEUR(r.wonValueCents, locale)] : []),
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <ReportSection
        title={t("byStage.title")}
        description={t("byStage.description")}
        empty={data.opportunities.length === 0}
        csv={{
          headers: [t("byStage.colStage"), t("byStage.colCount")],
          rows: byStage.map((r) => [tStage(r.stageId), r.count]),
          filenameStem: t("byStage.title"),
          generatedAt: gen,
        }}
      >
        <CountBars data={stageBars} />
      </ReportSection>

      {fin ? (
        <ReportSection
          title={t("valueByStage.title")}
          description={t("valueByStage.description")}
          empty={data.opportunities.length === 0}
          csv={{
            headers: [t("byStage.colStage"), t("valueByStage.colValue")],
            rows: valStage.map((r) => [tStage(r.stageId), formatEUR(r.valueCents, locale)]),
            filenameStem: t("valueByStage.title"),
            generatedAt: gen,
          }}
        >
          <CountBars
            data={valStageBars}
            valueFormatter={(n) => formatEUR(n * 100, locale)}
            yTickFormatter={(n) => compactNumber(n, locale)}
          />
        </ReportSection>
      ) : null}

      <ReportSection
        title={t("conversion.title")}
        description={t("conversion.description")}
        csv={{
          headers: [t("conversion.metric"), t("conversion.value")],
          rows: [
            [t("conversion.open"), conv.open],
            [t("conversion.won"), conv.won],
            [t("conversion.lost"), conv.lost],
            [t("conversion.rate"), formatRatio(conv.rate, locale)],
          ],
          filenameStem: t("conversion.title"),
          generatedAt: gen,
        }}
      >
        <StatGrid
          items={[
            { key: "open", label: t("conversion.open"), value: formatCount(conv.open, locale) },
            {
              key: "won",
              label: t("conversion.won"),
              value: formatCount(conv.won, locale),
              tone: "success",
            },
            {
              key: "lost",
              label: t("conversion.lost"),
              value: formatCount(conv.lost, locale),
              tone: "destructive",
            },
            { key: "rate", label: t("conversion.rate"), value: formatRatio(conv.rate, locale) },
          ]}
        />
      </ReportSection>

      <ReportSection
        title={t("wonLost.title")}
        description={t("wonLost.description")}
        csv={{
          headers: [t("wonLost.metric"), t("wonLost.value")],
          rows: [
            [t("wonLost.wonCount"), wl.wonCount],
            [t("wonLost.lostCount"), wl.lostCount],
            ...(fin
              ? ([
                  [t("wonLost.wonValue"), formatEUR(wl.wonCents, locale)],
                  [t("wonLost.lostValue"), formatEUR(wl.lostCents, locale)],
                ] as CsvCell[][])
              : []),
          ],
          filenameStem: t("wonLost.title"),
          generatedAt: gen,
        }}
      >
        <StatGrid
          items={[
            {
              key: "wonCount",
              label: t("wonLost.wonCount"),
              value: formatCount(wl.wonCount, locale),
              tone: "success",
            },
            {
              key: "lostCount",
              label: t("wonLost.lostCount"),
              value: formatCount(wl.lostCount, locale),
              tone: "destructive",
            },
            ...(fin
              ? [
                  {
                    key: "wonValue",
                    label: t("wonLost.wonValue"),
                    value: formatEUR(wl.wonCents, locale),
                    tone: "success" as const,
                  },
                  {
                    key: "lostValue",
                    label: t("wonLost.lostValue"),
                    value: formatEUR(wl.lostCents, locale),
                    tone: "destructive" as const,
                  },
                ]
              : []),
            {
              key: "avgClose",
              label: t("avgClose.label"),
              value: t("avgClose.days", { days: close.avgDays }),
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        title={t("owner.title")}
        description={t("owner.description")}
        wide
        empty={owners.length === 0}
        csv={{
          headers: [
            t("owner.name"),
            t("owner.open"),
            t("owner.won"),
            t("owner.lost"),
            ...(fin ? [t("owner.wonValue")] : []),
          ],
          rows: ownerCsv,
          filenameStem: t("owner.title"),
          generatedAt: gen,
        }}
      >
        <SmartTable data={owners} columns={ownerCols} getRowId={(r) => r.ownerId} pageSize={8} />
      </ReportSection>

      <ReportSection
        title={t("reasons.title")}
        description={t("reasons.description")}
        empty={reasons.length === 0}
        csv={{
          headers: [t("reasons.colReason"), t("reasons.colCount")],
          rows: reasons.map((r) => [tReason(r.reason), r.count]),
          filenameStem: t("reasons.title"),
          generatedAt: gen,
        }}
      >
        <CountBars data={reasonBars} />
      </ReportSection>

      <ReportSection
        title={t("sources.title")}
        description={t("sources.description")}
        empty={sources.length === 0}
        csv={{
          headers: [t("sources.colSource"), t("sources.colCount")],
          rows: sources.map((r) => [tSource(r.source), r.count]),
          filenameStem: t("sources.title"),
          generatedAt: gen,
        }}
      >
        <CountBars data={sourceBars} />
      </ReportSection>
    </div>
  );
}
