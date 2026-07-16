"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UsersRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SmartTable, type SmartTableColumn } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  AVAILABILITY_STATES,
  TEAM_FUNCTIONS,
  type TeamMemberWorkload,
} from "@/lib/api/team-types";
import { AvailabilityBadge } from "./availability-badge";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export interface TeamTableProps {
  members: TeamMemberWorkload[];
  loading?: boolean;
}

/**
 * Team roster (F13). One row per member with the workload columns: função,
 * estado (derived availability — BR-082), active projects, current tasks,
 * overdue tasks, estimated load, hours this week, weekly capacity. Search +
 * per-column filters (função, estado) + sort come from the shared SmartTable.
 */
export function TeamTable({ members, loading }: TeamTableProps) {
  const t = useTranslations("team");
  const tt = useTranslations("team.table");

  const columns = React.useMemo<SmartTableColumn<TeamMemberWorkload>[]>(
    () => [
      {
        id: "member",
        header: tt("member"),
        accessor: (m) => m.name,
        sortable: true,
        cardPriority: 0,
        cell: (m) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
              <AvatarFallback>{initials(m.name)}</AvatarFallback>
            </Avatar>
            <span className="font-medium text-foreground">{m.name}</span>
          </div>
        ),
      },
      {
        id: "function",
        header: tt("function"),
        accessor: (m) => t(`heatmap.function.${m.function}`),
        sortable: true,
        cardPriority: 3,
        filterOptions: TEAM_FUNCTIONS.map((fn) => ({
          label: t(`heatmap.function.${fn}`),
          value: t(`heatmap.function.${fn}`),
        })),
        cell: (m) => (
          <span className="text-muted-foreground">{t(`heatmap.function.${m.function}`)}</span>
        ),
      },
      {
        id: "availability",
        header: tt("availability"),
        accessor: (m) => t(`availability.${m.availability}`),
        cardPriority: 1,
        filterOptions: AVAILABILITY_STATES.map((s) => ({
          label: t(`availability.${s}`),
          value: t(`availability.${s}`),
        })),
        cell: (m) => <AvailabilityBadge state={m.availability} note={m.awayNote} />,
      },
      {
        id: "activeProjects",
        header: tt("activeProjects"),
        accessor: (m) => m.activeProjects,
        sortable: true,
        align: "right",
        cardPriority: 4,
        cell: (m) => <span className="tabular-nums">{m.activeProjects}</span>,
      },
      {
        id: "openTasks",
        header: tt("openTasks"),
        accessor: (m) => m.openTasks,
        sortable: true,
        align: "right",
        cardPriority: 5,
        cell: (m) => <span className="tabular-nums">{m.openTasks}</span>,
      },
      {
        id: "overdueTasks",
        header: tt("overdueTasks"),
        accessor: (m) => m.overdueTasks,
        sortable: true,
        align: "right",
        cardPriority: 6,
        cell: (m) => (
          <span
            className={cn(
              "tabular-nums",
              m.overdueTasks > 0 ? "font-semibold text-status-overdue" : "text-muted-foreground"
            )}
          >
            {m.overdueTasks}
          </span>
        ),
      },
      {
        id: "allocated",
        header: tt("allocated"),
        accessor: (m) => m.allocatedHours,
        sortable: true,
        align: "right",
        cardPriority: 2,
        cell: (m) => (
          <span className="tabular-nums text-foreground">{tt("hours", { n: m.allocatedHours })}</span>
        ),
      },
      {
        id: "logged",
        header: tt("logged"),
        accessor: (m) => m.loggedHours,
        sortable: true,
        align: "right",
        cardPriority: 7,
        cell: (m) => (
          <span className="tabular-nums text-muted-foreground">
            {tt("hours", { n: m.loggedHours })}
          </span>
        ),
      },
      {
        id: "capacity",
        header: tt("capacity"),
        accessor: (m) => m.weeklyCapacityHours,
        sortable: true,
        align: "right",
        cardPriority: 8,
        cell: (m) => (
          <span className="tabular-nums text-muted-foreground">
            {tt("hours", { n: m.weeklyCapacityHours })}
          </span>
        ),
      },
    ],
    [t, tt]
  );

  return (
    <SmartTable
      data={members}
      columns={columns}
      getRowId={(m) => m.userId}
      loading={loading}
      searchPlaceholder={tt("searchPlaceholder")}
      emptyIcon={UsersRound}
      emptyTitle={tt("emptyTitle")}
      emptyDescription={tt("emptyDescription")}
      pageSize={12}
    />
  );
}
