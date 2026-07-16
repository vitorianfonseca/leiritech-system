"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SmartTable, type SmartTableColumn } from "@/components/shared";
import type { ReportDataset } from "@/lib/api/reports-types";
import {
  memberLoad,
  memberTaskCounts,
  memberHours,
  timeByProject,
  todayISO,
  type MemberTaskRow,
} from "./report-compute";
import { ReportSection } from "./report-section";
import { HBars, type Datum } from "./report-charts";
import { formatHours, formatRatio } from "./reports-format";

/** Utilization zone → urgency token (over capacity reads as an alarm). */
function loadColor(ratio: number): string {
  if (ratio >= 1) return "var(--health-at-risk)";
  if (ratio >= 0.85) return "var(--health-attention)";
  return "var(--health-healthy)";
}

export function EquipaReports({ data }: { data: ReportDataset }) {
  const t = useTranslations("reports.equipa");
  const locale = useLocale();
  const gen = data.generatedAt;
  const today = todayISO();

  const load = memberLoad(data.team);
  const loadBars: Datum[] = load.map((r) => ({
    key: r.userId,
    label: r.name,
    value: Math.round(r.utilizationRatio * 100),
    color: loadColor(r.utilizationRatio),
  }));

  const taskRows = memberTaskCounts(data.team, data.tasks, today);
  const hours = memberHours(data.team);
  const loggedBars: Datum[] = hours.map((r) => ({
    key: r.userId,
    label: r.name,
    value: r.loggedHours,
    color: "var(--chart-1)",
  }));
  const billableBars: Datum[] = hours.map((r) => ({
    key: r.userId,
    label: r.name,
    value: r.billableHours,
    color: "var(--chart-3)",
  }));

  const byProject = timeByProject(data.timeEntries);
  const projectBars: Datum[] = byProject.map((r) => ({
    key: r.projectId,
    label: r.projectName,
    value: r.hours,
    color: "var(--chart-2)",
  }));

  const taskCols: SmartTableColumn<MemberTaskRow>[] = [
    {
      id: "name",
      header: t("tasks.member"),
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
      accessor: (r) => r.name,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "done",
      header: t("tasks.done"),
      cell: (r) => <span className="tabular-nums text-success">{r.done}</span>,
      accessor: (r) => r.done,
      sortable: true,
      align: "right",
      cardPriority: 2,
    },
    {
      id: "open",
      header: t("tasks.open"),
      cell: (r) => <span className="tabular-nums">{r.open}</span>,
      accessor: (r) => r.open,
      sortable: true,
      align: "right",
      cardPriority: 4,
    },
    {
      id: "overdue",
      header: t("tasks.overdue"),
      cell: (r) =>
        r.overdue > 0 ? (
          <Badge variant="destructive">{r.overdue}</Badge>
        ) : (
          <span className="tabular-nums text-muted-foreground">0</span>
        ),
      accessor: (r) => r.overdue,
      sortable: true,
      align: "right",
      cardPriority: 3,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <ReportSection
        title={t("load.title")}
        description={t("load.description")}
        wide
        empty={load.length === 0}
        csv={{
          headers: [t("load.member"), t("load.allocated"), t("load.capacity"), t("load.utilization")],
          rows: load.map((r) => [
            r.name,
            formatHours(r.allocatedHours, locale),
            formatHours(r.netCapacityHours, locale),
            formatRatio(r.utilizationRatio, locale),
          ]),
          filenameStem: t("load.title"),
          generatedAt: gen,
        }}
      >
        <HBars data={loadBars} valueFormatter={(n) => `${n}%`} domainMax={130} />
      </ReportSection>

      <ReportSection
        title={t("tasks.title")}
        description={t("tasks.description")}
        wide
        empty={taskRows.length === 0}
        csv={{
          headers: [t("tasks.member"), t("tasks.done"), t("tasks.open"), t("tasks.overdue")],
          rows: taskRows.map((r) => [r.name, r.done, r.open, r.overdue]),
          filenameStem: t("tasks.title"),
          generatedAt: gen,
        }}
      >
        <SmartTable data={taskRows} columns={taskCols} getRowId={(r) => r.userId} pageSize={10} />
      </ReportSection>

      <ReportSection
        title={t("logged.title")}
        description={t("logged.description")}
        empty={hours.length === 0}
        csv={{
          headers: [t("logged.member"), t("logged.hours")],
          rows: hours.map((r) => [r.name, formatHours(r.loggedHours, locale)]),
          filenameStem: t("logged.title"),
          generatedAt: gen,
        }}
      >
        <HBars data={loggedBars} valueFormatter={(n) => formatHours(n, locale)} />
      </ReportSection>

      <ReportSection
        title={t("billable.title")}
        description={t("billable.description")}
        empty={hours.length === 0}
        csv={{
          headers: [t("billable.member"), t("billable.hours"), t("billable.ratio")],
          rows: hours.map((r) => [
            r.name,
            formatHours(r.billableHours, locale),
            formatRatio(r.billableRatio, locale),
          ]),
          filenameStem: t("billable.title"),
          generatedAt: gen,
        }}
      >
        <HBars data={billableBars} valueFormatter={(n) => formatHours(n, locale)} />
      </ReportSection>

      <ReportSection
        title={t("byProject.title")}
        description={t("byProject.description")}
        wide
        empty={byProject.length === 0}
        csv={{
          headers: [t("byProject.project"), t("byProject.hours"), t("byProject.billable")],
          rows: byProject.map((r) => [
            r.projectName,
            formatHours(r.hours, locale),
            formatHours(r.billableHours, locale),
          ]),
          filenameStem: t("byProject.title"),
          generatedAt: gen,
        }}
      >
        <HBars data={projectBars} valueFormatter={(n) => formatHours(n, locale)} />
      </ReportSection>
    </div>
  );
}
