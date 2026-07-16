"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  heatLevel,
  type HeatLevel,
  type TeamMemberWorkload,
} from "@/lib/api/team-types";

const WORKDAYS = 5;

/** Cell surface per intensity bucket. `over` is the BR-084 alarm zone. */
const LEVEL_CELL: Record<HeatLevel, string> = {
  empty: "bg-muted/30 text-muted-foreground/50",
  light: "bg-success-muted text-success",
  moderate: "bg-gold-muted text-gold",
  full: "bg-status-due-bg text-status-due",
  over: "bg-status-overdue-bg text-status-overdue ring-2 ring-inset ring-status-overdue/45",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export interface WorkloadHeatmapProps {
  members: TeamMemberWorkload[];
  className?: string;
}

/**
 * Weekly workload heatmap — members × weekdays. Each cell is shaded by that
 * day's allocation against the member's daily net capacity (BR-080). The
 * over-allocated (`over`) cells read as an alarm: red zone + ring + a warning
 * icon + the hours in bold, so the state never depends on colour alone
 * (WCAG AA — AUTO-09/BR-084). The grid scrolls inside its own container so the
 * page body never scrolls horizontally.
 */
export function WorkloadHeatmap({ members, className }: WorkloadHeatmapProps) {
  const t = useTranslations("team.heatmap");
  const locale = useLocale();

  const weekdayFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale]
  );
  const dayFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }),
    [locale]
  );

  // Column headers come from the first member's days (all rows share the week).
  const headerDays = members[0]?.days ?? [];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[42rem]">
          {/* Header row */}
          <div
            className="grid items-end gap-px border-b border-border bg-muted/40"
            style={{ gridTemplateColumns: `minmax(11rem,1.6fr) repeat(${WORKDAYS}, 1fr) minmax(6rem,0.9fr)` }}
          >
            <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("member")}
            </div>
            {headerDays.map((d) => {
              const date = new Date(`${d.date}T00:00:00`);
              return (
                <div key={d.date} className="px-1 py-2.5 text-center">
                  <div className="text-xs font-semibold capitalize text-foreground">
                    {weekdayFmt.format(date)}
                  </div>
                  <div className="text-[0.6875rem] tabular-nums text-muted-foreground">
                    {dayFmt.format(date)}
                  </div>
                </div>
              );
            })}
            <div className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("weekTotal")}
            </div>
          </div>

          {/* Member rows */}
          {members.map((m) => {
            const dailyCapacity = m.netCapacityHours / WORKDAYS;
            const pct = Math.round(m.utilizationRatio * 100);
            const over = m.availability === "sobrecarregado";
            return (
              <div
                key={m.userId}
                className="grid items-center gap-px border-b border-border last:border-0"
                style={{ gridTemplateColumns: `minmax(11rem,1.6fr) repeat(${WORKDAYS}, 1fr) minmax(6rem,0.9fr)` }}
              >
                {/* Member label */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-8">
                    {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`function.${m.function}`)}
                    </p>
                  </div>
                </div>

                {/* Day cells */}
                {m.days.map((d) => {
                  const level = heatLevel(d.allocatedHours, dailyCapacity);
                  const isOver = level === "over";
                  const label = t("cellLabel", {
                    name: m.name,
                    day: dayFmt.format(new Date(`${d.date}T00:00:00`)),
                    hours: d.allocatedHours,
                  });
                  return (
                    <div key={d.date} className="px-1 py-1.5">
                      <div
                        className={cn(
                          "relative flex h-11 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                          LEVEL_CELL[level],
                          isOver && "font-bold"
                        )}
                        role="img"
                        aria-label={
                          isOver ? `${label} — ${t("overAllocated")}` : label
                        }
                        title={label}
                      >
                        {isOver ? (
                          <TriangleAlert
                            className="absolute left-1 top-1 size-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                        {d.allocatedHours > 0 ? d.allocatedHours : "–"}
                      </div>
                    </div>
                  );
                })}

                {/* Week total + utilization */}
                <div className="px-3 py-3 text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      over ? "text-status-overdue" : "text-foreground"
                    )}
                  >
                    {m.allocatedHours}
                    <span className="text-xs font-normal text-muted-foreground">
                      {" / "}
                      {m.netCapacityHours}h
                    </span>
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      over ? "font-semibold text-status-overdue" : "text-muted-foreground"
                    )}
                  >
                    {t("utilizationPct", { pct })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend — non-colour cues (labels) for every intensity band. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("legend.title")}</span>
        {(
          [
            ["light", LEVEL_CELL.light],
            ["moderate", LEVEL_CELL.moderate],
            ["full", LEVEL_CELL.full],
            ["over", LEVEL_CELL.over],
          ] as const
        ).map(([key, cls]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-3.5 rounded-sm", cls)} aria-hidden />
            {t(`legend.${key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
