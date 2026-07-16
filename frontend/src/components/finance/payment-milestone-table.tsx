"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleDollarSign, Pencil, Ban, Milestone } from "lucide-react";
import { SmartTable, type SmartTableColumn, type RowAction } from "@/components/shared";
import type { PaymentMilestone, PaymentMilestoneStatus } from "@/lib/api/finance-types";
import { formatEUR, formatDate } from "./finance-format";
import { StatusBadge, UrgencyHint } from "./milestone-status";

const ALL_STATUSES: PaymentMilestoneStatus[] = [
  "planned",
  "invoiced",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
];

export interface PaymentMilestoneTableProps {
  milestones: PaymentMilestone[];
  loading?: boolean;
  /** Gate write actions to Admin / payments-grant (BR-069). */
  canManage: boolean;
  onView?: (milestone: PaymentMilestone) => void;
  onEdit?: (milestone: PaymentMilestone) => void;
  onRecordPayment?: (milestone: PaymentMilestone) => void;
  onCancel?: (milestone: PaymentMilestone) => void;
  /** Hide the project column when embedded in a single-project context (#32). */
  hideProjectColumn?: boolean;
  className?: string;
}

/**
 * Payment-milestone table (F14) built on the shared SmartTable — search /
 * filter / sort / paginate / column-select and responsive cards come for free.
 * Reusable: the projects Financeiro tab (#32) embeds it with
 * `hideProjectColumn` and its own handlers.
 *
 * Terminology stays non-fiscal (BR-070/072): "marco de pagamento", never
 * "fatura". Urgency (overdue / due-soon) is shown with badge + icon + text,
 * never colour alone (AUTO-02/08, WCAG AA).
 */
export function PaymentMilestoneTable({
  milestones,
  loading = false,
  canManage,
  onView,
  onEdit,
  onRecordPayment,
  onCancel,
  hideProjectColumn = false,
  className,
}: PaymentMilestoneTableProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const columns = React.useMemo<SmartTableColumn<PaymentMilestone>[]>(() => {
    const cols: SmartTableColumn<PaymentMilestone>[] = [
      {
        id: "description",
        header: t("table.columns.description"),
        accessor: (m) => m.description,
        sortable: true,
        cardPriority: 0,
        cell: (m) => (
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-foreground">{m.description}</p>
            {!hideProjectColumn ? (
              <p className="truncate text-xs text-muted-foreground">
                {m.projectName}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: t("table.columns.status"),
        accessor: (m) => m.status,
        cardPriority: 1,
        filterOptions: ALL_STATUSES.map((s) => ({
          label: t(`status.${s}`),
          value: s,
        })),
        cell: (m) => <StatusBadge status={m.status} />,
      },
      {
        id: "amount",
        header: t("table.columns.amount"),
        accessor: (m) => m.amountCents,
        sortable: true,
        align: "right",
        cardPriority: 2,
        cell: (m) => (
          <span className="tabular-nums font-medium">
            {formatEUR(m.amountCents, locale)}
          </span>
        ),
      },
      {
        id: "received",
        header: t("table.columns.received"),
        accessor: (m) => m.receivedAmountCents,
        sortable: true,
        align: "right",
        cell: (m) => (
          <span className="tabular-nums text-muted-foreground">
            {formatEUR(m.receivedAmountCents, locale)}
          </span>
        ),
      },
      {
        id: "expectedDate",
        header: t("table.columns.expectedDate"),
        accessor: (m) => m.expectedDate,
        sortable: true,
        cardPriority: 3,
        cell: (m) => (
          <div className="space-y-0.5">
            <span className="tabular-nums">{formatDate(m.expectedDate)}</span>
            <div>
              <UrgencyHint milestone={m} />
            </div>
          </div>
        ),
      },
      {
        id: "completionCriteria",
        header: t("table.columns.completionCriteria"),
        accessor: (m) => m.completionCriteria,
        cell: (m) => (
          <span
            className="line-clamp-2 max-w-xs text-sm text-muted-foreground"
            title={m.completionCriteria}
          >
            {m.completionCriteria}
          </span>
        ),
      },
      {
        id: "paidDate",
        header: t("table.columns.paidDate"),
        accessor: (m) => m.paidDate ?? "",
        defaultHidden: true,
        cell: (m) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDate(m.paidDate)}
          </span>
        ),
      },
      {
        id: "externalInvoiceRef",
        header: t("table.columns.externalRef"),
        accessor: (m) => m.externalInvoiceRef ?? "",
        defaultHidden: true,
        cell: (m) => (
          <span className="font-mono text-xs text-muted-foreground">
            {m.externalInvoiceRef ?? "—"}
          </span>
        ),
      },
    ];
    return cols;
  }, [t, locale, hideProjectColumn]);

  const rowActions = React.useMemo(() => {
    if (!canManage) return undefined;
    return (): RowAction<PaymentMilestone>[] => {
      const actions: RowAction<PaymentMilestone>[] = [];
      if (onRecordPayment) {
        actions.push({
          label: t("actions.recordPayment"),
          icon: CircleDollarSign,
          onSelect: onRecordPayment,
          disabled: (row) => row.status === "paid" || row.status === "cancelled",
        });
      }
      if (onEdit) {
        actions.push({
          label: t("actions.editMilestone"),
          icon: Pencil,
          onSelect: onEdit,
          disabled: (row) => row.status === "cancelled",
        });
      }
      if (onCancel) {
        actions.push({
          label: t("actions.cancelMilestone"),
          icon: Ban,
          variant: "destructive",
          onSelect: onCancel,
          disabled: (row) => row.status === "cancelled" || row.status === "paid",
        });
      }
      return actions;
    };
  }, [canManage, onRecordPayment, onEdit, onCancel, t]);

  return (
    <SmartTable<PaymentMilestone>
      className={className}
      data={milestones}
      columns={columns}
      getRowId={(m) => m.id}
      loading={loading}
      searchable
      searchPlaceholder={t("table.searchPlaceholder")}
      rowActions={rowActions}
      onRowClick={onView}
      emptyIcon={Milestone}
      emptyTitle={t("table.emptyTitle")}
      emptyDescription={t("table.emptyDescription")}
      pageSize={8}
    />
  );
}
