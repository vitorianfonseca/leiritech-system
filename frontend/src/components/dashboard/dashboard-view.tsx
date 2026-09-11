"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shared";
import { dashboardApi } from "@/lib/api/dashboard";
import type { Role } from "@/lib/session";
import { StatTiles } from "./stat-tiles";
import { AttentionPanel } from "./attention-panel";
import { AgendaCard } from "./agenda-card";
import {
  PipelineEvolutionChart,
  TaskFlowChart,
  ContractedReceivedChart,
} from "./dashboard-charts";

export interface DashboardViewProps {
  user: { id: string; firstName: string; role: Role; paymentsGrant: boolean };
}

function greetingKey(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 20) return "afternoon";
  return "evening";
}

/**
 * The management dashboard (F2). Assembles the headline tiles, the actionable
 * "Atenção necessária" panel and the charts with live data (TanStack Query).
 * Role scoping and financial gating are enforced by the API client; this view
 * only renders what the payload contains (BR-002/008). Loading, empty and error
 * states are all handled.
 */
export function DashboardView({ user }: DashboardViewProps) {
  const t = useTranslations("dashboard");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", user.id, user.role, user.paymentsGrant] as const,
    queryFn: () => dashboardApi.getDashboard(user.id, user.role, user.paymentsGrant),
  });

  const greeting = t(`greeting.${greetingKey()}`, { name: user.firstName });

  const header = (
    <PageHeader
      title={greeting}
      subtitle={data?.scoped ? t("subtitleScoped") : t("subtitle")}
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("actions.refresh")}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden />
        </Button>
      }
    />
  );

  if (isError) {
    return (
      <div className="space-y-8">
        {header}
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

  // Role is known from props, so management-only skeletons never flash for a Membro.
  const managementView = user.role !== "membro";
  const charts = data?.charts;
  const showPipeline = !!charts && charts.pipeline.length > 0;
  const showTaskFlow = !!charts && charts.taskFlow.length > 0;
  const showContractedReceived = !!charts && !!charts.contractedReceived;

  return (
    <div className="space-y-8">
      {header}

      <StatTiles metrics={data?.metrics ?? []} loading={isLoading} />

      {/* Attention (2/3) + right rail: task flow over the week's agenda (1/3) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AttentionPanel
          groups={data?.attention ?? []}
          loading={isLoading}
          className="lg:col-span-2 lg:h-[38rem]"
        />
        <div className="flex flex-col gap-6 lg:h-[38rem]">
          {isLoading || showTaskFlow ? (
            <TaskFlowChart data={charts?.taskFlow ?? []} loading={isLoading} />
          ) : null}
          <AgendaCard user={{ id: user.id, role: user.role }} className="min-h-0 flex-1" />
        </div>
      </div>

      {/* Pipeline evolution */}
      {(isLoading && managementView) || showPipeline ? (
        <PipelineEvolutionChart data={charts?.pipeline ?? []} loading={isLoading} />
      ) : null}

      {/* Contracted vs received — GATED (BR-008) */}
      {showContractedReceived ? (
        <ContractedReceivedChart
          data={charts?.contractedReceived ?? []}
          loading={isLoading}
        />
      ) : null}
    </div>
  );
}
