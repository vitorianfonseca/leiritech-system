"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, TriangleAlert, Clock, BarChart3, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ConfirmDialog, toast, toastWithUndo } from "@/components/shared";
import { cn } from "@/lib/utils";
import { timeApi } from "@/lib/api/time";
import {
  canViewTeamTime,
  type CreateTimeEntryInput,
  type RollupDimension,
  type TimeEntry,
  type TimeScope,
  type UpdateTimeEntryInput,
  TimeError,
} from "@/lib/api/time-types";
import type { Role } from "@/lib/session";
import { SummaryCards } from "./summary-cards";
import { ActiveTimerCard } from "./active-timer-card";
import { ManualEntryDialog } from "./manual-entry-dialog";
import { TimeEntriesTable } from "./time-entries-table";
import { RollupsPanel } from "./rollups-panel";

export interface TimeViewProps {
  user: { id: string; name: string; role: Role; avatarUrl: string | null };
}

type Panel = "entries" | "rollups";

/** Time-tracking workspace (F11 / issue #35). */
export function TimeView({ user }: TimeViewProps) {
  const t = useTranslations("time");
  const tErr = useTranslations("time.errors");
  const qc = useQueryClient();
  const { id: userId, role } = user;
  const canTeam = canViewTeamTime(role);

  const [scope, setScope] = React.useState<TimeScope>("own");
  const [panel, setPanel] = React.useState<Panel>("entries");
  const [dimension, setDimension] = React.useState<RollupDimension>("project");

  const entriesKey = React.useMemo(
    () => ["time-entries", userId, role, scope] as const,
    [userId, role, scope]
  );
  const rollupsKey = React.useMemo(
    () => ["time-rollups", userId, role, scope, dimension] as const,
    [userId, role, scope, dimension]
  );

  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: () => timeApi.listEntries(role, userId, scope),
  });
  const rollupsQuery = useQuery({
    queryKey: rollupsKey,
    queryFn: () => timeApi.getRollups(role, userId, scope, dimension),
    enabled: panel === "rollups",
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["time-entries"] });
    qc.invalidateQueries({ queryKey: ["time-rollups"] });
  }, [qc]);

  const entries = entriesQuery.data?.entries ?? [];
  const totals = entriesQuery.data?.totals ?? {
    totalMinutes: 0,
    billableMinutes: 0,
    nonBillableMinutes: 0,
    entryCount: 0,
  };

  /* ---------------- manual entry (create + edit) ---------------- */
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TimeEntry | null>(null);

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);
  const openEdit = React.useCallback((entry: TimeEntry) => {
    setEditing(entry);
    setDialogOpen(true);
  }, []);

  const handleCreate = React.useCallback(
    async (input: CreateTimeEntryInput) => {
      try {
        await timeApi.createEntry(input, userId);
        refresh();
        toast({ tone: "success", title: t("toasts.created") });
      } catch (err) {
        toast({ tone: "destructive", title: tErr("saveFailed"), description: errDetail(err, tErr) });
        throw err;
      }
    },
    [userId, refresh, t, tErr]
  );

  const handleUpdate = React.useCallback(
    async (id: string, input: UpdateTimeEntryInput) => {
      try {
        await timeApi.updateEntry(id, input, userId);
        refresh();
        toast({ tone: "success", title: t("toasts.updated") });
      } catch (err) {
        toast({ tone: "destructive", title: tErr("saveFailed"), description: errDetail(err, tErr) });
        throw err;
      }
    },
    [userId, refresh, t, tErr]
  );

  /* ---------------- delete (confirm + undo) ---------------- */
  const [deleteTarget, setDeleteTarget] = React.useState<TimeEntry | null>(null);

  const handleDelete = React.useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;
    await timeApi.deleteEntry(target.id, userId);
    refresh();
    toastWithUndo({
      tone: "default",
      title: t("toasts.deleted"),
      description: target.taskTitle,
      onUndo: async () => {
        await timeApi.restoreEntry(target);
        refresh();
      },
    });
  }, [deleteTarget, userId, refresh, t]);

  const isError = entriesQuery.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            <span className="hidden sm:inline">{t("addEntry")}</span>
            <span className="sm:hidden">{t("addEntryShort")}</span>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <ActiveTimerCard userId={userId} onLogged={refresh} />
        <div className="lg:pt-0">
          <SummaryCards totals={totals} loading={entriesQuery.isLoading} />
        </div>
      </div>

      {/* Scope + panel controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label={t("panelLabel")} className="inline-flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {(["entries", "rollups"] as const).map((key) => {
            const active = key === panel;
            const Icon = key === "entries" ? Clock : BarChart3;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPanel(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                {t(`panels.${key}`)}
              </button>
            );
          })}
        </div>

        {canTeam ? (
          <div role="tablist" aria-label={t("scopeLabel")} className="inline-flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {(["own", "team"] as const).map((key) => {
              const active = key === scope;
              const Icon = key === "own" ? User : Users;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScope(key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                  {t(`scopes.${key}`)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={tErr("loadTitle")}
          description={tErr("loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => entriesQuery.refetch()}>
              <RefreshCw aria-hidden />
              {tErr("retry")}
            </Button>
          }
        />
      ) : panel === "entries" ? (
        <TimeEntriesTable
          entries={entries}
          loading={entriesQuery.isLoading}
          currentUserId={userId}
          showUser={scope === "team"}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      ) : (
        <RollupsPanel
          rows={rollupsQuery.data ?? []}
          loading={rollupsQuery.isLoading}
          dimension={dimension}
          onDimensionChange={setDimension}
        />
      )}

      <ManualEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        variant="destructive"
        title={t("delete.title")}
        description={t("delete.description")}
        confirmLabel={t("delete.confirm")}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function errDetail(err: unknown, tErr: (key: string) => string): string {
  if (err instanceof TimeError && err.detailKey) {
    try {
      return tErr(err.detailKey);
    } catch {
      return tErr("saveFailed");
    }
  }
  return tErr("saveFailed");
}
