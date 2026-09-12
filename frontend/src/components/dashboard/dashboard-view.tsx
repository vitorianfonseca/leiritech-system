"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { dashboardApi } from "@/lib/api/dashboard";
import type { Role } from "@/lib/session";
import { StatTiles } from "./stat-tiles";
import { AttentionPanel } from "./attention-panel";
import { AgendaCard } from "./agenda-card";
import { WelcomeBanner } from "./welcome-banner";
import { TaskFlowChart } from "./dashboard-charts";

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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", user.id, user.role, user.paymentsGrant] as const,
    queryFn: () => dashboardApi.getDashboard(user.id, user.role, user.paymentsGrant),
  });

  const greeting = t(`greeting.${greetingKey()}`, { name: user.firstName });

  const attentionCount = (data?.attention ?? []).reduce(
    (n, g) => n + g.items.length,
    0,
  );

  const header = (
    <WelcomeBanner
      greeting={greeting}
      attentionCount={attentionCount}
      groups={data?.attention ?? []}
      loading={isLoading}
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

  const charts = data?.charts;
  const showTaskFlow = !!charts && charts.taskFlow.length > 0;

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


    </div>
  );
}
