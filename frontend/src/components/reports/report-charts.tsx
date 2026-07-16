"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer,
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
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Shared chrome (mirrors dashboard-charts.tsx so both read as one system)
 * ------------------------------------------------------------------ */

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;

function useAnim(): boolean {
  return !useReducedMotion();
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

export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
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

export interface Datum {
  key: string;
  label: string;
  value: number;
  color: string;
}

/* ------------------------------------------------------------------ *
 * Distribution donut (by state / by health) + accessible legend
 * ------------------------------------------------------------------ */

export function DistributionDonut({
  data,
  total,
  centerLabel,
  valueFormatter = (n) => String(n),
}: {
  data: Datum[];
  total: number;
  centerLabel: string;
  valueFormatter?: (n: number) => string;
}) {
  const animate = useAnim();
  const nonZero = data.filter((d) => d.value > 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={nonZero.length > 0 ? nonZero : data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={animate}
            >
              {(nonZero.length > 0 ? nonZero : data).map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={(props: TooltipContentProps) => {
                const p = props.payload?.[0];
                if (!p) return null;
                const d = p.payload as Datum;
                return (
                  <TooltipShell>
                    <span className="font-medium text-foreground">
                      {d.label}: {valueFormatter(d.value)}
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
            {centerLabel}
          </span>
        </div>
      </div>
      <ul className="flex-1 space-y-2 self-stretch">
        {data.map((entry) => (
          <li key={entry.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: entry.color }}
                aria-hidden
              />
              {entry.label}
            </span>
            <span className="font-heading font-semibold tabular-nums">
              {valueFormatter(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Single-series vertical bars (stage counts, lost reasons, sources)
 * ------------------------------------------------------------------ */

export function CountBars({
  data,
  valueFormatter = (n) => String(n),
  yTickFormatter,
  height = 224,
}: {
  data: Datum[];
  valueFormatter?: (n: number) => string;
  yTickFormatter?: (n: number) => string;
  height?: number;
}) {
  const animate = useAnim();
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            interval={0}
            tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={yTickFormatter ? 52 : 36}
            allowDecimals={false}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            content={(props: TooltipContentProps) => {
              const p = props.payload?.[0];
              if (!p) return null;
              const d = p.payload as Datum;
              return (
                <TooltipShell label={d.label}>
                  <span className="font-medium text-foreground">{valueFormatter(d.value)}</span>
                </TooltipShell>
              );
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={animate}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Horizontal bars (time by project, member utilization)
 * ------------------------------------------------------------------ */

export function HBars({
  data,
  valueFormatter = (n) => String(n),
  domainMax,
}: {
  data: Datum[];
  valueFormatter?: (n: number) => string;
  domainMax?: number;
}) {
  const animate = useAnim();
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            domain={domainMax ? [0, domainMax] : [0, "auto"]}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v: number) => valueFormatter(v)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            content={(props: TooltipContentProps) => {
              const p = props.payload?.[0];
              if (!p) return null;
              const d = p.payload as Datum;
              return (
                <TooltipShell label={d.label}>
                  <span className="font-medium text-foreground">{valueFormatter(d.value)}</span>
                </TooltipShell>
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={animate}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Grouped two-series bars (monthly contracted/received, hours est/used)
 * ------------------------------------------------------------------ */

export interface DualPoint {
  label: string;
  a: number;
  b: number;
}

export function DualBars({
  data,
  series,
  valueFormatter = (n) => String(n),
  yTickFormatter,
  height = 224,
}: {
  data: DualPoint[];
  series: { a: { label: string; color: string }; b: { label: string; color: string } };
  valueFormatter?: (n: number) => string;
  yTickFormatter?: (n: number) => string;
  height?: number;
}) {
  const animate = useAnim();
  return (
    <>
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              interval={0}
              tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
            />
            <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={yTickFormatter ? 52 : 40}
            tickFormatter={yTickFormatter}
          />
            <Tooltip
              cursor={{ fill: "var(--accent)" }}
              content={(props: TooltipContentProps) => {
                if (!props.payload?.length) return null;
                return (
                  <TooltipShell label={String(props.label)}>
                    <div className="space-y-0.5">
                      {props.payload.map((p) => (
                        <div key={String(p.dataKey)} className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              background: p.dataKey === "a" ? series.a.color : series.b.color,
                            }}
                            aria-hidden
                          />
                          <span className="text-muted-foreground">
                            {p.dataKey === "a" ? series.a.label : series.b.label}
                          </span>
                          <span className="font-medium text-foreground">
                            {valueFormatter(Number(p.value))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </TooltipShell>
                );
              }}
            />
            <Bar dataKey="a" fill={series.a.color} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
            <Bar dataKey="b" fill={series.b.color} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { color: series.a.color, label: series.a.label },
          { color: series.b.color, label: series.b.label },
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Compact stat row (used for conversion rate, won/lost, avg-to-close)
 * ------------------------------------------------------------------ */

export function StatGrid({
  items,
  className,
}: {
  items: { key: string; label: string; value: string; tone?: "default" | "success" | "destructive" }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.key} className="rounded-lg border border-border bg-muted/30 p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {it.label}
          </dt>
          <dd
            className={cn(
              "mt-1 font-heading text-xl font-semibold tabular-nums text-foreground sm:text-2xl",
              it.tone === "success" && "text-success",
              it.tone === "destructive" && "text-destructive"
            )}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
