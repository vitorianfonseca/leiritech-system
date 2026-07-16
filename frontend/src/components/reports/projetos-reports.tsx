"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SmartTable, ProgressBar, type SmartTableColumn } from "@/components/shared";
import type { ReportDataset } from "@/lib/api/reports-types";
import {
  PROJECT_STATES,
  PROJECT_HEALTHS,
  type ProjectState,
  type ProjectHealth,
} from "@/lib/api/projects-types";
import {
  projectsByState,
  projectsByHealth,
  projectsAtRisk,
  averageProgress,
  taskFlagsByProject,
  projectHours,
  marginByProject,
  todayISO,
  type RiskProjectRow,
  type TaskFlagRow,
  type ProjectMarginRow,
} from "./report-compute";
import { ReportSection } from "./report-section";
import { DistributionDonut, DualBars, StatGrid, type Datum, type DualPoint } from "./report-charts";
import { formatEUR, formatDate, formatHours, formatRatio, formatCount } from "./reports-format";

const STATE_COLOR: Record<ProjectState, string> = {
  planning: "var(--chart-2)",
  active: "var(--health-healthy)",
  on_hold: "var(--health-attention)",
  completed: "var(--status-done)",
  cancelled: "var(--health-at-risk)",
  archived: "var(--muted-foreground)",
};
const HEALTH_COLOR: Record<ProjectHealth, string> = {
  healthy: "var(--health-healthy)",
  attention: "var(--health-attention)",
  at_risk: "var(--health-at-risk)",
};
export function ProjetosReports({ data }: { data: ReportDataset }) {
  const t = useTranslations("reports.projetos");
  const tStates = useTranslations("projects.states");
  const tHealth = useTranslations("projects.health");
  const locale = useLocale();
  const gen = data.generatedAt;
  const today = todayISO();

  const byState = projectsByState(data.projects, [...PROJECT_STATES]);
  const stateDonut: Datum[] = byState.map((r) => ({
    key: r.state,
    label: tStates(r.state),
    value: r.count,
    color: STATE_COLOR[r.state],
  }));

  const byHealth = projectsByHealth(data.projects, [...PROJECT_HEALTHS]);
  const healthDonut: Datum[] = byHealth.map((r) => ({
    key: r.health,
    label: tHealth(r.health),
    value: r.count,
    color: HEALTH_COLOR[r.health],
  }));

  const atRisk = projectsAtRisk(data.projects);
  const avgProgress = averageProgress(data.projects);
  const flags = taskFlagsByProject(data.tasks, today);
  const hours = projectHours(data.projects);
  const hoursTop = hours.slice(0, 8);
  const hoursBars: DualPoint[] = hoursTop.map((r) => ({
    label: r.projectName,
    a: r.budgetHours,
    b: r.usedHours,
  }));

  const margins = data.finance ? marginByProject(data.finance) : [];

  const total = data.projects.length;

  /* ---- tables ---- */
  const riskCols: SmartTableColumn<RiskProjectRow>[] = [
    {
      id: "name",
      header: t("atRisk.name"),
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
      accessor: (r) => r.name,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "client",
      header: t("atRisk.client"),
      cell: (r) => <span className="text-muted-foreground">{r.clientName}</span>,
      accessor: (r) => r.clientName,
      sortable: true,
      cardPriority: 3,
    },
    {
      id: "manager",
      header: t("atRisk.manager"),
      cell: (r) => r.managerName,
      accessor: (r) => r.managerName,
      cardPriority: 4,
    },
    {
      id: "progress",
      header: t("atRisk.progress"),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={r.progress} className="w-20" />
          <span className="tabular-nums text-xs text-muted-foreground">{r.progress}%</span>
        </div>
      ),
      accessor: (r) => r.progress,
      sortable: true,
      cardPriority: 2,
    },
    {
      id: "due",
      header: t("atRisk.due"),
      cell: (r) => <span className="tabular-nums">{formatDate(r.dueDate)}</span>,
      accessor: (r) => r.dueDate,
      sortable: true,
      align: "right",
      cardPriority: 5,
    },
  ];

  const flagCols: SmartTableColumn<TaskFlagRow>[] = [
    {
      id: "project",
      header: t("taskFlags.project"),
      cell: (r) => <span className="font-medium text-foreground">{r.projectName}</span>,
      accessor: (r) => r.projectName,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "overdue",
      header: t("taskFlags.overdue"),
      cell: (r) =>
        r.overdue > 0 ? (
          <Badge variant="destructive">{r.overdue}</Badge>
        ) : (
          <span className="tabular-nums text-muted-foreground">0</span>
        ),
      accessor: (r) => r.overdue,
      sortable: true,
      align: "right",
      cardPriority: 2,
    },
    {
      id: "blocked",
      header: t("taskFlags.blocked"),
      cell: (r) =>
        r.blocked > 0 ? (
          <Badge variant="blocked">{r.blocked}</Badge>
        ) : (
          <span className="tabular-nums text-muted-foreground">0</span>
        ),
      accessor: (r) => r.blocked,
      sortable: true,
      align: "right",
      cardPriority: 3,
    },
  ];

  const marginCols: SmartTableColumn<ProjectMarginRow>[] = [
    {
      id: "project",
      header: t("profit.project"),
      cell: (r) => <span className="font-medium text-foreground">{r.projectName}</span>,
      accessor: (r) => r.projectName,
      sortable: true,
      cardPriority: 1,
    },
    {
      id: "contracted",
      header: t("profit.contracted"),
      cell: (r) => <span className="tabular-nums">{formatEUR(r.contractedCents, locale)}</span>,
      accessor: (r) => r.contractedCents,
      sortable: true,
      align: "right",
      cardPriority: 3,
    },
    {
      id: "costs",
      header: t("profit.costs"),
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">{formatEUR(r.costsCents, locale)}</span>
      ),
      accessor: (r) => r.costsCents,
      sortable: true,
      align: "right",
      cardPriority: 4,
    },
    {
      id: "margin",
      header: t("profit.margin"),
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
    {
      id: "ratio",
      header: t("profit.ratio"),
      cell: (r) => <span className="tabular-nums">{formatRatio(r.marginRatio, locale)}</span>,
      accessor: (r) => r.marginRatio,
      sortable: true,
      align: "right",
      cardPriority: 5,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <ReportSection
        title={t("byState.title")}
        description={t("byState.description")}
        empty={total === 0}
        csv={{
          headers: [t("byState.colState"), t("byState.colCount")],
          rows: byState.map((r) => [tStates(r.state), r.count]),
          filenameStem: t("byState.title"),
          generatedAt: gen,
        }}
      >
        <DistributionDonut data={stateDonut} total={total} centerLabel={t("byState.center")} />
      </ReportSection>

      <ReportSection
        title={t("byHealth.title")}
        description={t("byHealth.description")}
        empty={total === 0}
        csv={{
          headers: [t("byHealth.colHealth"), t("byHealth.colCount")],
          rows: byHealth.map((r) => [tHealth(r.health), r.count]),
          filenameStem: t("byHealth.title"),
          generatedAt: gen,
        }}
      >
        <DistributionDonut data={healthDonut} total={total} centerLabel={t("byHealth.center")} />
      </ReportSection>

      <ReportSection
        title={t("progress.title")}
        description={t("progress.description")}
        wide
        csv={{
          headers: [t("progress.metric"), t("progress.value")],
          rows: [
            [t("progress.average"), `${avgProgress}%`],
            [t("progress.total"), total],
            [t("progress.atRisk"), atRisk.length],
          ],
          filenameStem: t("progress.title"),
          generatedAt: gen,
        }}
      >
        <StatGrid
          items={[
            { key: "avg", label: t("progress.average"), value: `${avgProgress}%` },
            { key: "total", label: t("progress.total"), value: formatCount(total, locale) },
            {
              key: "risk",
              label: t("progress.atRisk"),
              value: formatCount(atRisk.length, locale),
              tone: atRisk.length > 0 ? "destructive" : "default",
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        title={t("atRisk.title")}
        description={t("atRisk.description")}
        wide
        empty={atRisk.length === 0}
        emptyLabel={t("atRisk.empty")}
        csv={{
          headers: [
            t("atRisk.name"),
            t("atRisk.client"),
            t("atRisk.manager"),
            t("atRisk.progress"),
            t("atRisk.due"),
          ],
          rows: atRisk.map((r) => [r.name, r.clientName, r.managerName, `${r.progress}%`, formatDate(r.dueDate)]),
          filenameStem: t("atRisk.title"),
          generatedAt: gen,
        }}
      >
        <SmartTable data={atRisk} columns={riskCols} getRowId={(r) => r.id} pageSize={8} />
      </ReportSection>

      <ReportSection
        title={t("taskFlags.title")}
        description={t("taskFlags.description")}
        empty={flags.length === 0}
        emptyLabel={t("taskFlags.empty")}
        csv={{
          headers: [t("taskFlags.project"), t("taskFlags.overdue"), t("taskFlags.blocked")],
          rows: flags.map((r) => [r.projectName, r.overdue, r.blocked]),
          filenameStem: t("taskFlags.title"),
          generatedAt: gen,
        }}
      >
        <SmartTable data={flags} columns={flagCols} getRowId={(r) => r.projectId} pageSize={8} />
      </ReportSection>

      <ReportSection
        title={t("hours.title")}
        description={t("hours.description")}
        empty={hours.length === 0}
        csv={{
          headers: [t("hours.project"), t("hours.budget"), t("hours.used")],
          rows: hours.map((r) => [
            r.projectName,
            formatHours(r.budgetHours, locale),
            formatHours(r.usedHours, locale),
          ]),
          filenameStem: t("hours.title"),
          generatedAt: gen,
        }}
      >
        <DualBars
          data={hoursBars}
          series={{
            a: { label: t("hours.budget"), color: "var(--chart-2)" },
            b: { label: t("hours.used"), color: "var(--chart-1)" },
          }}
          valueFormatter={(n) => formatHours(n, locale)}
        />
      </ReportSection>

      {data.canFinance ? (
        <ReportSection
          title={t("profit.title")}
          description={t("profit.description")}
          wide
          empty={margins.length === 0}
          csv={{
            headers: [
              t("profit.project"),
              t("profit.contracted"),
              t("profit.costs"),
              t("profit.margin"),
              t("profit.ratio"),
            ],
            rows: margins.map((r) => [
              r.projectName,
              formatEUR(r.contractedCents, locale),
              formatEUR(r.costsCents, locale),
              formatEUR(r.marginCents, locale),
              formatRatio(r.marginRatio, locale),
            ]),
            filenameStem: t("profit.title"),
            generatedAt: gen,
          }}
        >
          <SmartTable data={margins} columns={marginCols} getRowId={(r) => r.projectId} pageSize={8} />
        </ReportSection>
      ) : null}
    </div>
  );
}
