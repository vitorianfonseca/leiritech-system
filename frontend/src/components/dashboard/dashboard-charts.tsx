"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatEUR } from "@/components/finance/finance-format";
import type {
  ContractedReceivedPoint,
  PipelinePoint,
  ProjectStatePoint,
  TaskFlowPoint,
  TeamLoadPoint,
} from "@/lib/api/dashboard-types";

/* ------------------------------------------------------------------ *
 * Shared chrome
 * ------------------------------------------------------------------ */

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;

function useAnim(): boolean {
  // Recharts honours this per-series; we also gate it on the user preference.
  return !useReducedMotion();
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TooltipShell({
  label,
  children,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label ? (
        <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      ) : null}
      {children}
    </div>
  );
}

function ChartSkeleton({ height = 224 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-muted"
      style={{ height }}
      role="status"
      aria-live="polite"
    />
  );
}

/* ------------------------------------------------------------------ *
 * 1. Pipeline evolution (Area)
 * ------------------------------------------------------------------ */

export function PipelineEvolutionChart({
  data,
  loading,
}: {
  data: PipelinePoint[];
  loading?: boolean;
}) {
  const t = useTranslations("dashboard");
  const tm = useTranslations("dashboard.months");
  const locale = useLocale();
  const animate = useAnim();

  return (
    <ChartCard title={t("charts.pipeline.title")} description={t("charts.pipeline.subtitle")}>
      {loading ? (
        <ChartSkeleton />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="dashPipelineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => tm(m)}
                tickLine={false}
                axisLine={false}
                tick={AXIS_TICK}
              />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v / 100000)}`}
                tickLine={false}
                axisLine={false}
                tick={AXIS_TICK}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={(props: TooltipContentProps) => {
                  const p = props.payload?.[0];
                  if (!p) return null;
                  return (
                    <TooltipShell label={tm(String(props.label))}>
                      <span className="font-medium text-foreground">
                        {formatEUR(Number(p.value), locale)}
                      </span>
                    </TooltipShell>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="valueCents"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill="url(#dashPipelineFill)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--chart-1)" }}
                isAnimationActive={animate}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 2. Projects by state (Donut)
 * ------------------------------------------------------------------ */

const STATE_COLOR: Record<ProjectStatePoint["state"], string> = {
  healthy: "var(--health-healthy)",
  attention: "var(--health-attention)",
  atRisk: "var(--health-at-risk)",
};
const STATE_STATUS_KEY: Record<ProjectStatePoint["state"], string> = {
  healthy: "healthy",
  attention: "attention",
  atRisk: "atRisk",
};

export function ProjectsByStateChart({
  data,
  loading,
}: {
  data: ProjectStatePoint[];
  loading?: boolean;
}) {
  const t = useTranslations("dashboard");
  const ts = useTranslations("status");
  const animate = useAnim();
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <ChartCard title={t("charts.projectsByState.title")} description={t("charts.projectsByState.subtitle")}>
      {loading ? (
        <ChartSkeleton />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="state"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={animate}
                >
                  {data.map((entry) => (
                    <Cell key={entry.state} fill={STATE_COLOR[entry.state]} />
                  ))}
                </Pie>
                <Tooltip
                  content={(props: TooltipContentProps) => {
                    const p = props.payload?.[0];
                    if (!p) return null;
                    const state = p.payload.state as ProjectStatePoint["state"];
                    return (
                      <TooltipShell>
                        <span className="font-medium text-foreground">
                          {ts(STATE_STATUS_KEY[state])}: {p.value}
                        </span>
                      </TooltipShell>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-2xl font-semibold tabular-nums text-foreground">
                {total}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("charts.projectsByState.centerLabel")}
              </span>
            </div>
          </div>
          <ul className="flex-1 space-y-2 self-stretch">
            {data.map((entry) => (
              <li key={entry.state} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: STATE_COLOR[entry.state] }}
                    aria-hidden
                  />
                  {ts(STATE_STATUS_KEY[entry.state])}
                </span>
                <span className="font-heading font-semibold tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 3. Tasks done vs overdue (grouped Bar)
 * ------------------------------------------------------------------ */

export function TaskFlowChart({
  data,
  loading,
}: {
  data: TaskFlowPoint[];
  loading?: boolean;
}) {
  const t = useTranslations("dashboard");
  const tw = useTranslations("dashboard.weeks");
  const animate = useAnim();

  const legend = [
    { key: "done", color: "var(--chart-3)" },
    { key: "overdue", color: "var(--status-overdue)" },
  ] as const;

  return (
    <ChartCard title={t("charts.taskFlow.title")} description={t("charts.taskFlow.subtitle")}>
      {loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tickFormatter={(w: string) => tw(w)}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={32} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--accent)" }}
                  content={(props: TooltipContentProps) => {
                    if (!props.payload?.length) return null;
                    return (
                      <TooltipShell label={tw(String(props.label))}>
                        <div className="space-y-0.5">
                          {props.payload.map((p) => (
                            <div key={String(p.dataKey)} className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ background: p.color }}
                                aria-hidden
                              />
                              <span className="text-muted-foreground">
                                {t(`charts.taskFlow.series.${String(p.dataKey)}`)}
                              </span>
                              <span className="font-medium text-foreground">{p.value}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipShell>
                    );
                  }}
                />
                <Bar dataKey="done" fill="var(--chart-3)" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                <Bar dataKey="overdue" fill="var(--status-overdue)" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={legend.map((l) => ({ color: l.color, label: t(`charts.taskFlow.series.${l.key}`) }))}
          />
        </>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 4. Contracted vs received (grouped Bar) — GATED (BR-008)
 * ------------------------------------------------------------------ */

export function ContractedReceivedChart({
  data,
  loading,
}: {
  data: ContractedReceivedPoint[];
  loading?: boolean;
}) {
  const t = useTranslations("dashboard");
  const tm = useTranslations("dashboard.months");
  const locale = useLocale();
  const animate = useAnim();

  const legend = [
    { key: "contracted", color: "var(--chart-1)" },
    { key: "received", color: "var(--chart-3)" },
  ] as const;

  return (
    <ChartCard title={t("charts.contractedReceived.title")} description={t("charts.contractedReceived.subtitle")}>
      {loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => tm(m)}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                />
                <YAxis
                  tickFormatter={(v: number) => `${Math.round(v / 100000)}`}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)" }}
                  content={(props: TooltipContentProps) => {
                    if (!props.payload?.length) return null;
                    return (
                      <TooltipShell label={tm(String(props.label))}>
                        <div className="space-y-0.5">
                          {props.payload.map((p) => (
                            <div key={String(p.dataKey)} className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ background: p.color }}
                                aria-hidden
                              />
                              <span className="text-muted-foreground">
                                {t(`charts.contractedReceived.series.${String(p.dataKey).replace("Cents", "")}`)}
                              </span>
                              <span className="font-medium text-foreground">
                                {formatEUR(Number(p.value), locale)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TooltipShell>
                    );
                  }}
                />
                <Bar dataKey="contractedCents" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                <Bar dataKey="receivedCents" fill="var(--chart-3)" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={legend.map((l) => ({ color: l.color, label: t(`charts.contractedReceived.series.${l.key}`) }))}
          />
        </>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ *
 * 5. Team load distribution (horizontal Bar)
 * ------------------------------------------------------------------ */

/** Load zone thresholds → urgency tokens (over capacity reads as an alarm). */
function loadColor(pct: number): string {
  if (pct >= 100) return "var(--health-at-risk)";
  if (pct >= 85) return "var(--health-attention)";
  return "var(--health-healthy)";
}

export function TeamLoadChart({
  data,
  loading,
}: {
  data: TeamLoadPoint[];
  loading?: boolean;
}) {
  const t = useTranslations("dashboard");
  const animate = useAnim();

  return (
    <ChartCard title={t("charts.teamLoad.title")} description={t("charts.teamLoad.subtitle")}>
      {loading ? (
        <ChartSkeleton />
      ) : (
        <div className="w-full" style={{ height: Math.max(160, data.length * 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 130]}
                tickFormatter={(v: number) => `${v}%`}
                tickLine={false}
                axisLine={false}
                tick={AXIS_TICK}
              />
              <YAxis
                type="category"
                dataKey="memberName"
                width={100}
                tickLine={false}
                axisLine={false}
                tick={AXIS_TICK}
              />
              <Tooltip
                cursor={{ fill: "var(--accent)" }}
                content={(props: TooltipContentProps) => {
                  const p = props.payload?.[0];
                  if (!p) return null;
                  return (
                    <TooltipShell label={String(props.label)}>
                      <span className="font-medium text-foreground">
                        {t("charts.teamLoad.tooltip", { pct: Number(p.value) })}
                      </span>
                    </TooltipShell>
                  );
                }}
              />
              <Bar dataKey="allocationPct" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={animate}>
                {data.map((entry) => (
                  <Cell key={entry.memberId} fill={loadColor(entry.allocationPct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-full" style={{ background: it.color }} aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
