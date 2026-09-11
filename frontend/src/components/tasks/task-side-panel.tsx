"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  Play,
  Square,
  Link2,
  Ban,
  ShieldAlert,
  ArrowRight,
  MessageSquare,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DetailSidePanel,
  SearchableCombobox,
  CommentThread,
  ProgressBar,
  ConfirmDialog,
  toast,
} from "@/components/shared";
import { cn } from "@/lib/utils";
import { useTimer, formatElapsed } from "@/lib/timer/timer-context";
import { tasksApi, taskCollaborationApi, TASK_DIRECTORY, phaseOptions } from "@/lib/api/tasks";
import {
  TASK_STATES,
  TASK_PRIORITIES,
  checkTaskTransition,
  TaskError,
  type Task,
  type TaskPriority,
  type TaskState,
} from "@/lib/api/tasks-types";
import type { Role } from "@/lib/session";
import { StateBadge, DueLabel, formatDueDate } from "./task-meta";
import { AssigneePicker } from "./assignee-picker";

type PanelTab = "details" | "comments";

export interface TaskSidePanelProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  userId: string;
  currentUser: { id: string; name: string; avatarUrl: string | null };
  /** All visible tasks — powers the dependency picker. */
  allTasks: Task[];
  canEdit: boolean;
  /** Refresh the list query after a mutation. */
  onChanged: () => void;
  /** Delegates a state change to the parent (runs §1.6 guard + block reason + undo). */
  onRequestTransition: (task: Task, toState: TaskState) => void;
  onUnblock: (task: Task) => void;
}

/** Side-panel task detail (F10) built on the shared DetailSidePanel (#7). */
export function TaskSidePanel(props: TaskSidePanelProps) {
  const { task, open, onOpenChange } = props;
  const t = useTranslations("tasks");

  return (
    <DetailSidePanel
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="w-full sm:max-w-lg md:max-w-xl"
      header={
        task ? (
          <div className="min-w-0">
            <StateBadge state={task.state} className="mb-1.5" />
            <p className="truncate text-sm text-muted-foreground">
              {task.projectName}
              {task.phaseName ? <span aria-hidden> · {task.phaseName}</span> : null}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("panel.loading")}</p>
        )
      }
    >
      {task ? <PanelBody key={task.id} {...props} task={task} /> : null}
    </DetailSidePanel>
  );
}

function PanelBody({
  task,
  role,
  userId,
  currentUser,
  allTasks,
  canEdit,
  onChanged,
  onRequestTransition,
  onUnblock,
}: TaskSidePanelProps & { task: Task }) {
  const t = useTranslations("tasks");
  const timer = useTimer();
  const [tab, setTab] = React.useState<PanelTab>("details");
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        setBusy(true);
        await fn();
        onChanged();
      } catch (err) {
        const detail =
          err instanceof TaskError && err.detailKey
            ? t(`transitionErrors.${err.detailKey}`)
            : t("errors.actionFailed");
        toast({ tone: "destructive", title: detail });
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t]
  );

  /* ---------------- inline title / description ---------------- */
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(task.title);
  const [editingDesc, setEditingDesc] = React.useState(false);
  const [descDraft, setDescDraft] = React.useState(task.description);

  function saveTitle() {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === task.title) {
      setTitleDraft(task.title);
      return;
    }
    run(() => tasksApi.updateTask(task.id, { title: next }, userId));
  }

  function saveDesc() {
    setEditingDesc(false);
    if (descDraft === task.description) return;
    run(() => tasksApi.updateTask(task.id, { description: descDraft }, userId));
  }

  /* ---------------- transitions ---------------- */
  const availableTransitions = React.useMemo(
    () =>
      TASK_STATES.filter((s) => s !== task.state).filter(
        (s) => checkTaskTransition(task, s, role).ok || s === "blocked"
      ),
    [task, role]
  );

  /* ---------------- timer (single active — BR-040) ---------------- */
  const running = timer.isRunning(task.id);
  const [switchConfirmOpen, setSwitchConfirmOpen] = React.useState(false);

  function startTimerNow() {
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
        title: t("timer.switched", { task: finished.taskTitle, minutes }),
      });
    } else {
      toast({ tone: "success", title: t("timer.started") });
    }
  }

  function handleTimer() {
    if (running) {
      const finished = timer.stop();
      if (finished) {
        const minutes = Math.max(1, Math.round(finished.durationMs / 60000));
        toast({ tone: "success", title: t("timer.stopped", { minutes }) });
      }
      return;
    }
    // Single active timer (BR-040): confirm before displacing a running one —
    // mirrors my-work-view.tsx / active-timer-card.tsx.
    if (timer.active && timer.active.taskId !== task.id) {
      setSwitchConfirmOpen(true);
      return;
    }
    startTimerNow();
  }

  /* ---------------- checklist ---------------- */
  const [newItem, setNewItem] = React.useState("");
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const checklistTotal = task.checklist.length;

  function addChecklist(e: React.FormEvent) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    setNewItem("");
    run(() => tasksApi.addChecklistItem(task.id, text, userId));
  }

  /* ---------------- dependencies ---------------- */
  const dependencyCandidates = React.useMemo(
    () =>
      allTasks
        .filter(
          (o) =>
            o.id !== task.id &&
            !task.dependencies.some((d) => d.id === o.id)
        )
        .map((o) => ({ value: o.id, label: o.title })),
    [allTasks, task]
  );

  return (
    <div className="space-y-6">
      {/* Title (inline edit) */}
      <div>
        {editingTitle ? (
          <div className="flex items-start gap-2">
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              aria-label={t("panel.titleLabel")}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitleDraft(task.title);
                  setEditingTitle(false);
                }
              }}
            />
            <Button size="icon-sm" variant="ghost" aria-label={t("panel.save")} onClick={saveTitle}>
              <Check aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("panel.cancel")}
              onClick={() => {
                setTitleDraft(task.title);
                setEditingTitle(false);
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="group flex items-start gap-2">
            <h1 className="font-heading min-w-0 flex-1 text-xl font-semibold text-foreground">
              {task.title}
            </h1>
            {canEdit ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("panel.editTitle")}
                onClick={() => {
                  setTitleDraft(task.title);
                  setEditingTitle(true);
                }}
              >
                <Pencil aria-hidden />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Blocked banner (BR-046) */}
      {task.state === "blocked" ? (
        <div className="flex items-start gap-2 rounded-xl border border-status-blocked/40 bg-status-blocked-bg px-3 py-2.5 text-sm text-status-blocked">
          <Ban className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("state.blocked")}</p>
            {task.blockedReason ? (
              <p className="opacity-90">{task.blockedReason}</p>
            ) : null}
          </div>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onUnblock(task)}
            >
              {t("panel.unblock")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Dependency gating hint (BR-045) */}
      {task.hasUnresolvedDependencies && task.state !== "blocked" ? (
        <div className="flex items-start gap-2 rounded-xl border border-status-due/40 bg-status-due-bg px-3 py-2.5 text-sm text-status-due">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
          <p className="min-w-0 flex-1">{t("panel.dependencyGate")}</p>
        </div>
      ) : null}

      {/* Actions: transitions + timer */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit &&
            availableTransitions.map((state) => {
              const isBlock = state === "blocked";
              return (
                <Button
                  key={state}
                  size="sm"
                  variant={isBlock ? "outline" : "default"}
                  disabled={busy}
                  onClick={() => onRequestTransition(task, state)}
                >
                  {isBlock ? (
                    <Ban aria-hidden />
                  ) : (
                    <ArrowRight aria-hidden />
                  )}
                  {t(`panel.moveTo.${state}`)}
                </Button>
              );
            })}
        </div>
        <Button
          variant={running ? "destructive" : "outline"}
          size="sm"
          onClick={handleTimer}
          className="w-full sm:w-auto"
        >
          {running ? <Square aria-hidden /> : <Play aria-hidden />}
          {running
            ? t("timer.stop", { elapsed: formatElapsed(timer.elapsedMs) })
            : t("timer.start")}
        </Button>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label={t("panel.tabsLabel")} className="flex gap-1 border-b border-border">
        {(["details", "comments"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === key
                ? "border-gold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {key === "details" ? (
              <ListChecks className="size-4" strokeWidth={1.8} aria-hidden />
            ) : (
              <MessageSquare className="size-4" strokeWidth={1.8} aria-hidden />
            )}
            {t(`panel.tabs.${key}`)}
            {key === "comments" && task.commentCount > 0 ? (
              <Badge variant="default">{task.commentCount}</Badge>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <div className="space-y-6">
          {/* Description */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("panel.descriptionLabel")}</Label>
              {canEdit && !editingDesc ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("panel.editDescription")}
                  onClick={() => {
                    setDescDraft(task.description);
                    setEditingDesc(true);
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
              ) : null}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  aria-label={t("panel.descriptionLabel")}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDescDraft(task.description);
                      setEditingDesc(false);
                    }}
                  >
                    {t("panel.cancel")}
                  </Button>
                  <Button size="sm" onClick={saveDesc}>
                    {t("panel.save")}
                  </Button>
                </div>
              </div>
            ) : task.description ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">{task.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">{t("panel.noDescription")}</p>
            )}
          </section>

          <Separator />

          {/* Meta grid */}
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label={t("panel.fields.priority")}>
              {canEdit ? (
                <SearchableCombobox
                  items={TASK_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
                  value={task.priority}
                  onValueChange={(v) =>
                    run(() =>
                      tasksApi.updateTask(
                        task.id,
                        { priority: (v as TaskPriority) ?? task.priority },
                        userId
                      )
                    )
                  }
                  aria-label={t("panel.fields.priority")}
                />
              ) : (
                <span className="text-sm">{t(`priority.${task.priority}`)}</span>
              )}
            </Field>

            <Field label={t("panel.fields.due")}>
              {canEdit ? (
                <Input
                  type="date"
                  value={task.dueDate ?? ""}
                  onChange={(e) =>
                    run(() =>
                      tasksApi.updateTask(
                        task.id,
                        { dueDate: e.target.value || null },
                        userId
                      )
                    )
                  }
                />
              ) : task.dueDate ? (
                <DueLabel dueDate={task.dueDate} className="text-sm" />
              ) : (
                <span className="text-sm text-muted-foreground">{t("due.none")}</span>
              )}
            </Field>

            <Field label={t("panel.fields.phase")}>
              {canEdit ? (
                <SearchableCombobox
                  items={phaseOptions(task.projectId).map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  value={task.phaseId}
                  onValueChange={(v) =>
                    run(() => tasksApi.updateTask(task.id, { phaseId: v }, userId))
                  }
                  placeholder={t("panel.fields.phasePlaceholder")}
                  aria-label={t("panel.fields.phase")}
                />
              ) : (
                <span className="text-sm">{task.phaseName ?? "—"}</span>
              )}
            </Field>

            <Field label={t("panel.fields.assignees")}>
              <AssigneePicker
                directory={TASK_DIRECTORY}
                value={task.assignees.map((a) => a.userId)}
                onChange={(ids) =>
                  run(() => tasksApi.updateTask(task.id, { assigneeIds: ids }, userId))
                }
                disabled={!canEdit}
              />
            </Field>
          </section>

          <Separator />

          {/* Checklist */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <ListChecks className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("panel.checklist.title")}
              </Label>
              {checklistTotal > 0 ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("panel.checklist.progress", { done: checklistDone, total: checklistTotal })}
                </span>
              ) : null}
            </div>

            {checklistTotal > 0 ? (
              <ProgressBar
                value={checklistTotal === 0 ? 0 : (checklistDone / checklistTotal) * 100}
                aria-label={t("panel.checklist.title")}
              />
            ) : null}

            <ul className="space-y-1">
              {task.checklist.map((item) => (
                <li key={item.id} className="group flex items-center gap-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.done}
                    disabled={!canEdit || busy}
                    onClick={() =>
                      run(() => tasksApi.toggleChecklistItem(task.id, item.id, userId))
                    }
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      item.done
                        ? "border-status-done bg-status-done text-status-done-bg"
                        : "border-input hover:border-gold"
                    )}
                  >
                    {item.done ? <Check className="size-3" strokeWidth={2.5} aria-hidden /> : null}
                  </button>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-sm",
                      item.done && "text-muted-foreground line-through"
                    )}
                  >
                    {item.text}
                  </span>
                  {canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("panel.checklist.remove")}
                      disabled={busy}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() =>
                        run(() => tasksApi.removeChecklistItem(task.id, item.id, userId))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>

            {task.checklist.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("panel.checklist.empty")}</p>
            ) : null}

            {canEdit ? (
              <form onSubmit={addChecklist} className="flex gap-2">
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder={t("panel.checklist.addPlaceholder")}
                  aria-label={t("panel.checklist.addPlaceholder")}
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!newItem.trim() || busy}>
                  <Plus aria-hidden />
                  {t("panel.checklist.add")}
                </Button>
              </form>
            ) : null}
          </section>

          <Separator />

          {/* Dependencies (BR-045 / BR-047) */}
          <section className="space-y-3">
            <Label className="flex items-center gap-1.5">
              <Link2 className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("panel.dependencies.title")}
            </Label>

            <ul className="space-y-1.5">
              {task.dependencies.map((dep) => (
                <li
                  key={dep.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5"
                >
                  <StateBadge state={dep.state} />
                  <span className="min-w-0 flex-1 truncate text-sm">{dep.title}</span>
                  {dep.resolved ? (
                    <Badge variant="done">{t("panel.dependencies.resolved")}</Badge>
                  ) : (
                    <Badge variant="due">{t("panel.dependencies.pending")}</Badge>
                  )}
                  {canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("panel.dependencies.remove")}
                      disabled={busy}
                      onClick={() =>
                        run(() => tasksApi.removeDependency(task.id, dep.id, userId))
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>

            {task.dependencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("panel.dependencies.empty")}</p>
            ) : null}

            {canEdit ? (
              <SearchableCombobox
                items={dependencyCandidates}
                value={null}
                onValueChange={(v) => {
                  if (v) run(() => tasksApi.addDependency(task.id, v, userId));
                }}
                placeholder={t("panel.dependencies.addPlaceholder")}
                aria-label={t("panel.dependencies.addPlaceholder")}
              />
            ) : null}
          </section>

          <Separator />

          <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>
              <dt className="font-medium">{t("panel.fields.created")}</dt>
              <dd>{formatDueDate(task.createdAt.slice(0, 10))}</dd>
            </div>
            <div>
              <dt className="font-medium">{t("panel.fields.updated")}</dt>
              <dd>{formatDueDate(task.updatedAt.slice(0, 10))}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <CommentThread
          entityType="task"
          entityId={task.id}
          currentUser={currentUser}
          api={taskCollaborationApi}
        />
      )}

      <ConfirmDialog
        open={switchConfirmOpen}
        onOpenChange={setSwitchConfirmOpen}
        title={t("timer.switchConfirmTitle")}
        description={
          timer.active
            ? t("timer.switchConfirmDescription", {
                running: timer.active.taskTitle,
                next: task.title,
              })
            : undefined
        }
        confirmLabel={t("timer.switchConfirm")}
        onConfirm={() => {
          startTimerNow();
          setSwitchConfirmOpen(false);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
