"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { Masthead } from "./masthead";
import { listVariants, rowVariants } from "@/lib/motion";
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
    <Masthead
      greeting={greeting}
      attention={data?.attention ?? []}
      loading={isLoading}
      onRefresh={() => refetch()}
      refreshing={isFetching}
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
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="visible"
      className="space-y-12"
    >
      {header}

      {/* 1 — Attention. What needs a person, before anything else. */}
      <motion.section variants={rowVariants}>
        <AttentionPanel groups={data?.attention ?? []} loading={isLoading} />
      </motion.section>

      {/* 2 — Today. What is actually on the calendar, and how the week flows. */}
      <motion.section variants={rowVariants} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AgendaCard
          user={{ id: user.id, role: user.role }}
          className="lg:col-span-2"
        />
        {isLoading || showTaskFlow ? (
          <TaskFlowChart data={charts?.taskFlow ?? []} loading={isLoading} />
        ) : null}
      </motion.section>

      {/* 3 — The state of the business. Figures read as a line, not a card grid. */}
      <motion.section variants={rowVariants}>
        <StatTiles metrics={data?.metrics ?? []} loading={isLoading} />
      </motion.section>

      {/* 4 — Trends last: context for the numbers above, not the headline. */}
      {(isLoading && managementView) || showPipeline ? (
        <motion.section variants={rowVariants}>
          <PipelineEvolutionChart data={charts?.pipeline ?? []} loading={isLoading} />
        </motion.section>
      ) : null}

      {showContractedReceived ? (
        <motion.section variants={rowVariants}>
          <ContractedReceivedChart
            data={charts?.contractedReceived ?? []}
            loading={isLoading}
          />
        </motion.section>
      ) : null}
    </motion.div>
  );
}
