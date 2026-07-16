"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  PlayCircle,
  PauseCircle,
  PlayCircle as ResumeIcon,
  CheckCircle2,
  XCircle,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, toast, toastWithUndo } from "@/components/shared";
import { projectsApi } from "@/lib/api/projects";
import {
  canCancelProject,
  ProjectError,
  type Project,
  type ProjectLifecycleAction,
} from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";
import { ReasonDialog } from "./reason-dialog";

export interface LifecycleActionsProps {
  project: Project;
  user: { role: Role; userId: string };
  onChanged: () => void;
}

/** Planning→active readiness (§1.3, BR-037) — surfaced as a checklist too. */
export function startReadiness(p: Project) {
  const items = [
    { key: "phase", ok: p.phases.length >= 1 },
    { key: "member", ok: p.team.length >= 1 },
    { key: "milestones", ok: p.paymentMilestonesConfirmed },
  ] as const;
  return { ready: items.every((i) => i.ok), items };
}

export function LifecycleActions({ project, user, onChanged }: LifecycleActionsProps) {
  const t = useTranslations("projects.actions");
  const tErr = useTranslations("projects.errors");

  const isOwner = project.managerId === user.userId;
  const canManage = user.role === "admin" || (user.role === "gestor" && isOwner);
  const canCancel = canCancelProject(user.role, isOwner);

  const [pauseOpen, setPauseOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [resumeOpen, setResumeOpen] = React.useState(false);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const readiness = startReadiness(project);
  const openPhases = project.phases.filter((ph) => ph.state !== "completed").length;

  const run = React.useCallback(
    async (
      action: ProjectLifecycleAction,
      opts: { reason?: string; undo?: boolean } = {}
    ) => {
      const prevState = project.state;
      try {
        await projectsApi.transition(project.id, { action, reason: opts.reason }, user.userId);
        onChanged();
        if (opts.undo) {
          toastWithUndo({
            tone: "warning",
            title: t(`toast.${action}`),
            onUndo: async () => {
              await projectsApi.restoreState(project.id, prevState, user.userId);
              onChanged();
            },
          });
        } else {
          toast({ tone: "success", title: t(`toast.${action}`) });
        }
      } catch (error) {
        const detail =
          error instanceof ProjectError && error.detailKey ? error.detailKey : undefined;
        const code = error instanceof ProjectError ? error.code : "network";
        toast({ tone: "destructive", title: detail ? tErr(`guard.${detail}`) : tErr(code) });
      }
    },
    [project.id, project.state, user.userId, onChanged, t, tErr]
  );

  if (!canManage) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {project.state === "planning" ? (
        <Button
          size="sm"
          disabled={!readiness.ready}
          title={readiness.ready ? undefined : t("startBlockedHint")}
          onClick={() => run("start")}
        >
          <PlayCircle aria-hidden />
          {t("start")}
        </Button>
      ) : null}

      {project.state === "active" ? (
        <Button variant="outline" size="sm" onClick={() => setPauseOpen(true)}>
          <PauseCircle aria-hidden />
          {t("pause")}
        </Button>
      ) : null}

      {project.state === "on_hold" ? (
        <Button size="sm" onClick={() => setResumeOpen(true)}>
          <ResumeIcon aria-hidden />
          {t("resume")}
        </Button>
      ) : null}

      {project.state === "active" || project.state === "on_hold" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={openPhases > 0}
          title={openPhases > 0 ? t("completeBlockedHint") : undefined}
          onClick={() => setCompleteOpen(true)}
        >
          <CheckCircle2 aria-hidden />
          {t("complete")}
        </Button>
      ) : null}

      {(project.state === "planning" ||
        project.state === "active" ||
        project.state === "on_hold") &&
      canCancel ? (
        <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
          <XCircle aria-hidden />
          {t("cancel")}
        </Button>
      ) : null}

      {project.state === "completed" || project.state === "cancelled" ? (
        <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
          <Archive aria-hidden />
          {t("archive")}
        </Button>
      ) : null}

      {/* Reason-capturing dialogs (pause / cancel) */}
      <ReasonDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title={t("pauseDialog.title")}
        description={t("pauseDialog.description")}
        label={t("pauseDialog.label")}
        placeholder={t("pauseDialog.placeholder")}
        confirmLabel={t("pause")}
        onConfirm={(reason) => run("pause", { reason })}
      />
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        variant="destructive"
        title={t("cancelDialog.title")}
        description={t("cancelDialog.description")}
        label={t("cancelDialog.label")}
        placeholder={t("cancelDialog.placeholder")}
        confirmLabel={t("cancelDialog.confirm")}
        onConfirm={(reason) => run("cancel", { reason, undo: true })}
      />

      {/* Confirmations (resume / complete / archive) */}
      <ConfirmDialog
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        title={t("resumeDialog.title")}
        description={t("resumeDialog.description")}
        confirmLabel={t("resume")}
        onConfirm={() => run("resume")}
      />
      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title={t("completeDialog.title")}
        description={t("completeDialog.description")}
        confirmLabel={t("complete")}
        onConfirm={() => run("complete")}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        variant="destructive"
        title={t("archiveDialog.title")}
        description={t("archiveDialog.description")}
        confirmLabel={t("archive")}
        onConfirm={() => run("archive", { undo: true })}
      />
    </div>
  );
}
