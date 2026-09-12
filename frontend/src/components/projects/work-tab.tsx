"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Layers, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TasksView } from "@/components/tasks";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";
import { PhasesTab } from "./phases-tab";

/**
 * The project's work.
 *
 * Phases and Tasks were two tabs showing the same work from two angles, and
 * neither was complete on its own: the phase list could not tell you what was
 * in a phase, and the board could not tell you which part of the project a
 * task belonged to. They are one surface now, with the phases as its spine.
 *
 * The rail is a filter first: pick a phase and the board below narrows to it,
 * which is the question someone actually has ("what is left in Conceito?").
 * Phase management — add, edit, reorder, transition, remove — sits behind
 * "Manage phases", because it is the occasional job, not the daily one.
 */
export function WorkTab({
  project,
  user,
  canManage,
  onChanged,
}: {
  project: Project;
  user: { role: Role; userId: string; name: string; avatarUrl: string | null };
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const t = useTranslations("projects.work");
  const [phaseId, setPhaseId] = React.useState<string | null>(null);
  const [managing, setManaging] = React.useState(false);

  const phases = project.phases;
  const total = phases.reduce((s, p) => s + p.tasksTotal, 0);

  return (
    <div className="space-y-5">
      {/* Phase rail */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Layers className="size-4" strokeWidth={1.8} aria-hidden />
          <span className="hidden sm:inline">{t("phasesTitle")}</span>
        </span>

        <button
          type="button"
          onClick={() => setPhaseId(null)}
          aria-pressed={phaseId === null}
          className={cn(
            "glass rounded-xl px-3 py-1.5 text-sm",
            phaseId === null ? "glass-active font-semibold" : "glass-quiet"
          )}
        >
          {t("allPhases")}
          <span className="ml-1.5 tabular-nums text-muted-foreground">{total}</span>
        </button>

        {phases.map((ph) => (
          <button
            key={ph.id}
            type="button"
            onClick={() => setPhaseId(phaseId === ph.id ? null : ph.id)}
            aria-pressed={phaseId === ph.id}
            className={cn(
              "glass rounded-xl px-3 py-1.5 text-sm",
              phaseId === ph.id ? "glass-active font-semibold" : "glass-quiet"
            )}
          >
            {ph.name}
            {/* The count is the point of the chip: a phase with nothing in it
                is the one that needs work planned, and it should say so. */}
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {ph.tasksDone}/{ph.tasksTotal}
            </span>
          </button>
        ))}

        {canManage ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setManaging((v) => !v)}
            aria-expanded={managing}
          >
            {managing ? t("hidePhases") : t("managePhases")}
            <ChevronDown
              className={cn("transition-transform", managing && "rotate-180")}
              aria-hidden
            />
          </Button>
        ) : null}
      </div>

      {managing ? (
        <PhasesTab
          project={project}
          user={user}
          canManage={canManage}
          onChanged={onChanged}
        />
      ) : null}

      <TasksView
        user={{
          id: user.userId,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl,
        }}
        projectId={project.id}
        projectName={project.name}
        phaseId={phaseId}
      />
    </div>
  );
}
