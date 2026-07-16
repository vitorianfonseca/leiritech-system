"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarClock,
  Users,
  Clock,
  ListChecks,
  ShieldAlert,
  Lightbulb,
  CircleCheck,
  Circle,
  Rocket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed, ProgressBar } from "@/components/shared";
import { cn } from "@/lib/utils";
import { projectCollaborationApi } from "@/lib/api/projects";
import type { Project } from "@/lib/api/projects-types";
import { PhaseStateBadge, DeliveryMilestoneBadge, TaskFlagBadge } from "./status-badges";
import { startReadiness } from "./lifecycle-actions";
import { formatDate, formatEUR, formatPercent, initials } from "./project-format";

export interface OverviewTabProps {
  project: Project;
  canFinance: boolean;
}

export function OverviewTab({ project, canFinance }: OverviewTabProps) {
  const t = useTranslations("projects.overview");
  const locale = useLocale();

  const hoursRatio = project.hoursBudget > 0 ? project.hoursUsed / project.hoursBudget : 0;
  const hoursOver = project.hoursUsed > project.hoursBudget;
  const readiness = startReadiness(project);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main column */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("descriptionTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {project.description || t("noDescription")}
            </p>
          </CardContent>
        </Card>

        {project.state === "planning" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="size-4 text-gold" strokeWidth={1.8} aria-hidden />
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

        {/* Phase progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("phaseProgressTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPhases")}</p>
            ) : (
              project.phases.map((ph) => {
                const p = ph.tasksTotal > 0 ? Math.round((ph.tasksDone / ph.tasksTotal) * 100) : 0;
                return (
                  <div key={ph.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{ph.name}</span>
                      <PhaseStateBadge state={ph.state} />
                    </div>
                    <ProgressBar
                      value={p}
                      tone={ph.state === "completed" ? "success" : "primary"}
                      size="sm"
                      showValue
                      aria-label={ph.name}
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Attention: overdue / blocked tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-status-overdue" strokeWidth={1.8} aria-hidden />
              {t("attentionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.attentionTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAttention")}</p>
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* Risks / decisions / next steps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-gold" strokeWidth={1.8} aria-hidden />
              {t("risksTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.risks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRisks")}</p>
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* Recent activity (#40) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("activityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed entityType="project" entityId={project.id} api={projectCollaborationApi} />
          </CardContent>
        </Card>
      </div>

      {/* Side column */}
      <div className="space-y-6 lg:col-span-1">
        {/* Next delivery milestones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("milestonesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.deliveryMilestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noMilestones")}</p>
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("hoursTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-heading text-2xl font-semibold tabular-nums text-foreground">
                {project.hoursUsed}h
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("ofBudget", { budget: project.hoursBudget })}
              </span>
            </div>
            <ProgressBar
              value={Math.min(100, Math.round(hoursRatio * 100))}
              tone={hoursOver ? "destructive" : hoursRatio > 0.85 ? "warning" : "success"}
              size="sm"
              label={t("hoursTitle")}
            />
            {hoursOver ? (
              <p className="text-xs text-status-overdue">{t("hoursOver")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{formatPercent(hoursRatio, locale)} {t("consumed")}</p>
            )}
          </CardContent>
        </Card>

        {/* Budget consumed (finance-gated) */}
        {canFinance && project.contractedValueCents != null ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("budgetTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
                {formatEUR(project.contractedValueCents, locale)}
              </p>
              <p className="text-xs text-muted-foreground">{t("contractedHint")}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Team */}
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
                      <p className="truncate text-xs text-muted-foreground">{m.roleLabel}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
