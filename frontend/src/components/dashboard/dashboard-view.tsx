"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { dashboardApi } from "@/lib/api/dashboard";
import type { Role } from "@/lib/session";
import { stage, stageItem } from "@/lib/motion";
import { Momentum } from "./momentum";
import { AttentionPanel } from "./attention-panel";
import { AgendaCard } from "./agenda-card";
import { RecentActivity } from "./recent-activity";

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
 * The dashboard answers three questions, in this order, and nothing else:
 *
 *   1. **What needs me?**   — the standfirst, then the attention queue.
 *   2. **Where do we stand?** — the chain: pipeline → proposals → projects → cash.
 *   3. **What's today?**    — the agenda.
 *
 * What it is deliberately *not*: a grid of six KPI cards. Giving every figure
 * an identical bordered, shadowed box gives them all the same weight and none
 * of them any hierarchy, which is the thing that makes a dashboard read as a
 * template. The figures that matter live inside the chain, where they carry
 * their own context; the rest are one click away on the page that owns them.
 *
 * Role scoping and financial gating are enforced by the API (BR-002/008);
 * this view only renders what the payload contains.
 */
export function DashboardView({ user }: DashboardViewProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", user.id, user.role, user.paymentsGrant] as const,
    queryFn: () => dashboardApi.getDashboard(user.id, user.role, user.paymentsGrant),
  });

  const attentionCount = React.useMemo(
    () => (data?.attention ?? []).reduce((n, g) => n + g.items.length, 0),
    [data],
  );

  const today = React.useMemo(() => {
    const formatted = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [locale]);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <h1 className="font-heading text-[clamp(1.6rem,3.6vw,2.25rem)] leading-[1.1] font-bold text-balance text-foreground">
          {t(`greeting.${greetingKey()}`, { name: user.firstName })}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{today}</p>
        <p className="mt-4 max-w-[46ch] text-lg leading-snug text-pretty text-muted-foreground">
          {isLoading ? (
            <span className="inline-block h-6 w-64 animate-pulse rounded bg-muted align-middle" />
          ) : attentionCount > 0 ? (
            t.rich("standfirst.needsAttention", {
              count: attentionCount,
              strong: (chunks) => (
                <strong className="font-semibold tabular-nums text-foreground">{chunks}</strong>
              ),
            })
          ) : (
            t("standfirst.allClear")
          )}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("actions.refresh")}
        onClick={() => refetch()}
        disabled={isFetching}
      >
        <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden />
      </Button>
    </div>
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

  return (
    <motion.div variants={stage} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stageItem}>{header}</motion.div>

      <motion.div variants={stageItem}>
        <Momentum data={data} loading={isLoading} />
      </motion.div>

      <motion.div
        variants={stageItem}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <AttentionPanel groups={data?.attention ?? []} loading={isLoading} />
        <div className="space-y-6">
          <AgendaCard user={{ id: user.id, role: user.role }} />
          <RecentActivity />
        </div>
      </motion.div>
    </motion.div>
  );
}
