"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, Receipt } from "lucide-react";
import { SmartTable, type SmartTableColumn, type RowAction } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import type { ProjectCost, ProjectCostCategory } from "@/lib/api/finance-types";
import { formatEUR, formatDate } from "./finance-format";

const CATEGORIES: ProjectCostCategory[] = [
  "subcontracting",
  "software",
  "hardware",
  "travel",
  "other",
];

export interface ProjectCostsPanelProps {
  costs: ProjectCost[];
  loading?: boolean;
  canManage: boolean;
  onDelete?: (cost: ProjectCost) => void;
  hideProjectColumn?: boolean;
  toolbar?: React.ReactNode;
  className?: string;
}

/**
 * Project costs table (F14 / BR-069). Costs feed the live margin (BR-065).
 * Reusable by the projects Financeiro tab (#32). Built on the shared SmartTable.
 */
export function ProjectCostsPanel({
  costs,
  loading = false,
  canManage,
  onDelete,
  hideProjectColumn = false,
  toolbar,
  className,
}: ProjectCostsPanelProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const columns = React.useMemo<SmartTableColumn<ProjectCost>[]>(() => {
    const cols: SmartTableColumn<ProjectCost>[] = [
      {
        id: "description",
        header: t("costsTable.columns.description"),
        accessor: (c) => c.description,
        sortable: true,
        cardPriority: 0,
        cell: (c) => (
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-foreground">{c.description}</p>
            {!hideProjectColumn ? (
              <p className="truncate text-xs text-muted-foreground">{c.projectName}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "category",
        header: t("costsTable.columns.category"),
        accessor: (c) => c.category,
        cardPriority: 1,
        filterOptions: CATEGORIES.map((c) => ({
          label: t(`costCategory.${c}`),
          value: c,
        })),
        cell: (c) => <Badge variant="outline">{t(`costCategory.${c.category}`)}</Badge>,
      },
      {
        id: "amount",
        header: t("costsTable.columns.amount"),
        accessor: (c) => c.amountCents,
        sortable: true,
        align: "right",
        cardPriority: 2,
        cell: (c) => (
          <span className="tabular-nums font-medium">
            {formatEUR(c.amountCents, locale)}
          </span>
        ),
      },
      {
        id: "incurredDate",
        header: t("costsTable.columns.incurredDate"),
        accessor: (c) => c.incurredDate,
        sortable: true,
        cardPriority: 3,
        cell: (c) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDate(c.incurredDate)}
          </span>
        ),
      },
    ];
    return cols;
  }, [t, locale, hideProjectColumn]);

  const rowActions = React.useMemo(() => {
    if (!canManage || !onDelete) return undefined;
    return (): RowAction<ProjectCost>[] => [
      {
        label: t("actions.deleteCost"),
        icon: Trash2,
        variant: "destructive",
        onSelect: onDelete,
      },
    ];
  }, [canManage, onDelete, t]);

  return (
    <SmartTable<ProjectCost>
      className={className}
      data={costs}
      columns={columns}
      getRowId={(c) => c.id}
      loading={loading}
      searchable
      searchPlaceholder={t("costsTable.searchPlaceholder")}
      rowActions={rowActions}
      toolbar={toolbar}
      emptyIcon={Receipt}
      emptyTitle={t("costsTable.emptyTitle")}
      emptyDescription={t("costsTable.emptyDescription")}
      pageSize={6}
    />
  );
}
