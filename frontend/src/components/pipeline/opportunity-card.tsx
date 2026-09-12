"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  MoreHorizontal,
  Trophy,
  XCircle,
  ArrowUpRight,
  CalendarClock,
  TriangleAlert,
  RotateCcw,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  isNextActionOverdue,
  type Opportunity,
} from "@/lib/api/opportunities-types";
import { pipelineRoutes } from "@/lib/api/opportunities";
import { formatEUR, formatDate, initials } from "./pipeline-format";

export interface OpportunityCardActions {
  onWin: (o: Opportunity) => void;
  onLose: (o: Opportunity) => void;
  onReopen?: (o: Opportunity) => void;
  canManage: boolean;
}

interface CardViewProps extends Partial<OpportunityCardActions> {
  opportunity: Opportunity;
  dragging?: boolean;
  overlay?: boolean;
  /** Rendered drag handle (draggable activator). Omitted in the overlay. */
  handle?: React.ReactNode;
}

/** Presentational card — reused inside the DragOverlay (no dnd hooks). */
export function OpportunityCardView({
  opportunity: o,
  dragging,
  overlay,
  handle,
  onWin,
  onLose,
  onReopen,
  canManage,
}: CardViewProps) {
  const t = useTranslations("pipeline.card");
  const locale = useLocale();
  const overdue = isNextActionOverdue(o);
  const missing = !o.nextAction;

  return (
    <div
      className={cn(
        "group/card rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow",
        "focus-within:ring-2 focus-within:ring-ring/50",
        dragging && "opacity-40",
        overlay && "rotate-2 shadow-lg ring-1 ring-signal/40"
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        {handle}
        <Link
          href={pipelineRoutes.opportunity(o.id)}
          className="min-w-0 flex-1 rounded text-sm font-medium leading-snug text-foreground outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-ring"
        >
          {o.title}
        </Link>
        {canManage && !overlay ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("actions")}
                  className="shrink-0 text-muted-foreground"
                />
              }
            >
              <MoreHorizontal aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem render={<Link href={pipelineRoutes.opportunity(o.id)} />}>
                <ArrowUpRight aria-hidden />
                {t("viewDetail")}
              </DropdownMenuItem>
              {o.outcome === null ? (
                <>
                  <DropdownMenuItem onClick={() => onWin?.(o)}>
                    <Trophy aria-hidden />
                    {t("markWon")}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onLose?.(o)}>
                    <XCircle aria-hidden />
                    {t("markLost")}
                  </DropdownMenuItem>
                </>
              ) : null}
              {o.outcome === "lost" && onReopen ? (
                <DropdownMenuItem onClick={() => onReopen(o)}>
                  <RotateCcw aria-hidden />
                  {t("reopen")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">{o.companyName}</p>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {o.valueCents != null ? (
          <span className="font-heading text-sm font-semibold tabular-nums text-foreground">
            {formatEUR(o.valueCents, locale)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("valueRestricted")}</span>
        )}
        <Badge variant="signal" className="tabular-nums">
          {t("probability", { value: o.probability })}
        </Badge>
      </div>

      {/* Próxima ação (BR-010) — highlight when missing or overdue */}
      <div
        className={cn(
          "mt-2.5 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs",
          missing && "bg-warning-muted text-warning",
          overdue && "bg-status-overdue-bg text-status-overdue",
          !missing && !overdue && "text-muted-foreground"
        )}
      >
        {missing ? (
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
        ) : (
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
        )}
        <span className="min-w-0">
          {missing ? (
            <span className="font-medium">{t("noNextAction")}</span>
          ) : (
            <>
              <span className={cn("block truncate", overdue && "font-medium")}>{o.nextAction}</span>
              {o.nextActionAt ? (
                <span className="text-[0.6875rem] opacity-80">
                  {overdue ? t("overdueSince", { date: formatDate(o.nextActionAt) }) : formatDate(o.nextActionAt)}
                </span>
              ) : null}
            </>
          )}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <Avatar className="size-5">
          <AvatarFallback className="text-[0.625rem]">{initials(o.ownerName)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-xs text-muted-foreground">{o.ownerName}</span>
      </div>
    </div>
  );
}

interface SortableProps extends OpportunityCardActions {
  opportunity: Opportunity;
}

/** Draggable card. The drag activator is a dedicated handle (keyboard-accessible
 * via dnd-kit's KeyboardSensor); the body stays clickable for the detail link
 * and the actions menu. */
export function SortableOpportunityCard({ opportunity: o, ...actions }: SortableProps) {
  const t = useTranslations("pipeline.card");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: o.id,
    data: { stageId: o.stageId },
    disabled: !actions.canManage,
  });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
  };

  const handle = actions.canManage ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t("dragHandle", { title: o.title })}
      className="-ml-0.5 mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <GripVertical className="size-4" strokeWidth={1.8} aria-hidden />
    </button>
  ) : null;

  return (
    <div ref={setNodeRef} style={style}>
      <OpportunityCardView opportunity={o} dragging={isDragging} handle={handle} {...actions} />
    </div>
  );
}
