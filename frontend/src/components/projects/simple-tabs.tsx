"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Paperclip,
  ListTodo,
  CalendarDays,
  ExternalLink,
  FileText,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed, CommentThread, EmptyState } from "@/components/shared";
import { projectCollaborationApi } from "@/lib/api/projects";
import type { Project } from "@/lib/api/projects-types";
import { PhaseStateBadge, DeliveryMilestoneBadge, TaskFlagBadge } from "./status-badges";
import { formatDate } from "./project-format";

/* --------------------------- Tarefas (summary) --------------------------- */

/**
 * Read-only task summary. Full task management ships in #34; this surfaces the
 * per-phase counts and the attention list, and links to a working destination
 * (My Work) — never a dead link or 500.
 */
export function TasksTab({ project }: { project: Project }) {
  const t = useTranslations("projects.tasksTab");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("summaryNote")}</p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/my-work" />}>
          {t("openMyWork")}
          <ArrowRight aria-hidden />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            {t("byPhase")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPhases")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {project.phases.map((ph) => (
                <li key={ph.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm text-foreground">{ph.name}</span>
                    <PhaseStateBadge state={ph.state} />
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {t("count", { done: ph.tasksDone, total: ph.tasksTotal })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {project.attentionTasks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("attention")}</CardTitle>
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
                    </p>
                  </div>
                  <TaskFlagBadge flag={task.flag} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/* --------------------------- Calendário (summary) --------------------------- */

interface AgendaEntry {
  id: string;
  label: string;
  date: string;
  kind: "milestone" | "phase";
  badge: React.ReactNode;
}

export function CalendarTab({ project }: { project: Project }) {
  const t = useTranslations("projects.calendarTab");

  const entries: AgendaEntry[] = [
    ...project.deliveryMilestones.map((m) => ({
      id: m.id,
      label: m.name,
      date: m.dueDate,
      kind: "milestone" as const,
      badge: <DeliveryMilestoneBadge status={m.status} />,
    })),
    ...project.phases
      .filter((p) => p.dueDate)
      .map((p) => ({
        id: p.id,
        label: p.name,
        date: p.dueDate as string,
        kind: "phase" as const,
        badge: <PhaseStateBadge state={p.state} />,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("summaryNote")}</p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/calendar" />}>
          {t("openCalendar")}
          <ExternalLink aria-hidden />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            {t("agenda")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li
                  key={`${e.kind}-${e.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDate(e.date)}
                    </span>
                    <span className="truncate text-sm text-foreground">{e.label}</span>
                    <Badge variant="outline">{t(`kind.${e.kind}`)}</Badge>
                  </div>
                  {e.badge}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------- Ficheiros (mock) --------------------------- */

// Dates computed once at module load (never during render — purity rule).
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
const MOCK_FILES = [
  { id: "f1", name: "Briefing_inicial.pdf", size: "1,2 MB", dateIso: daysAgoIso(18) },
  { id: "f2", name: "Guia_de_estilo_v2.pdf", size: "3,8 MB", dateIso: daysAgoIso(5) },
];

export function FilesTab({ project }: { project: Project }) {
  const t = useTranslations("projects.filesTab");
  // A tiny deterministic mock so the tab reads as real without F17 wired.
  const hasFiles = project.state !== "planning";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasFiles ? (
          <EmptyState
            variant="bare"
            icon={Paperclip}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <ul className="divide-y divide-border">
            {MOCK_FILES.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-4" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.size} · {formatDate(f.dateIso)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted-foreground">{t("comingSoon")}</p>
      </CardContent>
    </Card>
  );
}

/* --------------------------- Atividade --------------------------- */

export function ActivityTab({
  project,
  currentUser,
}: {
  project: Project;
  currentUser?: { id: string; name: string; avatarUrl: string | null };
}) {
  const t = useTranslations("projects.activityTab");
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            entityType="project"
            entityId={project.id}
            api={projectCollaborationApi}
            currentUser={currentUser}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("timelineTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed entityType="project" entityId={project.id} api={projectCollaborationApi} />
        </CardContent>
      </Card>
    </div>
  );
}
