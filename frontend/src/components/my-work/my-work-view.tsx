"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  TriangleAlert,
  ListTodo,
  Inbox,
  CalendarDays,
  AtSign,
  CheckCheck,
  FolderKanban,
  Timer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  EmptyState,
  SkeletonList,
  toast,
  toastWithUndo,
} from "@/components/shared";
import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { useTimer } from "@/lib/timer/timer-context";
import { myWorkApi } from "@/lib/api/my-work";
import type {
  MyMention,
  MyProject,
  MyReviewRequest,
  MyTask,
  TaskPriority,
  TaskStatus,
} from "@/lib/api/my-work-types";
import type { Role } from "@/lib/session";
import { GreetingHeader } from "./greeting-header";
import { TaskGroup } from "./task-group";
import { TaskRow } from "./task-row";
import {
  MeetingRow,
  MentionRow,
  ReviewRow,
  ProjectRow,
  TimeEntryRow,
} from "./secondary-lists";
import {
  EntityDetailPanel,
  type DetailTab,
  type DetailTarget,
} from "./entity-detail-panel";

export interface MyWorkViewProps {
  user: {
    id: string;
    name: string;
    role: Role;
    avatarUrl: string | null;
  };
}

export function MyWorkView({ user }: MyWorkViewProps) {
  const t = useTranslations("myWork");
  const qc = useQueryClient();
  const timer = useTimer();

  const queryKey = React.useMemo(
    () => ["my-work", user.id, user.role] as const,
    [user.id, user.role]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => myWorkApi.getMyWork(user.id, user.role),
  });

  const refresh = React.useCallback(
    () => qc.invalidateQueries({ queryKey }),
    [qc, queryKey]
  );

  /* ---------------- side panel ---------------- */
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelTab, setPanelTab] = React.useState<DetailTab>("details");
  const [panelTarget, setPanelTarget] = React.useState<DetailTarget | null>(null);

  const openTarget = React.useCallback((target: DetailTarget, tab: DetailTab) => {
    setPanelTarget(target);
    setPanelTab(tab);
    setPanelOpen(true);
  }, []);

  /* ---------------- mutations + undo ---------------- */
  const runWithUndo = React.useCallback(
    (opts: {
      action: () => Promise<unknown>;
      undo: () => Promise<unknown>;
      title: string;
      description?: string;
    }) => {
      opts
        .action()
        .then(refresh)
        .then(() => {
          toastWithUndo({
            tone: "success",
            title: opts.title,
            description: opts.description,
            onUndo: async () => {
              await opts.undo();
              await refresh();
            },
          });
        })
        .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
    },
    [refresh, t]
  );

  const handleComplete = React.useCallback(
    (task: MyTask) => {
      const target: TaskStatus = user.role === "membro" ? "in_review" : "done";
      const prev = task.status;
      runWithUndo({
        action: () => myWorkApi.setTaskStatus(task.id, target),
        undo: () => myWorkApi.setTaskStatus(task.id, prev),
        title:
          user.role === "membro"
            ? t("toasts.submittedReview", { task: task.title })
            : t("toasts.completed", { task: task.title }),
      });
    },
    [runWithUndo, t, user.role]
  );

  const handleSetStatus = React.useCallback(
    (task: MyTask, status: TaskStatus) => {
      const prev = task.status;
      runWithUndo({
        action: () => myWorkApi.setTaskStatus(task.id, status),
        undo: () => myWorkApi.setTaskStatus(task.id, prev),
        title: t("toasts.statusChanged", { status: t(`taskStatus.${status}`) }),
      });
    },
    [runWithUndo, t]
  );

  const handleSetPriority = React.useCallback(
    (task: MyTask, priority: TaskPriority) => {
      const prev = task.priority;
      runWithUndo({
        action: () => myWorkApi.setTaskPriority(task.id, priority),
        undo: () => myWorkApi.setTaskPriority(task.id, prev),
        title: t("toasts.priorityChanged", { priority: t(`priority.${priority}`) }),
      });
    },
    [runWithUndo, t]
  );

  const handleSetDeadline = React.useCallback(
    (task: MyTask, dueDate: string | null) => {
      const prev = task.dueDate;
      runWithUndo({
        action: () => myWorkApi.setTaskDeadline(task.id, dueDate),
        undo: () => myWorkApi.setTaskDeadline(task.id, prev),
        title: t("toasts.deadlineChanged"),
      });
    },
    [runWithUndo, t]
  );

  const handleApproveReview = React.useCallback(
    (review: MyReviewRequest) => {
      runWithUndo({
        action: () => myWorkApi.approveReview(review.id),
        undo: () => myWorkApi.restoreReview(review),
        title: t("toasts.approved", { task: review.taskTitle }),
      });
    },
    [runWithUndo, t]
  );

  /* ---------------- timer (single active — BR-040) ---------------- */
  const [pendingTimer, setPendingTimer] = React.useState<MyTask | null>(null);

  const startTimerFor = React.useCallback(
    (task: MyTask) => {
      const finished = timer.start({
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId,
        projectName: task.projectName,
      });
      if (finished) {
        const minutes = Math.max(1, Math.round(finished.durationMs / 60000));
        toast({
          tone: "info",
          title: t("timer.switchedTitle"),
          description: t("timer.switchedDescription", {
            task: finished.taskTitle,
            minutes,
          }),
        });
      }
    },
    [timer, t]
  );

  const handleStartTimer = React.useCallback(
    (task: MyTask) => {
      // Single active timer: confirm before displacing a running one.
      if (timer.active && timer.active.taskId !== task.id) {
        setPendingTimer(task);
        return;
      }
      startTimerFor(task);
    },
    [timer.active, startTimerFor]
  );

  const handleStopTimer = React.useCallback(() => {
    const finished = timer.stop();
    if (!finished) return;
    const minutes = Math.max(1, Math.round(finished.durationMs / 60000));
    toast({
      tone: "success",
      title: t("timer.stoppedTitle"),
      description: t("timer.stoppedDescription", {
        task: finished.taskTitle,
        minutes,
      }),
    });
  }, [timer, t]);

  /* ---------------- render helpers ---------------- */
  const currentUser = React.useMemo(
    () => ({ id: user.id, name: user.name, avatarUrl: user.avatarUrl }),
    [user.id, user.name, user.avatarUrl]
  );

  const renderTask = (task: MyTask) => (
    <TaskRow
      key={task.id}
      task={task}
      role={user.role}
      isTimerRunning={timer.isRunning(task.id)}
      onStartTimer={handleStartTimer}
      onStopTimer={handleStopTimer}
      onComplete={handleComplete}
      onSetStatus={handleSetStatus}
      onSetPriority={handleSetPriority}
      onSetDeadline={handleSetDeadline}
      onOpen={(tk, tab) =>
        openTarget(
          {
            title: tk.title,
            subtitle: tk.projectName,
            entityType: "task",
            entityId: tk.id,
            details: <TaskFacts task={tk} />,
          },
          tab ?? "details"
        )
      }
    />
  );

  /* ---------------- states ---------------- */
  if (isLoading) return <LoadingState />;

  if (isError || !data) {
    return (
      <div className="space-y-8">
        <PageHeader title={t("greeting.neutral", { name: firstName(user.name) })} />
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const showReviews = user.role !== "membro";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <GreetingHeader
            name={firstName(user.name)}
            todayCount={data.today.length}
            overdueCount={data.overdue.length}
            meetingsCount={data.meetings.length}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("refresh")}
          onClick={() => refetch()}
          disabled={isFetching}
          className="mt-1 shrink-0"
        >
          <RefreshCw
            className={isFetching ? "animate-spin" : undefined}
            aria-hidden
          />
        </Button>
      </div>

      {/* Primary task buckets */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TaskGroup
          title={t("groups.today")}
          icon={CalendarClock}
          count={data.today.length}
          badgeVariant="signal"
          emptyTitle={t("empty.today")}
        >
          {data.today.map(renderTask)}
        </TaskGroup>

        <TaskGroup
          title={t("groups.overdue")}
          icon={TriangleAlert}
          count={data.overdue.length}
          badgeVariant="overdue"
          emptyTitle={t("empty.overdue")}
        >
          {data.overdue.map(renderTask)}
        </TaskGroup>

        <TaskGroup
          title={t("groups.thisWeek")}
          icon={ListTodo}
          count={data.thisWeek.length}
          badgeVariant="default"
          emptyTitle={t("empty.thisWeek")}
        >
          {data.thisWeek.map(renderTask)}
        </TaskGroup>

        <TaskGroup
          title={t("groups.noDate")}
          icon={Inbox}
          count={data.noDate.length}
          badgeVariant="default"
          emptyTitle={t("empty.noDate")}
        >
          {data.noDate.map(renderTask)}
        </TaskGroup>
      </div>

      {/* Context: meetings, mentions, reviews, projects, time */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TaskGroup
          title={t("groups.meetings")}
          icon={CalendarDays}
          count={data.meetings.length}
          emptyTitle={t("empty.meetings")}
        >
          {data.meetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
        </TaskGroup>

        <TaskGroup
          title={t("groups.mentions")}
          icon={AtSign}
          count={data.mentions.length}
          emptyTitle={t("empty.mentions")}
        >
          {data.mentions.map((m) => (
            <MentionRow
              key={m.id}
              mention={m}
              onOpen={(mn: MyMention) =>
                openTarget(
                  {
                    title: mn.entityLabel,
                    subtitle: t("detail.mentionedBy", { name: mn.authorName }),
                    entityType: mn.entityType,
                    entityId: mn.entityId,
                  },
                  "comments"
                )
              }
            />
          ))}
        </TaskGroup>

        {showReviews ? (
          <TaskGroup
            title={t("groups.reviews")}
            icon={CheckCheck}
            count={data.reviewRequests.length}
            badgeVariant="due"
            emptyTitle={t("empty.reviews")}
          >
            {data.reviewRequests.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                onApprove={handleApproveReview}
                onOpen={(rv: MyReviewRequest) =>
                  openTarget(
                    {
                      title: rv.taskTitle,
                      subtitle: rv.projectName,
                      entityType: "task",
                      entityId: rv.taskId,
                    },
                    "comments"
                  )
                }
              />
            ))}
          </TaskGroup>
        ) : null}

        <TaskGroup
          title={t("groups.projects")}
          icon={FolderKanban}
          count={data.projects.length}
          emptyTitle={t("empty.projects")}
        >
          {data.projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onOpen={(pr: MyProject) =>
                openTarget(
                  {
                    title: pr.name,
                    subtitle: pr.clientName,
                    entityType: "project",
                    entityId: pr.id,
                    details: <ProjectFacts project={pr} />,
                  },
                  "details"
                )
              }
            />
          ))}
        </TaskGroup>

        <TaskGroup
          title={t("groups.recentTime")}
          icon={Timer}
          count={data.recentTimeEntries.length}
          emptyTitle={t("empty.recentTime")}
          className={showReviews ? undefined : "lg:col-span-1"}
        >
          {data.recentTimeEntries.map((e) => (
            <TimeEntryRow key={e.id} entry={e} />
          ))}
        </TaskGroup>
      </div>

      <EntityDetailPanel
        target={panelTarget}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        initialTab={panelTab}
        currentUser={currentUser}
      />

      <ConfirmDialog
        open={pendingTimer !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTimer(null);
        }}
        title={t("timer.switchConfirmTitle")}
        description={
          timer.active
            ? t("timer.switchConfirmDescription", {
                running: timer.active.taskTitle,
                next: pendingTimer?.title ?? "",
              })
            : undefined
        }
        confirmLabel={t("timer.switchConfirm")}
        onConfirm={() => {
          if (pendingTimer) startTimerFor(pendingTimer);
          setPendingTimer(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

function TaskFacts({ task }: { task: MyTask }) {
  const t = useTranslations("myWork");
  const rows: Array<[string, string]> = [
    [t("detail.project"), task.projectName],
    [t("detail.status"), t(`taskStatus.${task.status}`)],
    [t("detail.priority"), t(`priority.${task.priority}`)],
    [
      t("detail.deadline"),
      task.dueDate ? task.dueDate.split("-").reverse().join("/") : t("deadline.none"),
    ],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </React.Fragment>
      ))}
      {task.blocked && task.blockedReason ? (
        <>
          <dt className="text-status-blocked">{t("taskStatus.blocked")}</dt>
          <dd className="text-status-blocked">{task.blockedReason}</dd>
        </>
      ) : null}
    </dl>
  );
}

function ProjectFacts({ project }: { project: MyProject }) {
  const t = useTranslations("myWork");
  const rows: Array<[string, string]> = [
    [t("detail.client"), project.clientName],
    [t("detail.health"), t(`health.${project.health}`)],
    [t("detail.progress"), `${project.progress}%`],
    [t("detail.openTasks"), String(project.openTasks)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function LoadingState() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <SkeletonList rows={3} media={false} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
