"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Plus, Archive, RotateCcw, TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  toast,
  toastWithUndo,
  type SmartTableColumn,
  type RowAction,
} from "@/components/shared";
import { formatEUR } from "@/components/finance/finance-format";
import { proposalTemplatesApi } from "@/lib/api/proposal-templates";
import type { ProposalTemplate } from "@/lib/api/proposal-templates-types";

/**
 * /crm/proposal-templates — reusable proposal blueprints (Gestor+). Lists each
 * template with its section/item counts and one-time total; create opens the
 * full-page editor.
 */
export function TemplatesView() {
  const t = useTranslations("proposalTemplates.list");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["proposal-templates", "list"],
    queryFn: () => proposalTemplatesApi.list(),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["proposal-templates"] });
  }, [qc]);

  const archive = React.useCallback(
    async (tpl: ProposalTemplate) => {
      try {
        await proposalTemplatesApi.archive(tpl.id);
        refresh();
        toastWithUndo({
          title: t("archivedToast", { name: tpl.name }),
          onUndo: async () => {
            await proposalTemplatesApi.restore(tpl.id);
            refresh();
          },
        });
      } catch {
        toast({ tone: "destructive", title: t("errorGeneric") });
      }
    },
    [refresh, t]
  );

  const columns: SmartTableColumn<ProposalTemplate>[] = React.useMemo(
    () => [
      {
        id: "name",
        header: t("columns.name"),
        accessor: (tpl) => tpl.name,
        sortable: true,
        cardPriority: 0,
        cell: (tpl) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{tpl.name}</p>
            {tpl.description ? (
              <p className="truncate text-xs text-muted-foreground">{tpl.description}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "sections",
        header: t("columns.sections"),
        accessor: (tpl) => tpl.sections.length,
        align: "right",
        cardPriority: 2,
        cell: (tpl) => <span className="text-sm tabular-nums text-muted-foreground">{tpl.sections.length}</span>,
      },
      {
        id: "items",
        header: t("columns.items"),
        accessor: (tpl) => tpl.items.length,
        align: "right",
        cardPriority: 3,
        cell: (tpl) => <span className="text-sm tabular-nums text-muted-foreground">{tpl.items.length}</span>,
      },
      {
        id: "total",
        header: t("columns.oneTimeTotal"),
        accessor: (tpl) => tpl.totals.oneTime.net,
        sortable: true,
        align: "right",
        cardPriority: 1,
        cell: (tpl) => (
          <span className="font-heading text-sm font-semibold tabular-nums">
            {formatEUR(tpl.totals.oneTime.net, locale)}
          </span>
        ),
      },
    ],
    [t, locale]
  );

  const rowActions = React.useCallback(
    (tpl: ProposalTemplate): RowAction<ProposalTemplate>[] => [
      tpl.archivedAt
        ? { label: t("actions.restore"), icon: RotateCcw, onSelect: (r) => proposalTemplatesApi.restore(r.id).then(refresh) }
        : { label: t("actions.archive"), icon: Archive, onSelect: (r) => archive(r) },
    ],
    [t, archive, refresh]
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon={TriangleAlert}
          title={t("errorTitle")}
          description={t("errorDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("retry")}
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
          <Button size="lg" onClick={() => router.push("/crm/proposal-templates/new")}>
            <Plus aria-hidden />
            {t("new")}
          </Button>
        }
      />
      <SmartTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(tpl) => tpl.id}
        loading={isLoading}
        searchPlaceholder={t("searchPlaceholder")}
        onRowClick={(tpl) => router.push(`/crm/proposal-templates/${tpl.id}`)}
        rowActions={rowActions}
        emptyIcon={FileStack}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
      />
    </div>
  );
}
