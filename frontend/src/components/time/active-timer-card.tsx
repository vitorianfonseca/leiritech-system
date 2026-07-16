"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Play, Square, TimerReset, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SearchableCombobox,
  ConfirmDialog,
  toast,
} from "@/components/shared";
import { BillableToggle } from "./billable-toggle";
import { useTimer, formatElapsed } from "@/lib/timer/timer-context";
import { timeApi, timeTaskOptions } from "@/lib/api/time";
import { TimeError } from "@/lib/api/time-types";
import type { StoppedTimer } from "@/lib/timer/types";

export interface ActiveTimerCardProps {
  userId: string;
  /** Refresh the entries/rollups queries after a segment is logged. */
  onLogged: () => void;
}

/**
 * Start/stop control on the Time surface built on the SHARED single-active
 * timer (BR-040 — `useTimer`, owned by #27). Starting a new timer while one runs
 * stops the current one; we surface a confirm first, then persist the finished
 * segment as a time entry. Timing is blocked for tasks on paused/closed projects
 * (BR-042), and a running timer whose project is no longer active is flagged.
 */
export function ActiveTimerCard({ userId, onLogged }: ActiveTimerCardProps) {
  const t = useTranslations("time.activeTimer");
  const tErr = useTranslations("time.errors");
  const timer = useTimer();

  const tasks = React.useMemo(() => timeTaskOptions(), []);
  const activeTaskIds = React.useMemo(
    () => new Set(tasks.filter((task) => task.projectActive).map((task) => task.taskId)),
    [tasks]
  );

  const items = React.useMemo(
    () =>
      tasks.map((task) => ({
        value: task.taskId,
        label: task.projectActive
          ? task.taskTitle
          : `${task.taskTitle} · ${task.projectName}`,
        disabled: !task.projectActive,
      })),
    [tasks]
  );

  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [billable, setBillable] = React.useState(true);
  const [switchOpen, setSwitchOpen] = React.useState(false);

  /** The finished segment carries the billable flag chosen for that run. */
  const persist = React.useCallback(
    async (finished: StoppedTimer, wasBillable: boolean) => {
      try {
        await timeApi.timerStop(
          {
            taskId: finished.taskId,
            startedAt: finished.startedAt,
            endedAt: finished.endedAt,
            billable: wasBillable,
          },
          userId
        );
        const minutes = Math.max(1, Math.round(finished.durationMs / 60000));
        toast({
          tone: "success",
          title: t("logged.title"),
          description: t("logged.description", { task: finished.taskTitle, minutes }),
        });
        onLogged();
      } catch (err) {
        const detail =
          err instanceof TimeError && err.detailKey
            ? tErr(err.detailKey)
            : tErr("logFailed");
        toast({ tone: "destructive", title: tErr("logFailed"), description: detail });
      }
    },
    [userId, onLogged, t, tErr]
  );

  const beginTask = React.useCallback(() => {
    if (!selectedTaskId) return;
    const task = tasks.find((task) => task.taskId === selectedTaskId);
    if (!task || !task.projectActive) return;
    const finished = timer.start({
      taskId: task.taskId,
      taskTitle: task.taskTitle,
      projectId: task.projectId,
      projectName: task.projectName,
    });
    if (finished) void persist(finished, billable);
    else toast({ tone: "info", title: t("started", { task: task.taskTitle }) });
  }, [selectedTaskId, tasks, timer, persist, billable, t]);

  function handleStart() {
    if (!selectedTaskId || timer.active?.taskId === selectedTaskId) return;
    if (timer.active) {
      setSwitchOpen(true); // BR-040 confirm before stopping the running one.
      return;
    }
    beginTask();
  }

  function handleStop() {
    const finished = timer.stop();
    if (finished) void persist(finished, billable);
  }

  const runningProjectInactive =
    timer.active != null && !activeTaskIds.has(timer.active.taskId);

  const nextLabel =
    tasks.find((task) => task.taskId === selectedTaskId)?.taskTitle ?? "";

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      aria-label={t("regionLabel")}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-gold-muted">
          <TimerReset className="size-4 text-gold" strokeWidth={1.8} aria-hidden />
        </span>
        <h2 className="font-heading text-base font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>

      {timer.active ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="relative flex size-2.5 shrink-0 items-center justify-center"
              aria-hidden
            >
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-gold/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-gold" />
            </span>
            <span
              className="font-mono text-2xl font-semibold tabular-nums text-foreground"
              role="timer"
            >
              {formatElapsed(timer.elapsedMs)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {timer.active.taskTitle}
              </p>
              {timer.active.projectName ? (
                <p className="truncate text-xs text-muted-foreground">
                  {timer.active.projectName}
                </p>
              ) : null}
            </div>
          </div>

          {runningProjectInactive ? (
            <div className="flex items-start gap-2 rounded-xl border border-status-due/40 bg-status-due-bg px-3 py-2.5 text-sm text-status-due">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
              <p className="min-w-0 flex-1">{t("projectFrozen")}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <BillableToggle value={billable} onChange={setBillable} />
            <Button variant="destructive" onClick={handleStop} className="ml-auto">
              <Square className="fill-current" strokeWidth={0} aria-hidden />
              {t("stop")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label>{t("taskLabel")}</Label>
            <SearchableCombobox
              items={items}
              value={selectedTaskId}
              onValueChange={setSelectedTaskId}
              placeholder={t("taskPlaceholder")}
              aria-label={t("taskLabel")}
            />
            <p className="text-xs text-muted-foreground">{t("taskHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BillableToggle value={billable} onChange={setBillable} />
            <Button
              onClick={handleStart}
              disabled={!selectedTaskId || !activeTaskIds.has(selectedTaskId ?? "")}
              className="ml-auto"
            >
              <Play aria-hidden />
              {t("start")}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        title={t("switch.title")}
        description={t("switch.description", {
          running: timer.active?.taskTitle ?? "",
          next: nextLabel,
        })}
        confirmLabel={t("switch.confirm")}
        onConfirm={beginTask}
      />
    </section>
  );
}
