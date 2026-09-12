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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, SkeletonCard } from "@/components/shared";
import {
  FinancialStatTiles,
  MarginCard,
  PaymentMilestoneTable,
  ProjectCostsPanel,
} from "@/components/finance";
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
 * live margin (BR-065/069). Read-only here — milestone/cost management lives in
 * /finance. No fiscal terminology (BR-070/072).
 */
export function FinanceiroTab({ projectId, user }: FinanceiroTabProps) {
  const t = useTranslations("projects.finance");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects", "finance", projectId, user.role, user.paymentsGrant],
    queryFn: () => projectsApi.getProjectFinance(projectId, user.role, user.paymentsGrant),
    retry: (count, err) => !(err instanceof ProjectError) && count < 1,
  });

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
        <div className="xl:col-span-2">
          <Card className="gap-4">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MilestoneIcon className="size-5 text-signal" strokeWidth={1.8} aria-hidden />
                  <div>
                    <CardTitle>{t("milestonesTitle")}</CardTitle>
                    <CardDescription>{t("milestonesSubtitle")}</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/finance" />}>
                  {t("manage")}
                  <ExternalLink aria-hidden />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PaymentMilestoneTable
                milestones={data.milestones}
                canManage={false}
                hideProjectColumn
              />
            </CardContent>
          </Card>
        </div>
        <div className="xl:col-span-1">
          <MarginCard summary={data.summary} />
        </div>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-5 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <div>
              <CardTitle>{t("costsTitle")}</CardTitle>
              <CardDescription>{t("costsSubtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProjectCostsPanel costs={data.costs} canManage={false} hideProjectColumn />
        </CardContent>
      </Card>
    </div>
  );
}
