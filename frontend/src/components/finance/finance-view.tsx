"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  TriangleAlert,
  ReceiptText,
  Milestone as MilestoneIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import {
  ConfirmDialog,
  DetailSidePanel,
  EmptyState,
  toast,
  toastWithUndo,
  type ComboboxItem,
} from "@/components/shared";
import { financeApi } from "@/lib/api/finance";
import {
  canManageFinance,
  type MilestoneInput,
  type PaymentMilestone,
  type ProjectCost,
  type ProjectCostInput,
  type RecordPaymentInput,
} from "@/lib/api/finance-types";
import type { Role } from "@/lib/session";
import { FinancialStatTiles } from "./financial-stat-tiles";
import { MarginCard } from "./margin-card";
import { PaymentMilestoneTable } from "./payment-milestone-table";
import { ProjectCostsPanel } from "./project-costs-panel";
import { MilestoneFormDialog } from "./milestone-form-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ProjectCostDialog } from "./project-cost-dialog";
import { StatusBadge } from "./milestone-status";
import { formatEUR, formatDate } from "./finance-format";

export interface FinanceViewProps {
  user: { role: Role; paymentsGrant: boolean };
}

/**
 * /finance dashboard (F14). Assembles the reusable finance components with live
 * data (TanStack Query), gated write actions, confirmation dialogs and
 * Toast+Undo for reversible mutations. Access is already gated at the route;
 * this view additionally gates every write to Admin / payments-grant.
 */
export function FinanceView({ user }: FinanceViewProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const qc = useQueryClient();
  const canManage = canManageFinance(user.role, user.paymentsGrant);

  const queryKey = React.useMemo(
    () => ["finance", user.role, user.paymentsGrant] as const,
    [user.role, user.paymentsGrant]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => financeApi.getOverview(user.role, user.paymentsGrant),
  });

  const refresh = React.useCallback(
    () => qc.invalidateQueries({ queryKey }),
    [qc, queryKey]
  );

  /* ---------------- project options for the dialogs ---------------- */
  const projectOptions = React.useMemo<ComboboxItem[]>(() => {
    const map = new Map<string, string>();
    for (const m of data?.milestones ?? []) map.set(m.projectId, m.projectName);
    for (const c of data?.costs ?? []) map.set(c.projectId, c.projectName);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [data]);

  /* ---------------- dialog + panel state ---------------- */
  const [milestoneDialogOpen, setMilestoneDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PaymentMilestone | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);
  const [payingMilestone, setPayingMilestone] = React.useState<PaymentMilestone | null>(null);
  const [costDialogOpen, setCostDialogOpen] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<PaymentMilestone | null>(null);
  const [deletingCost, setDeletingCost] = React.useState<ProjectCost | null>(null);
  const [detail, setDetail] = React.useState<PaymentMilestone | null>(null);

  /* ---------------- mutations ---------------- */
  const guard = [user.role, user.paymentsGrant] as const;

  const handleCreate = React.useCallback(
    async (input: MilestoneInput) => {
      await financeApi.createMilestone(input, ...guard);
      await refresh();
      toast({ tone: "success", title: t("toasts.milestoneCreated") });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, t, user.role, user.paymentsGrant]
  );

  const handleUpdate = React.useCallback(
    async (input: MilestoneInput) => {
      if (!editing) return;
      await financeApi.updateMilestone(editing.id, input, ...guard);
      await refresh();
      toast({ tone: "success", title: t("toasts.milestoneUpdated") });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, refresh, t, user.role, user.paymentsGrant]
  );

  const handleRecordPayment = React.useCallback(
    async (input: RecordPaymentInput) => {
      if (!payingMilestone) return;
      const prev = payingMilestone;
      await financeApi.recordPayment(prev.id, input, ...guard);
      await refresh();
      toastWithUndo({
        tone: "success",
        title: t("toasts.paymentRecorded", {
          amount: formatEUR(input.amountCents, locale),
        }),
        description: prev.description,
        onUndo: async () => {
          await financeApi.restoreMilestone(prev, ...guard);
          await refresh();
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payingMilestone, refresh, t, locale, user.role, user.paymentsGrant]
  );

  const handleCancelMilestone = React.useCallback(async () => {
    if (!cancelling) return;
    const prev = cancelling;
    await financeApi.cancelMilestone(prev.id, ...guard);
    await refresh();
    toastWithUndo({
      tone: "warning",
      title: t("toasts.milestoneCancelled", { name: prev.description }),
      onUndo: async () => {
        await financeApi.restoreMilestone(prev, ...guard);
        await refresh();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelling, refresh, t, user.role, user.paymentsGrant]);

  const handleCreateCost = React.useCallback(
    async (input: ProjectCostInput) => {
      await financeApi.createCost(input, ...guard);
      await refresh();
      toast({ tone: "success", title: t("toasts.costCreated") });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, t, user.role, user.paymentsGrant]
  );

  const handleDeleteCost = React.useCallback(async () => {
    if (!deletingCost) return;
    const prev = deletingCost;
    await financeApi.deleteCost(prev.id, ...guard);
    await refresh();
    toastWithUndo({
      tone: "warning",
      title: t("toasts.costDeleted", { name: prev.description }),
      onUndo: async () => {
        await financeApi.restoreCost(prev, ...guard);
        await refresh();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletingCost, refresh, t, user.role, user.paymentsGrant]);

  /* ---------------- action openers ---------------- */
  const openCreate = () => {
    setEditing(null);
    setMilestoneDialogOpen(true);
  };
  const openEdit = (m: PaymentMilestone) => {
    setEditing(m);
    setMilestoneDialogOpen(true);
  };
  const openRecordPayment = (m: PaymentMilestone) => {
    setPayingMilestone(m);
    setPaymentDialogOpen(true);
  };

  /* ---------------- error state ---------------- */
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

  const summary =
    data?.summary ?? {
      contractedCents: 0,
      receivedCents: 0,
      pendingCents: 0,
      costsCents: 0,
      timeCostCents: 0,
      marginCents: 0,
      marginRatio: 0,
    };

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
                {t("actions.newMilestone")}
              </Button>
            ) : null}
          </div>
        }
      />

      <FinancialStatTiles summary={summary} loading={isLoading} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="gap-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MilestoneIcon className="size-5 text-gold" strokeWidth={1.8} aria-hidden />
                <div>
                  <CardTitle>{t("milestones.title")}</CardTitle>
                  <CardDescription>{t("milestones.subtitle")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PaymentMilestoneTable
                milestones={data?.milestones ?? []}
                loading={isLoading}
                canManage={canManage}
                onView={setDetail}
                onEdit={openEdit}
                onRecordPayment={openRecordPayment}
                onCancel={setCancelling}
              />
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-1">
          <MarginCard summary={summary} loading={isLoading} />
        </div>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-5 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <div>
              <CardTitle>{t("costs.title")}</CardTitle>
              <CardDescription>{t("costs.subtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProjectCostsPanel
            costs={data?.costs ?? []}
            loading={isLoading}
            canManage={canManage}
            onDelete={setDeletingCost}
            toolbar={
              canManage ? (
                <Button variant="outline" size="sm" onClick={() => setCostDialogOpen(true)}>
                  <Plus aria-hidden />
                  {t("actions.newCost")}
                </Button>
              ) : null
            }
          />
        </CardContent>
      </Card>

      {/* ---------------- Dialogs (write actions gated to canManage) ---------------- */}
      {canManage ? (
        <>
          <MilestoneFormDialog
            open={milestoneDialogOpen}
            onOpenChange={setMilestoneDialogOpen}
            projects={projectOptions}
            milestone={editing}
            onSubmit={editing ? handleUpdate : handleCreate}
          />
          <RecordPaymentDialog
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            milestone={payingMilestone}
            onSubmit={handleRecordPayment}
          />
          <ProjectCostDialog
            open={costDialogOpen}
            onOpenChange={setCostDialogOpen}
            projects={projectOptions}
            onSubmit={handleCreateCost}
          />
          <ConfirmDialog
            open={cancelling !== null}
            onOpenChange={(open) => {
              if (!open) setCancelling(null);
            }}
            variant="destructive"
            title={t("cancelConfirm.title")}
            description={
              cancelling
                ? t("cancelConfirm.description", { name: cancelling.description })
                : undefined
            }
            confirmLabel={t("cancelConfirm.confirm")}
            onConfirm={handleCancelMilestone}
          />
          <ConfirmDialog
            open={deletingCost !== null}
            onOpenChange={(open) => {
              if (!open) setDeletingCost(null);
            }}
            variant="destructive"
            title={t("deleteCostConfirm.title")}
            description={
              deletingCost
                ? t("deleteCostConfirm.description", { name: deletingCost.description })
                : undefined
            }
            confirmLabel={t("deleteCostConfirm.confirm")}
            onConfirm={handleDeleteCost}
          />
        </>
      ) : null}

      {/* ---------------- Milestone detail (read) ---------------- */}
      <DetailSidePanel
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail?.description}
        description={detail?.projectName}
      >
        {detail ? <MilestoneDetail milestone={detail} /> : null}
      </DetailSidePanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MilestoneDetail({ milestone }: { milestone: PaymentMilestone }) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const rows: Array<[string, React.ReactNode]> = [
    [t("detail.client"), milestone.clientName],
    [t("detail.status"), <StatusBadge key="s" status={milestone.status} />],
    [t("detail.amount"), formatEUR(milestone.amountCents, locale)],
    [t("detail.received"), formatEUR(milestone.receivedAmountCents, locale)],
    [t("detail.expectedDate"), formatDate(milestone.expectedDate)],
    [t("detail.invoicedDate"), formatDate(milestone.invoicedDate)],
    [t("detail.paidDate"), formatDate(milestone.paidDate)],
    [
      t("detail.externalRef"),
      milestone.externalInvoiceRef ? (
        <span className="font-mono text-xs">{milestone.externalInvoiceRef}</span>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <div className="space-y-6 p-6">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
        {rows.map(([label, value], i) => (
          <React.Fragment key={i}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium tabular-nums sm:text-left">{value}</dd>
          </React.Fragment>
        ))}
      </dl>

      <div className="space-y-1.5 border-t border-border pt-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("detail.completionCriteria")}
          <Badge variant="gold">{t("detail.required")}</Badge>
        </p>
        <p className="text-sm text-foreground">{milestone.completionCriteria}</p>
      </div>
    </div>
  );
}
