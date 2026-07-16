"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatEUR } from "@/components/finance/finance-format";
import type { PipelineStage } from "@/lib/api/opportunities-types";
import { stageAccentStyle } from "./pipeline-format";

interface PipelineColumnProps {
  stage: PipelineStage;
  total: number;
  count: number;
  /** Sum of visible opportunity values in cents, or null when finance-gated. */
  valueCents: number | null;
  children: React.ReactNode;
}

/** A droppable buyer-progress column. Highlights on drag-over; shows the stage
 * default win-probability and a running total. */
export function PipelineColumn({
  stage,
  total,
  count,
  valueCents,
  children,
}: PipelineColumnProps) {
  const t = useTranslations("pipeline");
  const locale = useLocale();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } });

  return (
    <section
      aria-label={t(`stages.${stage.id}`)}
      className="group/col flex w-72 shrink-0 snap-start flex-col sm:w-full"
    >
      <div className="overflow-hidden rounded-t-xl">
        <div className="h-1 w-full" style={stageAccentStyle(stage.order - 1, total)} aria-hidden />
      </div>
      <div className="flex items-center justify-between gap-2 border-x border-t border-border bg-muted/40 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {t(`stages.${stage.id}`)}
          </h2>
          <p className="text-[0.6875rem] text-muted-foreground">
            {t("column.probability", { value: stage.winProbability })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="rounded-full bg-background px-2 text-xs font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
          {valueCents != null && valueCents > 0 ? (
            <span className="mt-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">
              {formatEUR(valueCents, locale)}
            </span>
          ) : null}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-b-xl border border-t-0 border-border bg-card/30 p-2 transition-colors",
          isOver && "bg-gold-muted/60 ring-2 ring-inset ring-gold/40"
        )}
      >
        {children}
      </div>
    </section>
  );
}
