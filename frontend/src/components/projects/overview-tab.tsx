"use client";

import { useTranslations } from "next-intl";
import {
  CalendarClock,
  Users,
  ListChecks,
  ShieldAlert,
  Lightbulb,
  CircleCheck,
  Circle,
  Rocket,
  CheckCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ProgressBar } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/api/projects-types";
import { PhaseStateBadge, DeliveryMilestoneBadge, TaskFlagBadge } from "./status-badges";
import { startReadiness } from "./lifecycle-actions";
import { formatDate, initials } from "./project-format";

export interface OverviewTabProps {
  project: Project;
}

/**
 * The project overview.
 *
 * Two rules keep this tab worth opening.
 *
 * It does not repeat itself. Hours and contracted value already sit in the
 * summary bar directly above; activity has a tab of its own. Cards that only
 * restated those were removed, because a reader who has to check three places
 * for the same number stops trusting any of them.
 *
 * And a card with nothing in it does not render. A column of "no description",
 * "no milestones", "no tasks needing attention", "no entries" is five frames
 * around an absence — it buries the one card that does have something to say.
 * When the whole column is quiet, that is stated once.
 */
export function OverviewTab({ project }: OverviewTabProps) {
  const t = useTranslations("projects.overview");

  const readiness = startReadiness(project);
  const showReadiness = project.state === "planning";
  const hasDescription = Boolean(project.description?.trim());
  const hasPhases = project.phases.length > 0;
  const hasAttention = project.attentionTasks.length > 0;
  const hasRisks = project.risks.length > 0;
  const hasMilestones = project.deliveryMilestones.length > 0;

  const mainIsQuiet = !showReadiness && !hasDescription && !hasPhases && !hasAttention && !hasRisks;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      {/* Main column */}
      <div className="space-y-6 lg:col-span-2">
        {hasDescription ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("descriptionTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {showReadiness ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
                {t("readiness.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
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

        {hasPhases ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("phaseProgressTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {project.phases.map((ph) => {
                // A phase marked completed is at 100%, whatever its task
                // count says. Deriving the bar purely from tasksDone/tasksTotal
                // rendered "Completed — 0%" on any phase tracked outside the
                // task list, which reads as a broken number rather than as an
                // empty one.
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
                      <PhaseStateBadge state={ph.state} />
                    </div>
                    <ProgressBar
                      value={pct}
                      tone={ph.state === "completed" ? "success" : "primary"}
                      size="sm"
                      showValue
                      aria-label={ph.name}
                    />
                    {/* Says where the number comes from, so a 0% bar is
                        legibly "nothing started" and not "something failed". */}
                    <p className="pt-0.5 text-xs text-muted-foreground">
                      {ph.tasksTotal > 0
                        ? t("phaseTasks", { done: ph.tasksDone, total: ph.tasksTotal })
                        : t("phaseNoTasks")}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {hasAttention ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-status-overdue" strokeWidth={1.8} aria-hidden />
                {t("attentionTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {project.attentionTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {task.phaseName} · {task.assigneeName}
                        {task.dueDate ? ` · ${formatDate(task.dueDate)}` : ""}
                      </p>
                    </div>
                    <TaskFlagBadge flag={task.flag} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {hasRisks ? (
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

        {mainIsQuiet ? (
          <Card>
            <CardContent className="py-2">
              <EmptyState
                icon={CheckCheck}
                title={t("quietTitle")}
                description={t("quietBody")}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Side column */}
      <div className="space-y-6 lg:col-span-1">
        {/* Team stays even when empty: "no one is assigned" is a fact about
            the project that someone needs to act on, not an absence of one. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("teamTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.team.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noTeam")}</p>
            ) : (
              <ul className="space-y-2.5">
                {project.team.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.userId === project.managerId ? t("managerLabel") : m.roleLabel}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {hasMilestones ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                {t("milestonesTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {project.deliveryMilestones.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(m.dueDate)}</p>
                    </div>
                    <DeliveryMilestoneBadge status={m.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
