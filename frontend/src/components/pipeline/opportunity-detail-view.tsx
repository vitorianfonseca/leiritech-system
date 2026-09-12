"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  RefreshCw,
  TriangleAlert,
  Trophy,
  XCircle,
  RotateCcw,
  CalendarClock,
  Check,
  Pencil,
  GitBranch,
  FolderPlus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ActivityFeed,
  CommentThread,
  EmptyState,
  SkeletonCard,
  toast,
} from "@/components/shared";
import { cn } from "@/lib/utils";
import { crmRoutes } from "@/lib/api/crm";
import { opportunitiesApi, opportunityCollaborationApi, pipelineRoutes } from "@/lib/api/opportunities";
import { projectRoutes } from "@/lib/api/projects";
import {
  OpportunityError,
  isNextActionOverdue,
  type LoseOpportunityInput,
  type Opportunity,
  type ReopenOpportunityInput,
  type WinOpportunityResult,
} from "@/lib/api/opportunities-types";
import type { Role } from "@/lib/session";
import { formatEUR, formatDate, initials } from "./pipeline-format";
import { WonDialog } from "./won-dialog";
import { LostDialog } from "./lost-dialog";
import { ReopenDialog } from "./reopen-dialog";

export interface OpportunityDetailViewProps {
  opportunityId: string;
  user: {
    role: Role;
    userId: string;
    paymentsGrant: boolean;
    name: string;
    avatarUrl: string | null;
  };
}

export function OpportunityDetailView({ opportunityId, user }: OpportunityDetailViewProps) {
  const t = useTranslations("pipeline.detail");
  const tStages = useTranslations("pipeline.stages");
  const tReason = useTranslations("pipeline.lostReasons");
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const canManage = user.role === "admin" || user.role === "gestor";

  const queryKey = ["pipeline", "opportunity", opportunityId, user.role, user.userId, user.paymentsGrant] as const;
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => opportunitiesApi.getOpportunity(opportunityId, user.role, user.userId, user.paymentsGrant),
    retry: (count, err) => !(err instanceof OpportunityError) && count < 1,
  });

  const [wonOpen, setWonOpen] = React.useState(false);
  const [lostOpen, setLostOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [editingProb, setEditingProb] = React.useState(false);
  const [probValue, setProbValue] = React.useState("");

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["collaboration"] });
  }, [qc]);

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    const notFound =
      error instanceof OpportunityError &&
      (error.code === "not_found" || error.code === "forbidden");
    return (
      <div className="space-y-6">
        <BackLink label={t("back")} />
        <EmptyState
          icon={notFound ? GitBranch : TriangleAlert}
          title={notFound ? t("notFoundTitle") : t("errorTitle")}
          description={notFound ? t("notFoundDescription") : t("errorDescription")}
          action={
            notFound ? (
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/crm/pipeline" />}>
                {t("backToBoard")}
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={() => refetch()}>
                <RefreshCw aria-hidden />
                {t("retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const o: Opportunity = data;
  const overdue = isNextActionOverdue(o);

  async function confirmWin(op: Opportunity): Promise<WinOpportunityResult> {
    const res = await opportunitiesApi.winOpportunity(op.id, user.userId);
    refresh();
    return res;
  }
  async function confirmLose(input: LoseOpportunityInput) {
    await opportunitiesApi.loseOpportunity(o.id, input, user.userId);
    refresh();
    toast({ title: t("toast.lost") });
    setLostOpen(false);
  }
  async function confirmReopen(input: ReopenOpportunityInput) {
    await opportunitiesApi.reopenOpportunity(o.id, input, user.userId);
    refresh();
    toast({ tone: "success", title: t("toast.reopened") });
    setReopenOpen(false);
  }
  async function saveProbability() {
    const n = Number(probValue);
    if (Number.isFinite(n)) {
      await opportunitiesApi.updateProbability(o.id, n, user.userId);
      refresh();
      toast({ tone: "success", title: t("toast.probabilityUpdated") });
    }
    setEditingProb(false);
  }

  return (
    <div className="space-y-6">
      <BackLink label={t("back")} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="page-title">
            {o.title}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {o.outcome === "won" ? (
              <Badge variant="success">
                <Trophy className="size-3.5" strokeWidth={1.8} aria-hidden />
                {t("statusWon")}
              </Badge>
            ) : o.outcome === "lost" ? (
              <Badge variant="done">
                <XCircle className="size-3.5" strokeWidth={1.8} aria-hidden />
                {t("statusLost")}
              </Badge>
            ) : (
              <Badge variant="signal">{tStages(o.stageId)}</Badge>
            )}
            <Link
              href={crmRoutes.company(o.companyId)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Building2 className="size-3.5" strokeWidth={1.8} aria-hidden />
              {o.companyName}
            </Link>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Avatar className="size-5">
              <AvatarFallback className="text-[0.625rem]">{initials(o.ownerName)}</AvatarFallback>
            </Avatar>
            {t("ownedBy", { name: o.ownerName })}
          </p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {o.outcome === null ? (
              <>
                <Button size="sm" onClick={() => setWonOpen(true)}>
                  <Trophy aria-hidden />
                  {t("markWon")}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setLostOpen(true)}>
                  <XCircle aria-hidden />
                  {t("markLost")}
                </Button>
              </>
            ) : null}
            {o.outcome === "lost" ? (
              <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>
                <RotateCcw aria-hidden />
                {t("reopen")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Won terminal banner (BR-013) + conversion CTA (#31, BR-035) */}
      {o.outcome === "won" ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success-muted px-4 py-3 text-sm text-success sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <Trophy className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
            {t("wonBanner", { date: o.wonAt ? formatDate(o.wonAt) : "" })}
          </span>
          {canManage ? (
            o.converted && o.projectId ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={projectRoutes.detail(o.projectId)} />}
              >
                <ArrowRight aria-hidden />
                {t("viewProject")}
              </Button>
            ) : (
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href={pipelineRoutes.convert(o.id)} />}
              >
                <FolderPlus aria-hidden />
                {t("createProject")}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
      {o.outcome === "lost" ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          <XCircle className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
          {t("lostBanner", {
            date: o.lostAt ? formatDate(o.lostAt) : "",
            reason: o.lostReason ? tReason(o.lostReason) : "",
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Facts */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{t("factsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Fact label={t("value")}>
              {o.valueCents != null ? (
                <span className="font-heading font-semibold tabular-nums">{formatEUR(o.valueCents, locale)}</span>
              ) : (
                <span className="text-muted-foreground">{t("valueRestricted")}</span>
              )}
            </Fact>

            <Fact label={t("probability")}>
              {editingProb && canManage ? (
                <span className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={probValue}
                    onChange={(e) => setProbValue(e.target.value)}
                    className="h-7 w-20"
                    aria-label={t("probability")}
                  />
                  <Button size="icon-sm" onClick={saveProbability} aria-label={t("save")}>
                    <Check aria-hidden />
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{o.probability}%</span>
                  {canManage && o.outcome === null ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("editProbability")}
                      onClick={() => {
                        setProbValue(String(o.probability));
                        setEditingProb(true);
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  ) : null}
                </span>
              )}
            </Fact>

            {o.outcome === null ? (
              <Fact label={t("nextAction")}>
                {o.nextAction ? (
                  <span
                    className={cn(
                      "flex items-start gap-1.5 rounded-lg px-2 py-1.5",
                      overdue ? "bg-status-overdue-bg text-status-overdue" : "text-foreground"
                    )}
                  >
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
                    <span>
                      <span className="block">{o.nextAction}</span>
                      {o.nextActionAt ? (
                        <span className="text-xs opacity-80">
                          {overdue ? t("overdueSince", { date: formatDate(o.nextActionAt) }) : formatDate(o.nextActionAt)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-warning">
                    <TriangleAlert className="size-3.5" strokeWidth={1.8} aria-hidden />
                    {t("noNextAction")}
                  </span>
                )}
              </Fact>
            ) : null}

            {o.outcome === "lost" && o.lostReasonNote ? (
              <Fact label={t("lostNote")}>
                <span className="text-muted-foreground">{o.lostReasonNote}</span>
              </Fact>
            ) : null}

            <Fact label={t("created")}>
              <span className="text-muted-foreground">{formatDate(o.createdAt.slice(0, 10))}</span>
            </Fact>
          </CardContent>
        </Card>

        {/* Activity + notes */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("notesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CommentThread
                entityType="opportunity"
                entityId={o.id}
                api={opportunityCollaborationApi}
                currentUser={
                  canManage ? { id: user.userId, name: user.name, avatarUrl: user.avatarUrl } : undefined
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("timelineTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed entityType="opportunity" entityId={o.id} api={opportunityCollaborationApi} />
            </CardContent>
          </Card>
        </div>
      </div>

      {canManage ? (
        <>
          <WonDialog
            open={wonOpen}
            onOpenChange={setWonOpen}
            opportunity={o}
            onConfirm={confirmWin}
            convertAvailable
            onConvert={() => router.push(pipelineRoutes.convert(o.id))}
          />
          <LostDialog open={lostOpen} onOpenChange={setLostOpen} opportunity={o} onConfirm={confirmLose} />
          <ReopenDialog open={reopenOpen} onOpenChange={setReopenOpen} opportunity={o} onConfirm={confirmReopen} />
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/crm/pipeline"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  );
}
