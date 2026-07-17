"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Pencil, Archive, RotateCcw, TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { catalogApi } from "@/lib/api/catalog";
import type { BillingType, CatalogItem } from "@/lib/api/catalog-types";
import { CatalogFormDialog } from "./catalog-form-dialog";

const BILLING_VARIANT: Record<BillingType, React.ComponentProps<typeof Badge>["variant"]> = {
  one_time: "default",
  monthly: "info",
  annual: "gold",
};

/**
 * /crm/catalog — reusable product/service catalog (Gestor+). A SmartTable with
 * search + create/edit dialogs and archive/restore with undo. Prices are shown
 * in EUR; the billing type is a coloured badge paired with its label.
 */
export function CatalogView() {
  const t = useTranslations("catalog.list");
  const tUnits = useTranslations("catalog.units");
  const tBilling = useTranslations("catalog.billing");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CatalogItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["catalog", "list"],
    queryFn: () => catalogApi.list({ pageSize: 100 }),
  });

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["catalog"] });
  }, [qc]);

  const archive = React.useCallback(
    async (item: CatalogItem) => {
      try {
        await catalogApi.archive(item.id);
        refresh();
        toastWithUndo({
          title: t("archivedToast", { name: item.name }),
          onUndo: async () => {
            await catalogApi.restore(item.id);
            refresh();
          },
        });
      } catch {
        toast({ tone: "destructive", title: t("errorGeneric") });
      }
    },
    [refresh, t]
  );

  const columns: SmartTableColumn<CatalogItem>[] = React.useMemo(
    () => [
      {
        id: "name",
        header: t("columns.name"),
        accessor: (i) => i.name,
        sortable: true,
        cardPriority: 0,
        cell: (i) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
            {i.category ? (
              <p className="truncate text-xs text-muted-foreground">{i.category}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "unit",
        header: t("columns.unit"),
        accessor: (i) => i.unit,
        sortable: true,
        cardPriority: 2,
        cell: (i) => <span className="text-sm text-muted-foreground">{tUnits(i.unit)}</span>,
      },
      {
        id: "billing",
        header: t("columns.billing"),
        accessor: (i) => i.billingType,
        sortable: true,
        cardPriority: 3,
        filterOptions: (["one_time", "monthly", "annual"] as BillingType[]).map((b) => ({
          value: b,
          label: tBilling(b),
        })),
        cell: (i) => <Badge variant={BILLING_VARIANT[i.billingType]}>{tBilling(i.billingType)}</Badge>,
      },
      {
        id: "unitPrice",
        header: t("columns.unitPrice"),
        accessor: (i) => i.unitPrice,
        sortable: true,
        align: "right",
        cardPriority: 1,
        cell: (i) => (
          <span className="font-heading text-sm font-semibold tabular-nums">
            {formatEUR(i.unitPrice, locale)}
          </span>
        ),
      },
      {
        id: "taxRate",
        header: t("columns.taxRate"),
        accessor: (i) => i.taxRate,
        sortable: true,
        align: "right",
        defaultHidden: true,
        cell: (i) => <span className="text-sm text-muted-foreground tabular-nums">{i.taxRate}%</span>,
      },
    ],
    [t, tUnits, tBilling, locale]
  );

  const rowActions = React.useCallback(
    (item: CatalogItem): RowAction<CatalogItem>[] => [
      { label: t("actions.edit"), icon: Pencil, onSelect: (r) => setEditing(r) },
      item.archivedAt
        ? { label: t("actions.restore"), icon: RotateCcw, onSelect: (r) => catalogApi.restore(r.id).then(refresh) }
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
          <Button size="lg" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            {t("new")}
          </Button>
        }
      />
      <SmartTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(i) => i.id}
        loading={isLoading}
        searchPlaceholder={t("searchPlaceholder")}
        onRowClick={(i) => router.push(`/crm/catalog/${i.id}`)}
        rowActions={rowActions}
        emptyIcon={Package}
        emptyTitle={t("empty.title")}
        emptyDescription={t("empty.description")}
      />

      <CatalogFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onConfirm={async (input) => {
          const created = await catalogApi.create(input);
          refresh();
          toast({ tone: "success", title: t("createdToast", { name: created.name }) });
        }}
      />
      <CatalogFormDialog
        open={editing !== null}
        item={editing}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        onConfirm={async (input) => {
          if (!editing) return;
          await catalogApi.update(editing.id, input);
          refresh();
          toast({ tone: "success", title: t("updatedToast", { name: input.name }) });
          setEditing(null);
        }}
      />
    </div>
  );
}
