"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowLeft,
  Building2,
  RefreshCw,
  TriangleAlert,
  FolderKanban,
  PauseCircle,
  XCircle,
  Archive,
  Sparkles,
  Pencil,
  LayoutGrid,
  ListTodo,
  Layers,
  CalendarDays,
  Paperclip,
  History,
  Wallet,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState, GithubIssuesPanel, ProgressBar, SkeletonCard, toast } from "@/components/shared";
import { cn } from "@/lib/utils";
import { crmRoutes } from "@/lib/api/crm";
import { projectsApi } from "@/lib/api/projects";
import {
  ProjectError,
  canManageProject,
  canSeeProjectFinance,
  effectiveHealth,
  isLiveState,
  type Project,
  type ProjectHealth,
} from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";
import { HealthBadge, ProjectStateBadge } from "./status-badges";
import { LifecycleActions } from "./lifecycle-actions";
import { HealthDialog } from "./health-dialog";
import { OverviewTab } from "./overview-tab";
import { PhasesTab } from "./phases-tab";
import { FinanceiroTab } from "./financeiro-tab";
import { CalendarTab, ActivityTab } from "./simple-tabs";
import { FilesTab } from "./files-tab";
import { TasksView } from "@/components/tasks";
import { formatDate, formatEUR, initials } from "./project-format";

export interface ProjectDetailViewProps {
  projectId: string;
  user: {
    role: Role;
    userId: string;
    paymentsGrant: boolean;
    name: string;
    avatarUrl: string | null;
  };
}

export function ProjectDetailView({ projectId, user }: ProjectDetailViewProps) {
  const t = useTranslations("projects.detail");
  const tTabs = useTranslations("projects.tabs");
  const tHealth = useTranslations("projects.health");
  const locale = useLocale();
  const qc = useQueryClient();

  const queryKey = [
    "projects",
    "detail",
    projectId,
    user.role,
    user.userId,
    user.paymentsGrant,
  ] as const;
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => projectsApi.getProject(projectId, user.role, user.userId, user.paymentsGrant),
    retry: (count, err) => !(err instanceof ProjectError) && count < 1,
  });

  const [tab, setTab] = React.useState("overview");
  const [healthOpen, setHealthOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["collaboration"] });
  }, [qc]);

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-8 w-72 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    const notFound =
      error instanceof ProjectError && (error.code === "not_found" || error.code === "forbidden");
    return (
      <div className="space-y-6">
        <BackLink label={t("back")} />
        <EmptyState
          icon={notFound ? FolderKanban : TriangleAlert}
          title={notFound ? t("notFoundTitle") : t("errorTitle")}
          description={notFound ? t("notFoundDescription") : t("errorDescription")}
          action={
            notFound ? (
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/projects" />}>
                {t("backToList")}
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={() => refetch()}>
                <RefreshCw aria-hidden />
                {t("retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const project: Project = data;
  const isOwner = project.managerId === user.userId;
  const canManage = canManageProject(user.role, isOwner);
  const canFinance = canSeeProjectFinance(user.role, user.paymentsGrant);
  const live = isLiveState(project.state);
  const suggestedHint =
    live && project.publishedHealth !== null && project.publishedHealth !== project.suggestedHealth;
  const isArchived = project.state === "archived";
  const canComment = canManage || project.team.some((m) => m.userId === user.userId);

  async function publishHealth(health: ProjectHealth, reason: string) {
    try {
      await projectsApi.publishHealth(project.id, { health, reason: reason || undefined }, user.userId);
      await refresh();
      toast({ tone: "success", title: t("healthPublished") });
    } catch (err) {
      const code = err instanceof ProjectError ? err.code : "network";
      toast({ tone: "destructive", title: t(code === "reason_required" ? "healthReasonRequired" : "healthError") });
      throw err;
    }
  }

  const tabItems: Array<{ value: string; label: string; icon: typeof LayoutGrid }> = [
    { value: "overview", label: tTabs("overview"), icon: LayoutGrid },
    { value: "tasks", label: tTabs("tasks"), icon: ListTodo },
    { value: "phases", label: tTabs("phases"), icon: Layers },
    { value: "calendar", label: tTabs("calendar"), icon: CalendarDays },
    { value: "files", label: tTabs("files"), icon: Paperclip },
    { value: "activity", label: tTabs("activity"), icon: History },
    { value: "github", label: tTabs("github"), icon: Bug },
    ...(canFinance ? [{ value: "finance", label: tTabs("finance"), icon: Wallet }] : []),
  ];

  return (
    <div className="space-y-6">
      <BackLink label={t("back")} />

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {project.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStateBadge state={project.state} />
            <HealthBadge
              health={effectiveHealth(project)}
              suggested={live && project.publishedHealth === null}
            />
            <Link
              href={crmRoutes.company(project.clientId)}
              className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Building2 className="size-3.5" strokeWidth={1.8} aria-hidden />
              {project.clientName}
            </Link>
          </div>
          {suggestedHint ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0 text-signal" strokeWidth={1.8} aria-hidden />
              {t("suggestionHint", { health: tHealth(project.suggestedHealth) })}
              {project.healthReason ? ` · ${project.healthReason}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canManage && live ? (
            <Button variant="outline" size="sm" onClick={() => setHealthOpen(true)}>
              <Pencil aria-hidden />
              {project.publishedHealth === null ? t("publishHealth") : t("updateHealth")}
            </Button>
          ) : null}
          <LifecycleActions project={project} user={user} onChanged={refresh} />
        </div>
      </div>

      {/* State banners */}
      {project.state === "on_hold" && project.pauseReason ? (
        <Banner tone="warning" icon={PauseCircle} text={t("pausedBanner", { reason: project.pauseReason })} />
      ) : null}
      {project.state === "cancelled" && project.cancelReason ? (
        <Banner tone="destructive" icon={XCircle} text={t("cancelledBanner", { reason: project.cancelReason })} />
      ) : null}
      {isArchived ? <Banner tone="done" icon={Archive} text={t("archivedBanner")} /> : null}

      {/* Facts strip */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label={t("progress")}>
          <ProgressBar value={project.progress} tone="signal" size="sm" showValue label={t("progress")} />
        </Fact>
        <Fact label={t("dates")}>
          <span className="text-sm tabular-nums text-foreground">
            {formatDate(project.startDate)} – {formatDate(project.dueDate)}
          </span>
        </Fact>
        <Fact label={t("manager")}>
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <Avatar className="size-5">
              <AvatarFallback className="text-[0.625rem]">{initials(project.managerName)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{project.managerName}</span>
          </span>
        </Fact>
        <Fact label={t("hours")}>
          <span className="text-sm tabular-nums text-foreground">
            {t("hoursValue", { used: project.hoursUsed, budget: project.hoursBudget })}
          </span>
        </Fact>
        {canFinance ? (
          <Fact label={t("value")}>
            {project.contractedValueCents != null ? (
              <span className="font-heading text-sm font-semibold tabular-nums text-foreground">
                {formatEUR(project.contractedValueCents, locale)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </Fact>
        ) : (
          <Fact label={t("team")}>
            <span className="text-sm tabular-nums text-foreground">
              {t("teamValue", { count: project.team.length })}
            </span>
          </Fact>
        )}
      </div>

      {/* Tabs */}
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as string)}>
        <div className="overflow-x-auto">
          <Tabs.List className="flex min-w-max gap-1 border-b border-border">
            {tabItems.map((item) => {
              const Icon = item.icon;
              return (
                <Tabs.Tab
                  key={item.value}
                  value={item.value}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors",
                    "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    "aria-selected:border-signal aria-selected:font-semibold aria-selected:text-signal"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                  {item.label}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </div>

        <div className="pt-6">
          <Tabs.Panel value="overview">
            <OverviewTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="tasks">
            {/* The full task workspace, scoped to this project — list, board,
                calendar, filters and the detail dialog. The tab used to show
                phase counts over a "coming soon" note, which answered none of
                the questions someone opens it with. */}
            <TasksView
              user={{
                id: user.userId,
                name: user.name,
                role: user.role,
                avatarUrl: user.avatarUrl,
              }}
              projectId={project.id}
            />
          </Tabs.Panel>
          <Tabs.Panel value="phases">
            <PhasesTab project={project} user={user} canManage={canManage && !isArchived} onChanged={refresh} />
          </Tabs.Panel>
          <Tabs.Panel value="calendar">
            <CalendarTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="files">
            <FilesTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="activity">
            <ActivityTab
              project={project}
              currentUser={
                canComment && !isArchived
                  ? { id: user.userId, name: user.name, avatarUrl: user.avatarUrl }
                  : undefined
              }
            />
          </Tabs.Panel>
          <Tabs.Panel value="github">
            <GithubIssuesPanel
              entityType="project"
              entityId={project.id}
              canCreate={canManage}
              titlePrefix={`${project.name} — `}
            />
          </Tabs.Panel>
          {canFinance ? (
            <Tabs.Panel value="finance">
              <FinanceiroTab projectId={project.id} user={user} />
            </Tabs.Panel>
          ) : null}
        </div>
      </Tabs.Root>

      {canManage && live ? (
        <HealthDialog
          open={healthOpen}
          onOpenChange={setHealthOpen}
          suggested={project.suggestedHealth}
          published={project.publishedHealth}
          onConfirm={publishHealth}
        />
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  text,
}: {
  tone: "warning" | "destructive" | "done";
  icon: typeof PauseCircle;
  text: string;
}) {
  const styles: Record<"warning" | "destructive" | "done", string> = {
    warning: "border-warning/30 bg-warning-muted text-warning",
    destructive: "border-destructive/30 bg-destructive-muted text-destructive",
    done: "border-border bg-status-done-bg text-status-done",
  };
  return (
    <div role="status" className={cn("flex items-center gap-2 rounded-xl border px-4 py-3 text-sm", styles[tone])}>
      <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      {text}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/projects"
      className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  );
}
