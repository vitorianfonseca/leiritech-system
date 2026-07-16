"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderKanban,
  Plus,
  Eye,
  Archive,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  ProgressBar,
  EmptyState,
  ConfirmDialog,
  toastWithUndo,
  toast,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { projectsApi, projectRoutes } from "@/lib/api/projects";
import {
  PROJECT_STATES,
  PROJECT_HEALTHS,
  canCreateProject,
  canManageProject,
  effectiveHealth,
  ProjectError,
  type ProjectListItem,
  type ProjectState,
} from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";
import { HealthBadge, ProjectStateBadge } from "./status-badges";
import { formatEUR, formatDate, progressTone } from "./project-format";

export interface ProjectsViewProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

const ARCHIVABLE: ProjectState[] = ["completed", "cancelled"];

/**
 * /projects — projects directory (F8). A SmartTable with search / state + health
 * filters / sort / pagination and quick-create. Value is finance-gated (BR-008);
 * Membro sees only member projects (BR-002 — enforced by the client). Closed
 * projects can be archived with undo.
 */
export function ProjectsView({ user }: ProjectsViewProps) {
  const t = useTranslations("projects.list");
  const tStates = useTranslations("projects.states");
  const tHealth = useTranslations("projects.health");
  const tErr = useTranslations("projects.errors");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const canCreate = canCreateProject(user.role);

  const [archiving, setArchiving] = React.useState<ProjectListItem | null>(null);

  const queryKey = ["projects", "list", user.role, user.userId, user.paymentsGrant] as const;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => projectsApi.listProjects(user.role, user.userId, user.paymentsGrant),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["projects"] });
  }, [qc]);

  const doArchive = React.useCallback(
    async (p: ProjectListItem) => {
      const prevState = p.state;
      try {
        await projectsApi.transition(p.id, { action: "archive" }, user.userId);
        refresh();
        toastWithUndo({
          tone: "warning",
          title: t("archivedToast", { name: p.name }),
          onUndo: async () => {
            await projectsApi.restoreState(p.id, prevState, user.userId);
            refresh();
          },
        });
      } catch (error) {
        const code = error instanceof ProjectError ? error.code : "network";
        toast({ tone: "destructive", title: tErr(code) });
      }
    },
    [refresh, t, tErr, user.userId]
  );

  const columns: SmartTableColumn<ProjectListItem>[] = React.useMemo(
    () => [
      {
        id: "name",
        header: t("columns.name"),
        accessor: (p) => p.name,
        sortable: true,
        cardPriority: 0,
        cell: (p) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">{p.clientName}</p>
          </div>
        ),
      },
      {
        id: "client",
        header: t("columns.client"),
        accessor: (p) => p.clientName,
        sortable: true,
        defaultHidden: true,
        cell: (p) => <span className="text-sm text-muted-foreground">{p.clientName}</span>,
      },
      {
        id: "manager",
        header: t("columns.manager"),
        accessor: (p) => p.managerName,
        sortable: true,
        cardPriority: 4,
        cell: (p) => (
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <Avatar className="size-5">
              <AvatarFallback className="text-[0.625rem]">
                {p.managerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{p.managerName}</span>
          </span>
        ),
      },
      {
        id: "team",
        header: t("columns.team"),
        accessor: (p) => p.teamCount,
        sortable: true,
        align: "center",
        cell: (p) => (
          <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Users className="size-3.5" strokeWidth={1.8} aria-hidden />
            {p.teamCount}
          </span>
        ),
      },
      {
        id: "state",
        header: t("columns.state"),
        accessor: (p) => p.state,
        sortable: true,
        cardPriority: 2,
        filterOptions: PROJECT_STATES.map((s) => ({ value: s, label: tStates(s) })),
        cell: (p) => <ProjectStateBadge state={p.state} />,
      },
      {
        id: "health",
        header: t("columns.health"),
        accessor: (p) => effectiveHealth(p),
        sortable: true,
        cardPriority: 3,
        filterOptions: PROJECT_HEALTHS.map((h) => ({ value: h, label: tHealth(h) })),
        cell: (p) => <HealthBadge health={effectiveHealth(p)} suggested={p.publishedHealth === null} />,
      },
      {
        id: "progress",
        header: t("columns.progress"),
        accessor: (p) => p.progress,
        sortable: true,
        cardPriority: 1,
        className: "w-40",
        cell: (p) => (
          <ProgressBar
            value={p.progress}
            tone={progressTone(p.progress)}
            size="sm"
            showValue
            label={t("columns.progress")}
          />
        ),
      },
      {
        id: "startDate",
        header: t("columns.startDate"),
        accessor: (p) => p.startDate,
        sortable: true,
        defaultHidden: true,
        cell: (p) => <span className="text-sm text-muted-foreground">{formatDate(p.startDate)}</span>,
      },
      {
        id: "dueDate",
        header: t("columns.dueDate"),
        accessor: (p) => p.dueDate,
        sortable: true,
        cell: (p) => <span className="text-sm text-muted-foreground">{formatDate(p.dueDate)}</span>,
      },
      {
        id: "value",
        header: t("columns.value"),
        accessor: (p) => p.contractedValueCents ?? -1,
        sortable: true,
        align: "right",
        cell: (p) =>
          p.contractedValueCents != null ? (
            <span className="font-heading text-sm font-semibold tabular-nums">
              {formatEUR(p.contractedValueCents, locale)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("valueRestricted")}</span>
          ),
      },
      {
        id: "hoursBudget",
        header: t("columns.hoursBudget"),
        accessor: (p) => p.hoursBudget,
        sortable: true,
        align: "right",
        defaultHidden: true,
        cell: (p) => <span className="text-sm tabular-nums text-muted-foreground">{p.hoursBudget}h</span>,
      },
      {
        id: "hoursUsed",
        header: t("columns.hoursUsed"),
        accessor: (p) => p.hoursUsed,
        sortable: true,
        align: "right",
        cell: (p) => {
          const over = p.hoursUsed > p.hoursBudget;
          return (
            <span
              className={cnHours(over)}
              title={t("hoursOf", { used: p.hoursUsed, budget: p.hoursBudget })}
            >
              {p.hoursUsed}h
            </span>
          );
        },
      },
      {
        id: "nextDelivery",
        header: t("columns.nextDelivery"),
        accessor: (p) => p.nextDeliveryAt ?? "",
        sortable: true,
        defaultHidden: true,
        cell: (p) => (
          <span className="text-sm text-muted-foreground">
            {p.nextDeliveryAt ? formatDate(p.nextDeliveryAt) : "—"}
          </span>
        ),
      },
    ],
    [t, tStates, tHealth, locale]
  );

  const rowActions = React.useCallback(
    (p: ProjectListItem): RowAction<ProjectListItem>[] => {
      const actions: RowAction<ProjectListItem>[] = [
        { label: t("actions.view"), icon: Eye, onSelect: (r) => router.push(projectRoutes.detail(r.id)) },
      ];
      if (canManageProject(user.role, p.managerId === user.userId) && ARCHIVABLE.includes(p.state)) {
        actions.push({
          label: t("actions.archive"),
          icon: Archive,
          onSelect: (r) => setArchiving(r),
        });
      }
      return actions;
    },
    [router, t, user.role, user.userId]
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          canCreate ? (
            <Button size="lg" nativeButton={false} render={<Link href={projectRoutes.new()} />}>
              <Plus aria-hidden />
              {t("new")}
            </Button>
          ) : null
        }
      />
      <SmartTable
        data={data ?? []}
        columns={columns}
        getRowId={(p) => p.id}
        loading={isLoading}
        searchPlaceholder={t("searchPlaceholder")}
        onRowClick={(p) => router.push(projectRoutes.detail(p.id))}
        rowActions={rowActions}
        emptyIcon={FolderKanban}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        variant="destructive"
        title={t("archiveConfirm.title")}
        description={archiving ? t("archiveConfirm.description", { name: archiving.name }) : undefined}
        confirmLabel={t("archiveConfirm.confirm")}
        onConfirm={async () => {
          if (archiving) await doArchive(archiving);
        }}
      />
    </div>
  );
}

function cnHours(over: boolean): string {
  return over
    ? "rounded-md bg-status-overdue-bg px-1.5 py-0.5 text-sm font-medium tabular-nums text-status-overdue"
    : "text-sm tabular-nums text-muted-foreground";
}
