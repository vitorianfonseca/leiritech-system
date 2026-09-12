"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowLeft,
  RefreshCw,
  TriangleAlert,
  FolderKanban,
  PauseCircle,
  XCircle,
  Archive,
  Sparkles,
  Pencil,
  LayoutGrid,
  TrendingUp,
  CalendarRange,
  UserRound,
  Clock,
  Users,
  type LucideIcon,
  ListTodo,
  CalendarDays,
  Paperclip,
  History,
  Wallet,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  EmptyState,
  GithubIssuesPanel,
  GithubRepoActivity,
  ProgressBar,
  SkeletonCard,
  toast,
} from "@/components/shared";
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
import { WorkTab } from "./work-tab";
import { useUrlState } from "@/lib/use-url-state";
import { FinanceiroTab } from "./financeiro-tab";
import { ActivityTab } from "./simple-tabs";
import { CalendarTab } from "./calendar-tab";
import { ProjectEditDialog } from "./project-edit-dialog";
import { FilesTab } from "./files-tab";
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

/** Every tab this page can show. `finance` is gated at render, not here: a
 *  link to it from someone without access still falls back to the default. */
const PROJECT_TABS = [
  "tasks",
  "calendar",
  "files",
  "activity",
  "github",
  "finance",
] as const;

export function ProjectDetailView({ projectId, user }: ProjectDetailViewProps) {
  const t = useTranslations("projects.detail");
  const tTabs = useTranslations("projects.tabs");
  const tEdit = useTranslations("projects.editDialog");
  const [editOpen, setEditOpen] = React.useState(false);
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

  // In the URL so a refresh, a restored session and a pasted link all land on
  // the tab you were on. Validated, because `?tab=overview` outlived the tab
  // it named and an unrecognised value must not leave every tab unselected.
  const [tab, setTab] = useUrlState<string>("tab", "tasks", {
    valid: PROJECT_TABS,
  });
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
    { value: "tasks", label: tTabs("tasks"), icon: ListTodo },
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
        <div className="min-w-0">
          {/* The client is an identity, not a caption. A grey icon beside grey
              capitals is a third line of text in a stack of three; a marked
              chip gives the block something to start from and puts the only
              colour in this region on the one thing here you can click
              through to. */}
          {project.clientName ? (
            <Link
              href={crmRoutes.company(project.clientId)}
              className="glass glass-quiet mb-3 inline-flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="glass-chip [--chip:var(--signal)] flex size-6 items-center justify-center rounded-full text-[0.625rem] font-bold text-signal">
                {initials(project.clientName)}
              </span>
              <span className="text-sm font-medium text-foreground">
                {project.clientName}
              </span>
            </Link>
          ) : null}

          {/* The title and its state read as one object: the badges sit on the
              same line at large widths rather than starting a fourth row. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1 className="page-title">{project.name}</h1>
            <span className="flex flex-wrap items-center gap-2 pb-0.5">
              <ProjectStateBadge state={project.state} />
              <HealthBadge
                health={effectiveHealth(project)}
                suggested={live && project.publishedHealth === null}
              />
            </span>
          </div>
          {suggestedHint ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
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
          {canManage && !isArchived ? (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden />
              {tEdit("edit")}
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
        <Fact label={t("progress")} icon={TrendingUp} tone="signal">
          <ProgressBar value={project.progress} tone="signal" size="sm" showValue label={t("progress")} />
        </Fact>
        <Fact label={t("dates")} icon={CalendarRange} tone="neutral">
          {/* Wraps rather than truncates: a date range cut off mid-year
              ("08/11/…") is worse than one on two lines. */}
          <span className="block text-sm font-medium tabular-nums text-foreground">
            {formatDate(project.startDate)}
            <span className="text-muted-foreground"> – </span>
            <wbr />
            {formatDate(project.dueDate)}
          </span>
        </Fact>
        <Fact label={t("manager")} icon={UserRound} tone="neutral">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Avatar className="size-5">
              <AvatarFallback className="text-[0.625rem]">{initials(project.managerName)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{project.managerName}</span>
          </span>
        </Fact>
        <Fact
          label={t("hours")}
          icon={Clock}
          tone={project.hoursBudget > 0 && project.hoursUsed > project.hoursBudget ? "warning" : "neutral"}
        >
          <span className="font-heading block text-lg font-semibold tabular-nums text-foreground">
            {project.hoursUsed}h
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {project.hoursBudget}h
            </span>
          </span>
        </Fact>
        {canFinance ? (
          <Fact label={t("value")} icon={Wallet} tone="success">
            {project.contractedValueCents != null ? (
              <span className="font-heading block text-lg font-semibold tabular-nums text-foreground">
                {formatEUR(project.contractedValueCents, locale)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </Fact>
        ) : (
          <Fact label={t("team")} icon={Users} tone="neutral">
            <span className="font-heading block text-lg font-semibold tabular-nums text-foreground">
              {project.team.length}
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
          <Tabs.Panel value="tasks">
            <WorkTab
              project={project}
              user={{
                role: user.role,
                userId: user.userId,
                name: user.name,
                avatarUrl: user.avatarUrl,
              }}
              canManage={canManage && !isArchived}
              onChanged={refresh}
            />
          </Tabs.Panel>
          <Tabs.Panel value="calendar">
            <CalendarTab
              project={project}
              user={{ role: user.role, userId: user.userId }}
              actorId={user.userId}
              canManage={canManage && !isArchived}
              onChanged={refresh}
            />
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
            <div className="space-y-6">
              <GithubRepoActivity />
              <GithubIssuesPanel
                entityType="project"
                entityId={project.id}
                canCreate={canManage}
                titlePrefix={`${project.name} — `}
              />
            </div>
          </Tabs.Panel>
          {canFinance ? (
            <Tabs.Panel value="finance">
              <FinanceiroTab projectId={project.id} user={user} />
            </Tabs.Panel>
          ) : null}
        </div>
      </Tabs.Root>

      {canManage && !isArchived ? (
        <ProjectEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={project}
          canFinance={canFinance}
          onSubmit={async (input) => {
            await projectsApi.updateProject(project.id, input, user.userId);
            await refresh();
            toast({ tone: "success", title: tEdit("saved") });
          }}
        />
      ) : null}

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

/**
 * One figure in the summary strip.
 *
 * The strip was five identical grey labels over five identical grey values,
 * which is a table pretending to be a dashboard: nothing led, so nothing was
 * read. Each fact now carries a tinted mark, and the value is set at display
 * size so the eye lands on the number before the word that names it.
 */
function Fact({
  label,
  icon: Icon,
  tone,
  children,
}: {
  label: string;
  icon: LucideIcon;
  tone: "signal" | "neutral" | "success" | "warning";
  children: React.ReactNode;
}) {
  const marks = {
    signal: "[--chip:var(--signal)] text-signal",
    neutral: "text-muted-foreground",
    success: "[--chip:var(--success)] text-success",
    warning: "[--chip:var(--health-attention)] text-health-attention",
  } as const;
  return (
    <div className="flex min-w-0 gap-3">
      <span
        className={cn(
          "glass-chip mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          marks[tone]
        )}
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="min-w-0">{children}</div>
      </div>
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
