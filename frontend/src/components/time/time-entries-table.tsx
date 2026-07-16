"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Trash2, Timer, Hand, Clock } from "lucide-react";
import {
  SmartTable,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { BillableBadge } from "./billable-toggle";
import { formatDateShort, formatHours } from "./time-format";
import type { TimeEntry } from "@/lib/api/time-types";

export interface TimeEntriesTableProps {
  entries: TimeEntry[];
  loading?: boolean;
  /** Current user — edit/delete are gated to their own entries. */
  currentUserId: string;
  /** Show the author column (team scope). */
  showUser: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}

/** Entries table (F11) built on the shared SmartTable — search/sort/paginate. */
export function TimeEntriesTable({
  entries,
  loading,
  currentUserId,
  showUser,
  onEdit,
  onDelete,
}: TimeEntriesTableProps) {
  const t = useTranslations("time.table");
  const locale = useLocale();

  const columns = React.useMemo<SmartTableColumn<TimeEntry>[]>(() => {
    const cols: SmartTableColumn<TimeEntry>[] = [
      {
        id: "date",
        header: t("columns.date"),
        accessor: (r) => r.startedAt,
        sortable: true,
        cardPriority: 2,
        cell: (r) => (
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            {formatDateShort(r.startedAt, locale)}
          </span>
        ),
      },
      {
        id: "task",
        header: t("columns.task"),
        accessor: (r) => r.taskTitle,
        sortable: true,
        cardPriority: 0,
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{r.taskTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.projectName}
              {r.phaseName ? <span aria-hidden> · {r.phaseName}</span> : null}
            </p>
          </div>
        ),
      },
    ];

    if (showUser) {
      cols.push({
        id: "user",
        header: t("columns.user"),
        accessor: (r) => r.userName,
        sortable: true,
        cardPriority: 4,
        filterOptions: uniqueUsers(entries),
        cell: (r) => <span className="text-sm text-foreground">{r.userName}</span>,
      });
    }

    cols.push(
      {
        id: "billable",
        header: t("columns.billable"),
        accessor: (r) => (r.billable ? "billable" : "nonBillable"),
        filterOptions: [
          { label: t("filters.billable"), value: "billable" },
          { label: t("filters.nonBillable"), value: "nonBillable" },
        ],
        align: "center",
        cardPriority: 3,
        cell: (r) => <BillableBadge billable={r.billable} />,
      },
      {
        id: "source",
        header: t("columns.source"),
        accessor: (r) => r.source,
        align: "center",
        defaultHidden: true,
        cell: (r) => (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {r.source === "timer" ? (
              <Timer className="size-3.5" strokeWidth={1.8} aria-hidden />
            ) : (
              <Hand className="size-3.5" strokeWidth={1.8} aria-hidden />
            )}
            {t(`source.${r.source}`)}
          </span>
        ),
      },
      {
        id: "duration",
        header: t("columns.duration"),
        accessor: (r) => r.durationMinutes,
        sortable: true,
        align: "right",
        cardPriority: 1,
        cell: (r) => (
          <span className="whitespace-nowrap font-medium tabular-nums text-foreground">
            {formatHours(r.durationMinutes, locale)}
          </span>
        ),
      }
    );

    return cols;
  }, [t, locale, showUser, entries]);

  const rowActions = React.useCallback(
    (row: TimeEntry): RowAction<TimeEntry>[] => {
      if (row.userId !== currentUserId) return [];
      return [
        { label: t("actions.edit"), icon: Pencil, onSelect: onEdit },
        {
          label: t("actions.delete"),
          icon: Trash2,
          variant: "destructive",
          onSelect: onDelete,
        },
      ];
    },
    [currentUserId, onEdit, onDelete, t]
  );

  return (
    <SmartTable
      data={entries}
      columns={columns}
      getRowId={(r) => r.id}
      loading={loading}
      searchPlaceholder={t("searchPlaceholder")}
      rowActions={rowActions}
      pageSize={10}
      emptyIcon={Clock}
      emptyTitle={t("empty.title")}
      emptyDescription={t("empty.description")}
    />
  );
}

function uniqueUsers(entries: TimeEntry[]): { label: string; value: string }[] {
  const map = new Map<string, string>();
  for (const e of entries) map.set(e.userName, e.userName);
  return [...map.values()].map((name) => ({ label: name, value: name }));
}
