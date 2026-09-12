"use client";

import { useTranslations, useLocale } from "next-intl";
import {
  CalendarClock,
  ShieldAlert,
  Lightbulb,
  CircleCheck,
  Circle,
  Rocket,
  Pencil,
  Plus,
  ArrowRight,
  Wallet,
  Clock,
  ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/api/projects-types";
import { PhaseStateBadge, DeliveryMilestoneBadge, TaskFlagBadge } from "./status-badges";
import { startReadiness } from "./lifecycle-actions";
import { TeamCard } from "./team-card";
import { formatDate, formatEUR, formatPercent } from "./project-format";

export interface OverviewTabProps {
  project: Project;
  canManage: boolean;
  canFinance: boolean;
  /** Opens the project editor — the one place these fields are written. */
  onEdit: () => void;
  /** Refetch after a write made from inside a card. */
  onChanged: () => Promise<void> | void;
  /** Jump to a task on the Work tab. */
  onOpenTask: (taskId: string) => void;
  /** Switch to another tab — every summary here is a doorway to one. */
  onGoToTab: (tab: string) => void;
}

/** Whole days from today to an ISO date. Negative once it has passed. */
function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${iso}T00:00:00`);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The project overview.
 *
 * An overview summarises — that is the job, and the repetition is the point,
 * provided every card is a doorway to the tab that owns the thing. An earlier
 * pass applied a no-duplication rule here and gutted the page: it removed the
 * phase summary and left a description, a roster, and an empty state claiming
 * the project had no phases while four sat one tab away.
 *
 * So the page answers, in order: what needs a person right now, how far along
 * the work is, what is due next, who is on it, and where the money stands.
 * A section with nothing to say does not render; one that is empty but
 * actionable — no phases at all — offers the action instead.
 */
export function OverviewTab({
  project,
  canManage,
  canFinance,
  onEdit,
  onChanged,
  onOpenTask,
  onGoToTab,
}: OverviewTabProps) {
  const t = useTranslations("projects.overview");
  const tEdit = useTranslations("projects.editDialog");
  const locale = useLocale();

  const readiness = startReadiness(project);
  const hasDescription = Boolean(project.description?.trim());
  const attention = project.attentionTasks;

  const done = project.phases.reduce((s, p) => s + p.tasksDone, 0);
  const totalTasks = project.phases.reduce((s, p) => s + p.tasksTotal, 0);

  // Phases and delivery milestones share one horizon, because "what is due
  // next" does not care which kind of thing it is.
  const deadlines = [
    ...project.phases
      .filter((p) => p.dueDate && p.state !== "completed")
      .map((p) => ({
        id: `phase-${p.id}`,
        label: p.name,
        date: p.dueDate as string,
        kind: t("kindPhase"),
        badge: <PhaseStateBadge state={p.state} />,
      })),
    ...project.deliveryMilestones
      .filter((m) => m.status !== "met")
      .map((m) => ({
        id: `ms-${m.id}`,
        label: m.name,
        date: m.dueDate,
        kind: t("kindMilestone"),
        badge: <DeliveryMilestoneBadge status={m.status} />,
      })),
  ]
    .filter((d) => daysUntil(d.date) <= 30)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  const hoursRatio = project.hoursBudget > 0 ? project.hoursUsed / project.hoursBudget : 0;

  function due(iso: string): string {
    const d = daysUntil(iso);
    if (d === 0) return t("dueToday");
    if (d < 0) return t("overdueBy", { days: Math.abs(d) });
    return t("dueIn", { days: d });
  }

  return (
    <div className="space-y-6">
      {/* 1. What needs a person. First because it is the only urgent thing
             here, and the reason to open this tab at all. */}
      {attention.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-status-overdue" strokeWidth={1.8} aria-hidden />
              {t("attentionTitle")}
              <Badge variant="overdue">{attention.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 md:grid-cols-2">
              {attention.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="glass glass-quiet flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[task.phaseName, task.assigneeName].filter(Boolean).join(" · ")}
                        {task.dueDate ? ` · ${due(task.dueDate)}` : ""}
                      </p>
                    </div>
                    <TaskFlagBadge flag={task.flag} />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {project.state === "planning" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
              {t("readiness.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {readiness.items.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  {item.ok ? (
                    <CircleCheck className="size-4 shrink-0 text-success" strokeWidth={1.8} aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                  )}
                  <span className={cn(item.ok ? "text-foreground" : "text-muted-foreground")}>
                    {t(`readiness.${item.key}`)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {readiness.ready ? t("readiness.ready") : t("readiness.blocked")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* 2. How far along, and 3. what is due next. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("phasesTitle")}
                {totalTasks > 0 ? (
                  <span className="text-sm font-normal tabular-nums text-muted-foreground">
                    {done}/{totalTasks}
                  </span>
                ) : null}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onGoToTab("tasks")}>
                {t("openWork")}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {project.phases.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("noPhases")}</p>
                {canManage ? (
                  <Button variant="outline" size="sm" onClick={() => onGoToTab("tasks")}>
                    <Plus aria-hidden />
                    {t("addFirstPhase")}
                  </Button>
                ) : null}
              </div>
            ) : (
              project.phases.map((ph) => {
                // A phase marked completed is at 100% whatever its task count
                // says, so the bar never contradicts the badge beside it.
                const pct =
                  ph.state === "completed"
                    ? 100
                    : ph.tasksTotal > 0
                      ? Math.round((ph.tasksDone / ph.tasksTotal) * 100)
                      : 0;
                return (
                  <div key={ph.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{ph.name}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {ph.tasksDone}/{ph.tasksTotal}
                        </span>
                        <PhaseStateBadge state={ph.state} />
                      </div>
                    </div>
                    <ProgressBar
                      value={pct}
                      tone={ph.state === "completed" ? "success" : "primary"}
                      size="sm"
                      aria-label={ph.name}
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("deadlinesTitle")}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onGoToTab("calendar")}>
                {t("openCalendar")}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDeadlines")}</p>
            ) : (
              <ul className="space-y-2.5">
                {deadlines.map((d) => {
                  const late = daysUntil(d.date) < 0;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{d.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.kind} · {formatDate(d.date)} ·{" "}
                          <span className={cn(late && "font-medium text-status-overdue")}>
                            {due(d.date)}
                          </span>
                        </p>
                      </div>
                      <span className="shrink-0">{d.badge}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Who is on it, and 5. where the effort and money stand. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TeamCard
          project={project}
          canManage={canManage}
          onChanged={onChanged}
          className="h-full"
        />

        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("hoursTitle")}
              </CardTitle>
              {canFinance ? (
                <Button variant="ghost" size="sm" onClick={() => onGoToTab("finance")}>
                  {t("openFinance")}
                  <ArrowRight aria-hidden />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.hoursBudget > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-heading text-2xl font-semibold tabular-nums">
                    {project.hoursUsed}h
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("hoursOf", { budget: project.hoursBudget })}
                  </span>
                </div>
                <ProgressBar
                  value={Math.min(100, Math.round(hoursRatio * 100))}
                  tone={hoursRatio > 1 ? "destructive" : "primary"}
                  size="sm"
                  aria-label={t("hoursTitle")}
                />
                <p className="text-xs text-muted-foreground">{formatPercent(hoursRatio, locale)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hoursNoBudget")}</p>
            )}

            {/* BR-008: the figure is null for a caller without finance access,
                so the block simply does not render for them. */}
            {canFinance && project.contractedValueCents !== null ? (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("moneyTitle")}
                </p>
                <p className="mt-1.5 flex items-baseline gap-2">
                  <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                  <span className="font-heading text-xl font-semibold tabular-nums">
                    {formatEUR(project.contractedValueCents, locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">{t("contracted")}</span>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* 6. The written context, last: reference, not a signal. */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{t("descriptionTitle")}</CardTitle>
            {canManage ? (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil aria-hidden />
                {tEdit("edit")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {hasDescription ? (
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {project.description}
            </p>
          ) : canManage ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Plus aria-hidden />
              {tEdit("addDescription")}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noDescription")}</p>
          )}
        </CardContent>
      </Card>

      {/* Risks have no backend endpoint yet, so the card appears only when a
          project actually carries them. */}
      {project.risks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
              {t("risksTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {project.risks.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  <Badge
                    variant={r.kind === "risk" ? "warning" : r.kind === "decision" ? "info" : "outline"}
                    className="mt-0.5 shrink-0"
                  >
                    {t(`riskKind.${r.kind}`)}
                  </Badge>
                  <span className="text-foreground">{r.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
