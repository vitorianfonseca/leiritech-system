"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  ShieldAlert,
  Lightbulb,
  CircleCheck,
  Circle,
  Rocket,
  CheckCheck,
  Pencil,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/api/projects-types";
import { DeliveryMilestoneBadge, TaskFlagBadge } from "./status-badges";
import { startReadiness } from "./lifecycle-actions";
import { formatDate } from "./project-format";
import { TeamCard } from "./team-card";

export interface OverviewTabProps {
  project: Project;
  canManage: boolean;
  /** Opens the project editor — the one place these fields are written. */
  onEdit: () => void;
  /** Refetch after a write made from inside a card. */
  onChanged: () => Promise<void> | void;
}

/**
 * A block of the overview, and how much width it wants.
 *
 * "narrow" is a short list that reads fine in half the width; "wide" needs the
 * full measure (progress bars, task rows). The layout below turns these hints
 * into rows, which is what keeps the page from leaving a dead gutter.
 */
interface Block {
  key: string;
  width: "narrow" | "wide";
  render: (full: boolean) => ReactNode;
}

/**
 * Pack blocks into rows: two narrow blocks share a row, a wide block takes one
 * to itself, and a narrow block with no partner is widened rather than left
 * beside an empty half.
 *
 * A fixed two-column grid cannot do this. Its side column runs out of content
 * long before the main one does, and the result is a tall white margin down
 * the right of the page whose size depends on data the layout never sees.
 */
function pack(blocks: Block[]): Block[][] {
  const rows: Block[][] = [];
  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (block.width === "narrow" && next?.width === "narrow") {
      rows.push([block, next]);
      i += 2;
    } else {
      rows.push([block]);
      i += 1;
    }
  }
  return rows;
}

/**
 * The project overview.
 *
 * Three rules keep this tab worth opening.
 *
 * It does not repeat itself. Hours and contracted value already sit in the
 * summary bar directly above; activity has a tab of its own.
 *
 * A card with nothing in it does not render. A column of "no description",
 * "no milestones", "no tasks needing attention", "no entries" is four frames
 * around an absence, and it buries the one card that does have something to
 * say. When the whole tab is quiet, that is stated once.
 *
 * And what does render reaches both edges. See `pack` above.
 */
export function OverviewTab({ project, canManage, onEdit, onChanged }: OverviewTabProps) {
  const t = useTranslations("projects.overview");
  const tEdit = useTranslations("projects.editDialog");

  const readiness = startReadiness(project);
  const hasDescription = Boolean(project.description?.trim());
  const hasMilestones = project.deliveryMilestones.length > 0;

  const blocks: Block[] = [];

  if (hasDescription || canManage) {
    blocks.push({
      key: "description",
      width: "wide",
      render: () => (
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
            ) : (
              // An empty description on a project someone can edit is a
              // prompt, not a dead end.
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Plus aria-hidden />
                {tEdit("addDescription")}
              </Button>
            )}
          </CardContent>
        </Card>
      ),
    });
  }

  if (project.state === "planning") {
    blocks.push({
      key: "readiness",
      width: "narrow",
      render: (full) => (
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
              {t("readiness.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className={cn("space-y-2", full && "sm:flex sm:flex-wrap sm:gap-x-8 sm:space-y-0")}>
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
      ),
    });
  }

  // Team stays even when empty: nobody assigned is a fact someone has to act
  // on, not the absence of one. The card owns its own assign/unassign.
  blocks.push({
    key: "team",
    width: "narrow",
    render: () => (
      <TeamCard
        project={project}
        canManage={canManage}
        onChanged={onChanged}
        className="h-full"
      />
    ),
  });

  if (hasMilestones) {
    blocks.push({
      key: "milestones",
      width: "narrow",
      render: (full) => (
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("milestonesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className={cn("space-y-2.5", full && "grid gap-x-8 gap-y-3 space-y-0 sm:grid-cols-2 lg:grid-cols-3")}>
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
      ),
    });
  }

  if (project.attentionTasks.length > 0) {
    blocks.push({
      key: "attention",
      width: "wide",
      render: () => (
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
      ),
    });
  }

  if (project.risks.length > 0) {
    blocks.push({
      key: "risks",
      width: "wide",
      render: () => (
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
      ),
    });
  }

  // Only the team card survives when a project has no phases, no tasks in
  // trouble and nothing written down — say so once instead of tiling frames.
  const quiet = blocks.filter((b) => b.key !== "description").length === 1;

  return (
    <div className="space-y-6">
      {pack(blocks).map((row) => (
        <div
          key={row.map((b) => b.key).join("-")}
          className={cn("grid gap-6", row.length === 2 && "lg:grid-cols-2")}
        >
          {row.map((b) => (
            <div key={b.key}>{b.render(row.length === 1)}</div>
          ))}
        </div>
      ))}

      {quiet ? (
        <Card>
          <CardContent className="py-2">
            <EmptyState icon={CheckCheck} title={t("quietTitle")} description={t("quietBody")} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
