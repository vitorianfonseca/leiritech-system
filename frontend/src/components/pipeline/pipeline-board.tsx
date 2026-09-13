"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, GitBranch, RefreshCw, TriangleAlert, Trophy, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, toast, toastWithUndo } from "@/components/shared";
import { canAccessFinance } from "@/lib/api/finance-types";
import { opportunitiesApi, pipelineRoutes } from "@/lib/api/opportunities";
import {
  OpportunityError,
  type CreateOpportunityInput,
  type LoseOpportunityInput,
  type MoveOpportunityInput,
  type Opportunity,
  type PipelineStage,
  type PipelineStageId,
  type ReopenOpportunityInput,
  type WinOpportunityResult,
} from "@/lib/api/opportunities-types";
import type { Role } from "@/lib/session";
import { PipelineColumn } from "./pipeline-column";
import { SortableOpportunityCard, OpportunityCardView } from "./opportunity-card";
import { MoveOpportunityDialog } from "./move-opportunity-dialog";
import { WonDialog } from "./won-dialog";
import { LostDialog } from "./lost-dialog";
import { ReopenDialog } from "./reopen-dialog";
import { CreateOpportunityDialog } from "./create-opportunity-dialog";

export interface PipelineBoardProps {
  user: { role: Role; userId: string; paymentsGrant: boolean };
}

interface PendingMove {
  opportunity: Opportunity;
  toStageId: PipelineStageId;
  fromStageId: PipelineStageId;
}

export function PipelineBoard({ user }: PipelineBoardProps) {
  const t = useTranslations("pipeline");
  const qc = useQueryClient();
  const router = useRouter();
  const canManage = user.role === "admin" || user.role === "gestor";
  const canFinance = canAccessFinance(user.role, user.paymentsGrant);

  const stagesQuery = useQuery({
    queryKey: ["pipeline", "stages"],
    queryFn: () => opportunitiesApi.getPipelineStages(),
  });
  const oppsKey = ["pipeline", "opportunities", user.role, user.userId, user.paymentsGrant] as const;
  const oppsQuery = useQuery({
    queryKey: oppsKey,
    queryFn: () => opportunitiesApi.listOpportunities(user.role, user.userId, user.paymentsGrant),
    retry: (count, err) => !(err instanceof OpportunityError) && count < 1,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pendingMove, setPendingMove] = React.useState<PendingMove | null>(null);
  const [wonOpp, setWonOpp] = React.useState<Opportunity | null>(null);
  const [lostOpp, setLostOpp] = React.useState<Opportunity | null>(null);
  const [reopenOpp, setReopenOpp] = React.useState<Opportunity | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["pipeline", "opportunities"] });
  }, [qc]);

  const opportunities = React.useMemo(() => oppsQuery.data ?? [], [oppsQuery.data]);
  const activeOpp = activeId ? opportunities.find((o) => o.id === activeId) ?? null : null;

  const byStage = React.useMemo(() => {
    const map = new Map<PipelineStageId, Opportunity[]>();
    for (const o of opportunities) {
      if (o.outcome !== null) continue;
      const list = map.get(o.stageId) ?? [];
      list.push(o);
      map.set(o.stageId, list);
    }
    return map;
  }, [opportunities]);

  const openCount = opportunities.filter((o) => o.outcome === null).length;
  const wonCount = opportunities.filter((o) => o.outcome === "won").length;
  const lostCount = opportunities.filter((o) => o.outcome === "lost").length;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const opp = opportunities.find((o) => o.id === String(active.id));
    if (!opp) return;
    const toStageId = String(over.id) as PipelineStageId;
    if (toStageId === opp.stageId) return; // dropped on own column — no-op
    setPendingMove({ opportunity: opp, toStageId, fromStageId: opp.stageId });
  }

  async function confirmMove(input: MoveOpportunityInput) {
    if (!pendingMove) return;
    const { opportunity: opp, fromStageId } = pendingMove;
    await opportunitiesApi.moveOpportunity(opp.id, input, user.userId);
    refresh();
    setPendingMove(null);
    toastWithUndo({
      title: t("toast.moved", { title: opp.title, stage: t(`stages.${input.toStageId}`) }),
      onUndo: async () => {
        await opportunitiesApi.moveOpportunity(
          opp.id,
          { toStageId: fromStageId, nextAction: input.nextAction, nextActionAt: input.nextActionAt },
          user.userId
        );
        refresh();
      },
    });
  }

  async function confirmWin(opp: Opportunity): Promise<WinOpportunityResult> {
    const res = await opportunitiesApi.winOpportunity(opp.id, user.userId);
    refresh();
    return res;
  }

  async function confirmLose(input: LoseOpportunityInput) {
    if (!lostOpp) return;
    await opportunitiesApi.loseOpportunity(lostOpp.id, input, user.userId);
    refresh();
    toast({ tone: "default", title: t("toast.lost", { title: lostOpp.title }) });
    setLostOpp(null);
  }

  async function confirmReopen(input: ReopenOpportunityInput) {
    if (!reopenOpp) return;
    await opportunitiesApi.reopenOpportunity(reopenOpp.id, input, user.userId);
    refresh();
    toast({ tone: "success", title: t("toast.reopened", { title: reopenOpp.title }) });
    setReopenOpp(null);
  }

  async function confirmCreate(input: CreateOpportunityInput) {
    await opportunitiesApi.createOpportunity(input, user.userId, canFinance);
    refresh();
    toast({ tone: "success", title: t("toast.created", { title: input.title }) });
  }

  /* ---------------- loading / error ---------------- */

  if (oppsQuery.isPending || stagesQuery.isPending) {
    return <BoardSkeleton />;
  }

  if (oppsQuery.isError || stagesQuery.isError) {
    const forbidden =
      oppsQuery.error instanceof OpportunityError && oppsQuery.error.code === "forbidden";
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon={TriangleAlert}
          title={forbidden ? t("errors.forbiddenTitle") : t("errors.loadTitle")}
          description={forbidden ? t("errors.forbiddenDescription") : t("errors.loadDescription")}
          action={
            forbidden ? undefined : (
              <Button variant="outline" size="lg" onClick={() => oppsQuery.refetch()}>
                <RefreshCw aria-hidden />
                {t("errors.retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const stages = (stagesQuery.data ?? []).slice().sort((a, b) => a.order - b.order);
  const isEmpty = openCount === 0 && wonCount === 0 && lostCount === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          canManage ? (
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t("newOpportunity")}
            </Button>
          ) : undefined
        }
      />

      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <SummaryPill icon={GitBranch} label={t("summary.open")} value={openCount} tone="signal" />
        <SummaryPill icon={Trophy} label={t("summary.won")} value={wonCount} tone="success" />
        <SummaryPill icon={XCircle} label={t("summary.lost")} value={lostCount} tone="muted" />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={GitBranch}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            canManage ? (
              <Button size="lg" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden />
                {t("newOpportunity")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {/* Same rule as the task board: the pane is the height of the screen
              and each column scrolls its own cards, so one busy stage cannot
              stretch five empty ones. The height only applies where the six
              stages sit on a single row — between sm and lg the grid wraps
              into two or three rows, and a fixed height would squash them. */}
          <div className="-mx-1 flex h-[clamp(24rem,calc(100dvh-19rem),48rem)] snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2 sm:grid sm:h-auto sm:snap-none sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3 xl:h-[clamp(24rem,calc(100dvh-19rem),48rem)] xl:grid-cols-6 xl:overflow-x-hidden xl:overflow-y-hidden">
            {stages.map((stage: PipelineStage) => {
              const items = byStage.get(stage.id) ?? [];
              const total = canFinance
                ? items.reduce((sum, o) => sum + (o.valueCents ?? 0), 0)
                : null;
              return (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  total={stages.length}
                  count={items.length}
                  valueCents={total}
                >
                  {items.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center px-1 text-center text-xs text-muted-foreground/70">
                      {t("column.empty")}
                    </p>
                  ) : (
                    items.map((o) => (
                      <SortableOpportunityCard
                        key={o.id}
                        opportunity={o}
                        canManage={canManage}
                        onWin={setWonOpp}
                        onLose={setLostOpp}
                        onReopen={setReopenOpp}
                      />
                    ))
                  )}
                </PipelineColumn>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeOpp ? (
              <OpportunityCardView opportunity={activeOpp} overlay canManage={canManage} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Dialogs */}
      {canManage ? (
        <>
          <MoveOpportunityDialog
            open={pendingMove !== null}
            onOpenChange={(o) => !o && setPendingMove(null)}
            opportunity={pendingMove?.opportunity ?? null}
            toStageId={pendingMove?.toStageId ?? null}
            onConfirm={confirmMove}
          />
          <WonDialog
            open={wonOpp !== null}
            onOpenChange={(o) => !o && setWonOpp(null)}
            opportunity={wonOpp}
            onConfirm={confirmWin}
            convertAvailable
            onConvert={(result) => router.push(pipelineRoutes.convert(result.opportunity.id))}
          />
          <LostDialog
            open={lostOpp !== null}
            onOpenChange={(o) => !o && setLostOpp(null)}
            opportunity={lostOpp}
            onConfirm={confirmLose}
          />
          <ReopenDialog
            open={reopenOpp !== null}
            onOpenChange={(o) => !o && setReopenOpp(null)}
            opportunity={reopenOpp}
            onConfirm={confirmReopen}
          />
          <CreateOpportunityDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            user={user}
            canFinance={canFinance}
            onConfirm={confirmCreate}
          />
        </>
      ) : null}
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof GitBranch;
  label: string;
  value: number;
  tone: "signal" | "success" | "muted";
}) {
  const toneClass =
    tone === "signal"
      ? "text-signal"
      : tone === "success"
        ? "text-success"
        : "text-muted-foreground";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
      <Icon className={`size-4 ${toneClass}`} strokeWidth={1.8} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-14 w-full animate-pulse rounded-t-xl bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
