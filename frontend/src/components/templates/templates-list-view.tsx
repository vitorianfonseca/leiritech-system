"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  TriangleAlert,
  LayoutTemplate,
  Pencil,
  Trash2,
  PlayCircle,
  Layers,
  ListChecks,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import {
  ConfirmDialog,
  EmptyState,
  SmartTable,
  toast,
  toastWithUndo,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { templatesApi } from "@/lib/api/templates";
import {
  canManageTemplates,
  canUseTemplates,
  TEMPLATE_TYPES,
  type ProjectTemplate,
  type TemplateInput,
} from "@/lib/api/template-types";
import type { Role } from "@/lib/session";
import { TemplateFormDialog } from "./template-form-dialog";
import { TemplateTypeBadge } from "./template-helpers";

export interface TemplatesListViewProps {
  role: Role;
}

/**
 * /settings/templates — the templates list (F9). Admin can create/edit/delete;
 * Gestor gets a read-only table plus "usar" to spin up a project (feeds #31).
 */
export function TemplatesListView({ role }: TemplatesListViewProps) {
  const t = useTranslations("templates");
  const tt = useTranslations("templates.types");
  const router = useRouter();
  const qc = useQueryClient();
  const canManage = canManageTemplates(role);
  const canUse = canUseTemplates(role);

  const queryKey = React.useMemo(() => ["templates", "list"] as const, []);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => templatesApi.list(),
  });

  const refresh = React.useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ProjectTemplate | null>(null);

  // Metadata + phases/tasks are all edited on the editor page; the list only
  // creates (then navigates into the new template) and deletes.
  const handleCreate = React.useCallback(
    async (input: TemplateInput) => {
      const created = await templatesApi.createTemplate(input, role);
      await refresh();
      toast({ tone: "success", title: t("toasts.created", { name: created.name }) });
      router.push(`/settings/templates/${created.id}`);
    },
    [refresh, role, router, t],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleting) return;
    const target = deleting;
    const detail = await templatesApi.get(target.id);
    await templatesApi.deleteTemplate(target.id, role);
    await refresh();
    toastWithUndo({
      tone: "warning",
      title: t("toasts.deleted", { name: target.name }),
      onUndo: async () => {
        if (detail) await templatesApi.restoreTemplate(detail, role);
        await refresh();
      },
    });
  }, [deleting, refresh, role, t]);

  const handleUse = React.useCallback(
    (template: ProjectTemplate) => {
      // #31 (conversion wizard) consumes the template to spin up a project.
      // Until that route exists we confirm the selection so Gestor gets feedback
      // without a dead-end navigation.
      toast({
        tone: "info",
        title: t("toasts.used", { name: template.name }),
        description: t("toasts.usedHint"),
      });
    },
    [t],
  );

  const openCreate = () => {
    setFormOpen(true);
  };

  const columns = React.useMemo<SmartTableColumn<ProjectTemplate>[]>(
    () => [
      {
        id: "name",
        header: t("table.name"),
        accessor: (r) => r.name,
        sortable: true,
        cardPriority: 0,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{r.name}</span>
            <span className="line-clamp-1 max-w-md text-xs text-muted-foreground">
              {r.description}
            </span>
          </div>
        ),
      },
      {
        id: "type",
        header: t("table.type"),
        accessor: (r) => r.type,
        sortable: true,
        cardPriority: 1,
        filterOptions: TEMPLATE_TYPES.map((type) => ({ label: tt(type), value: type })),
        cell: (r) => <TemplateTypeBadge type={r.type} />,
      },
      {
        id: "phases",
        header: t("table.phases"),
        accessor: (r) => r.phaseCount,
        sortable: true,
        align: "right",
        cardPriority: 2,
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
            <Layers className="size-3.5" strokeWidth={1.8} aria-hidden />
            {r.phaseCount}
          </span>
        ),
      },
      {
        id: "tasks",
        header: t("table.tasks"),
        accessor: (r) => r.taskCount,
        sortable: true,
        align: "right",
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
            <ListChecks className="size-3.5" strokeWidth={1.8} aria-hidden />
            {r.taskCount}
          </span>
        ),
      },
      {
        id: "hours",
        header: t("table.hours"),
        accessor: (r) => r.totalEstimateHours,
        sortable: true,
        align: "right",
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
            <Clock className="size-3.5" strokeWidth={1.8} aria-hidden />
            {t("hoursValue", { count: r.totalEstimateHours })}
          </span>
        ),
      },
      {
        id: "status",
        header: t("table.status"),
        accessor: (r) => (r.active ? "active" : "inactive"),
        sortable: true,
        filterOptions: [
          { label: t("status.active"), value: "active" },
          { label: t("status.inactive"), value: "inactive" },
        ],
        cell: (r) =>
          r.active ? (
            <Badge variant="success">{t("status.active")}</Badge>
          ) : (
            <Badge variant="outline">{t("status.inactive")}</Badge>
          ),
      },
    ],
    [t, tt],
  );

  const rowActions = React.useCallback(
    (): RowAction<ProjectTemplate>[] => {
      const actions: RowAction<ProjectTemplate>[] = [
        {
          label: canManage ? t("actions.edit") : t("actions.view"),
          icon: canManage ? Pencil : LayoutTemplate,
          onSelect: (r) => router.push(`/settings/templates/${r.id}`),
        },
      ];
      if (canUse) {
        actions.push({ label: t("actions.use"), icon: PlayCircle, onSelect: handleUse });
      }
      if (canManage) {
        actions.push({
          label: t("actions.delete"),
          icon: Trash2,
          variant: "destructive",
          onSelect: setDeleting,
        });
      }
      return actions;
    },
    [canManage, canUse, handleUse, router, t],
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
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("actions.refresh")}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden />
            </Button>
            {canManage ? (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                {t("actions.new")}
              </Button>
            ) : null}
          </div>
        }
      />

      <SmartTable
        data={data ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        loading={isLoading}
        searchable
        searchPlaceholder={t("searchPlaceholder")}
        rowActions={rowActions}
        onRowClick={(r) => router.push(`/settings/templates/${r.id}`)}
        emptyIcon={LayoutTemplate}
        emptyTitle={t("empty.title")}
        emptyDescription={canManage ? t("empty.descriptionAdmin") : t("empty.description")}
      />

      {canManage ? (
        <>
          <TemplateFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            template={null}
            onSubmit={handleCreate}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
            variant="destructive"
            title={t("deleteConfirm.title")}
            description={deleting ? t("deleteConfirm.description", { name: deleting.name }) : undefined}
            confirmLabel={t("deleteConfirm.confirm")}
            onConfirm={handleDelete}
          />
        </>
      ) : null}
    </div>
  );
}
