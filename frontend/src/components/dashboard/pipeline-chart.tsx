"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const DATA = [
  { month: "Jan", value: 42 },
  { month: "Fev", value: 55 },
  { month: "Mar", value: 48 },
  { month: "Abr", value: 71 },
  { month: "Mai", value: 66 },
  { month: "Jun", value: 89 },
  { month: "Jul", value: 104 },
];

export function PipelineChart() {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={DATA} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.625rem",
              fontSize: "0.8125rem",
              color: "var(--popover-foreground)",
              boxShadow: "var(--shadow-md)",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(v) => [`${v} k€`, "Pipeline"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--gold)"
            strokeWidth={2.5}
            fill="url(#pipelineFill)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--gold)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
