"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  TriangleAlert,
  Milestone as MilestoneIcon,
  ReceiptText,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, EmptyState, SkeletonCard, toast } from "@/components/shared";
import {
  FinancialStatTiles,
  MarginCard,
  PaymentMilestoneTable,
  ProjectCostsPanel,
} from "@/components/finance";
import { MilestoneFormDialog } from "@/components/finance/milestone-form-dialog";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { ProjectCostDialog } from "@/components/finance/project-cost-dialog";
import { financeApi } from "@/lib/api/finance";
import type {
  MilestoneInput,
  PaymentMilestone,
  ProjectCost,
  ProjectCostInput,
  RecordPaymentInput,
} from "@/lib/api/finance-types";
import { projectsApi } from "@/lib/api/projects";
import { ProjectError } from "@/lib/api/projects-types";
import type { Role } from "@/lib/session";

export interface FinanceiroTabProps {
  projectId: string;
  user: { role: Role; paymentsGrant: boolean };
}

/**
 * Financeiro tab (F8 × F14) — GATED. Only mounted for finance-authorized users
 * (Admin, or Gestor with the payments grant); ENTIRELY hidden from Membro
 * (BR-008). Reuses the finance component library with project-scoped data and a
 * live margin (BR-065/069). No fiscal terminology (BR-070/072).
 *
 * Milestones and costs are managed here, not only listed. The tab used to be
 * read-only and send you to /finance to change anything — which meant leaving
 * the project, finding it again in a global table, and losing the context you
 * were looking at it in. The dialogs were already built to be embedded in one
 * project (they take a `lockedProjectId`); they were simply never wired.
 */
export function FinanceiroTab({ projectId, user }: FinanceiroTabProps) {
  const t = useTranslations("projects.finance");
  const tf = useTranslations("finance");

  const [milestoneOpen, setMilestoneOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PaymentMilestone | null>(null);
  const [paying, setPaying] = React.useState<PaymentMilestone | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [costOpen, setCostOpen] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<PaymentMilestone | null>(null);
  const [deletingCost, setDeletingCost] = React.useState<ProjectCost | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects", "finance", projectId, user.role, user.paymentsGrant],
    queryFn: () => projectsApi.getProjectFinance(projectId, user.role, user.paymentsGrant),
    retry: (count, err) => !(err instanceof ProjectError) && count < 1,
  });

  const guard = [user.role, user.paymentsGrant] as const;
  const reload = React.useCallback(async () => {
    await refetch();
  }, [refetch]);

  async function run(fn: () => Promise<unknown>, successKey: string) {
    try {
      await fn();
      await reload();
      toast({ tone: "success", title: tf(successKey) });
    } catch {
      toast({ tone: "destructive", title: t("writeFailed") });
    }
  }

  if (isError) {
    const forbidden = error instanceof ProjectError && error.code === "forbidden";
    return (
      <EmptyState
        icon={TriangleAlert}
        title={forbidden ? t("forbiddenTitle") : t("errorTitle")}
        description={forbidden ? t("forbiddenDescription") : t("errorDescription")}
        action={
          forbidden ? undefined : (
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("retry")}
            </Button>
          )
        }
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FinancialStatTiles summary={data.summary} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* h-full on both: the grid row stretches its wrapper, but the card
            inside stopped at its content and left a hole under the shorter
            one. */}
        <div className="xl:col-span-2">
          <Card className="h-full gap-4">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MilestoneIcon className="size-5 text-signal" strokeWidth={1.8} aria-hidden />
                  <div>
                    <CardTitle>{t("milestonesTitle")}</CardTitle>
                    <CardDescription>{t("milestonesSubtitle")}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setMilestoneOpen(true);
                    }}
                  >
                    <Plus aria-hidden />
                    {tf("actions.newMilestone")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/finance" />}
                  >
                    {t("manage")}
                    <ExternalLink aria-hidden />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PaymentMilestoneTable
                milestones={data.milestones}
                canManage
                hideProjectColumn
                onEdit={(m) => {
                  setEditing(m);
                  setMilestoneOpen(true);
                }}
                onRecordPayment={(m) => {
                  setPaying(m);
                  setPayOpen(true);
                }}
                onCancel={(m) => setCancelling(m)}
              />
            </CardContent>
          </Card>
        </div>
        <div className="xl:col-span-1">
          <MarginCard summary={data.summary} className="h-full" />
        </div>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ReceiptText className="size-5 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              <div>
                <CardTitle>{t("costsTitle")}</CardTitle>
                <CardDescription>{t("costsSubtitle")}</CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setCostOpen(true)}>
              <Plus aria-hidden />
              {tf("actions.newCost")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ProjectCostsPanel
            costs={data.costs}
            canManage
            hideProjectColumn
            onDelete={(c) => setDeletingCost(c)}
          />
        </CardContent>
      </Card>

      <MilestoneFormDialog
        open={milestoneOpen}
        onOpenChange={setMilestoneOpen}
        projects={[]}
        milestone={editing}
        lockedProjectId={projectId}
        onSubmit={(input: MilestoneInput) =>
          run(
            () =>
              editing
                ? financeApi.updateMilestone(editing.id, input, ...guard)
                : financeApi.createMilestone(input, ...guard),
            editing ? "toasts.milestoneUpdated" : "toasts.milestoneCreated"
          )
        }
      />

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        milestone={paying}
        onSubmit={(input: RecordPaymentInput) =>
          run(
            () => financeApi.recordPayment((paying as PaymentMilestone).id, input, ...guard),
            "toasts.paymentRecorded"
          )
        }
      />

      <ProjectCostDialog
        open={costOpen}
        onOpenChange={setCostOpen}
        projects={[]}
        lockedProjectId={projectId}
        onSubmit={(input: ProjectCostInput) =>
          run(() => financeApi.createCost(input, ...guard), "toasts.costCreated")
        }
      />

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        variant="destructive"
        title={tf("cancelConfirm.title")}
        description={
          cancelling ? tf("cancelConfirm.description", { name: cancelling.description }) : undefined
        }
        confirmLabel={tf("cancelConfirm.confirm")}
        onConfirm={async () => {
          if (cancelling) {
            await run(
              () => financeApi.cancelMilestone(cancelling.id, ...guard),
              "toasts.milestoneCancelled"
            );
          }
          setCancelling(null);
        }}
      />

      <ConfirmDialog
        open={deletingCost !== null}
        onOpenChange={(open) => !open && setDeletingCost(null)}
        variant="destructive"
        title={tf("deleteCostConfirm.title")}
        confirmLabel={tf("deleteCostConfirm.confirm")}
        onConfirm={async () => {
          if (deletingCost) {
            await run(() => financeApi.deleteCost(deletingCost.id, ...guard), "toasts.costDeleted");
          }
          setDeletingCost(null);
        }}
      />
    </div>
  );
}
