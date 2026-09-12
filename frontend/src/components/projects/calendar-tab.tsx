"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, ExternalLink, Plus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { toast } from "@/components/shared";
import { projectsApi } from "@/lib/api/projects";
import type { Project, ProjectPhase, PhaseInput } from "@/lib/api/projects-types";
import { PhaseStateBadge, DeliveryMilestoneBadge } from "./status-badges";
import { PhaseFormDialog } from "./phase-form-dialog";
import { formatDate } from "./project-format";

interface AgendaEntry {
  id: string;
  label: string;
  date: string;
  kind: "phase" | "milestone";
  badge: React.ReactNode;
  /** The phase behind the row, when there is one to edit. */
  phase?: ProjectPhase;
}

/**
 * The project agenda.
 *
 * It used to say "read-only" and mean it: every row was an inert `<li>`, so
 * the tab could tell you a phase was due on the 23rd and offer no way to move
 * it. Dates are the thing people most often need to change on a schedule, and
 * the schedule is exactly where they notice.
 *
 * Rows are now the control. A phase opens the same editor the Phases tab
 * uses — one dialog, one set of validation, no second way to edit a phase
 * that drifts from the first. Delivery milestones still belong to the
 * Financials tab, so those rows say where to go rather than pretending to
 * edit something they do not own.
 */
export function CalendarTab({
  project,
  actorId,
  canManage,
  onChanged,
}: {
  project: Project;
  actorId: string;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const t = useTranslations("projects.calendarTab");
  const tPhases = useTranslations("projects.phases");
  const [editing, setEditing] = React.useState<ProjectPhase | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

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
        phase: p,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const submit = React.useCallback(
    async (input: PhaseInput) => {
      if (editing) {
        await projectsApi.updatePhase(project.id, editing.id, input, actorId);
        toast({ tone: "success", title: tPhases("toast.updated") });
      } else {
        await projectsApi.addPhase(project.id, input, actorId);
        toast({ tone: "success", title: tPhases("toast.added") });
      }
      await onChanged();
    },
    [editing, project.id, actorId, onChanged, tPhases]
  );

  function openPhase(phase: ProjectPhase) {
    setEditing(phase);
    setFormOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus aria-hidden />
            {tPhases("addPhase")}
          </Button>
        ) : null}
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
              {entries.map((e) => {
                const editable = canManage && e.phase !== undefined;
                const row = (
                  <>
                    <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {formatDate(e.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">
                      {e.label}
                    </span>
                    <span className="shrink-0">{e.badge}</span>
                  </>
                );

                return (
                  <li key={`${e.kind}-${e.id}`}>
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => openPhase(e.phase as ProjectPhase)}
                        className="glass glass-quiet group/row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                        aria-label={t("editEntry", { name: e.label })}
                      >
                        {row}
                        <Pencil
                          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100"
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      // A milestone is owned by Financials; the row says so
                      // rather than opening an editor that cannot save it.
                      <Link
                        href={`/projects/${project.id}?tab=finance`}
                        className="glass glass-quiet flex w-full items-center gap-3 rounded-xl px-3 py-2.5"
                      >
                        {row}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <PhaseFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          phase={editing}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
