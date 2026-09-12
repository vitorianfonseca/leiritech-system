"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { CalendarView } from "@/components/calendar";
import { toast } from "@/components/shared";
import { projectsApi } from "@/lib/api/projects";
import type { Project, PhaseInput } from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";
import { PhaseFormDialog } from "./phase-form-dialog";

/**
 * The project calendar.
 *
 * This tab used to render a hand-built "agenda": four phase dates in a list,
 * which is a worse phase list than the one on the Work tab and not a calendar
 * at all — no month, no tasks, no meetings, nothing to click but the rows it
 * already showed elsewhere.
 *
 * The real calendar has taken a `projectId` and an `embedded` flag since it
 * was written, explicitly for this tab. It was simply never wired. Using it
 * means the project's month shows everything with a date on it — tasks,
 * meetings, phase deadlines, delivery and payment milestones — from the same
 * source the global calendar reads, so the two can never disagree.
 */
export function CalendarTab({
  project,
  user,
  actorId,
  canManage,
  onChanged,
}: {
  project: Project;
  user: { role: Role; userId: string };
  actorId: string;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const t = useTranslations("projects.calendarTab");
  const tPhases = useTranslations("projects.phases");
  const [formOpen, setFormOpen] = React.useState(false);

  const submit = React.useCallback(
    async (input: PhaseInput) => {
      await projectsApi.addPhase(project.id, input, actorId);
      toast({ tone: "success", title: tPhases("toast.added") });
      await onChanged();
    },
    [project.id, actorId, onChanged, tPhases]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canManage ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus aria-hidden />
            {tPhases("addPhase")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/calendar" />}>
          {t("openCalendar")}
          <ExternalLink aria-hidden />
        </Button>
      </div>

      <CalendarView
        user={{ id: user.userId, role: user.role }}
        projectId={project.id}
        embedded
      />

      {canManage ? (
        <PhaseFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          phase={null}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
