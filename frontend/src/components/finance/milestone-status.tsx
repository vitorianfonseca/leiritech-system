"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CircleDashed,
  Send,
  CircleDollarSign,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type {
  PaymentMilestone,
  PaymentMilestoneStatus,
} from "@/lib/api/finance-types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/**
 * Map a milestone status to its badge variant + icon. The `invoiced` value is
 * deliberately labelled with a NON-fiscal term (BR-070/072) — the label copy
 * lives in the i18n bundle under `finance.status.invoiced` ("Emitido").
 */
const STATUS_META: Record<
  PaymentMilestoneStatus,
  { variant: BadgeVariant; icon: LucideIcon }
> = {
  planned: { variant: "default", icon: CircleDashed },
  invoiced: { variant: "info", icon: Send },
  partially_paid: { variant: "warning", icon: CircleDollarSign },
  paid: { variant: "success", icon: CheckCircle2 },
  overdue: { variant: "overdue", icon: AlertTriangle },
  cancelled: { variant: "done", icon: Ban },
};

/** Number of days out that counts as "due soon" (AUTO-08). */
export const DUE_SOON_DAYS = 7;

export type Urgency = "overdue" | "due_soon" | "none";

/**
 * Derive urgency for highlighting (AUTO-02/08). Overdue = alarm; due soon =
 * countdown; otherwise none. Paid/cancelled milestones are never urgent.
 */
export function milestoneUrgency(m: PaymentMilestone): Urgency {
  if (m.status === "paid" || m.status === "cancelled") return "none";
  if (m.status === "overdue") return "overdue";
  const days = differenceInCalendarDays(
    parseISO(m.expectedDate),
    startOfDay(new Date())
  );
  if (days >= 0 && days <= DUE_SOON_DAYS) return "due_soon";
  return "none";
}

export function StatusBadge({ status }: { status: PaymentMilestoneStatus }) {
  const t = useTranslations("finance");
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden />
      {t(`status.${status}`)}
    </Badge>
  );
}

/**
 * Small urgency chip shown next to the expected date. Uses icon + text so the
 * urgency is never conveyed by colour alone (WCAG AA).
 */
export function UrgencyHint({ milestone }: { milestone: PaymentMilestone }) {
  const t = useTranslations("finance");
  const urgency = milestoneUrgency(milestone);
  if (urgency === "none") return null;

  const days = differenceInCalendarDays(
    parseISO(milestone.expectedDate),
    startOfDay(new Date())
  );

  if (urgency === "overdue") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-status-overdue">
        <AlertTriangle className="size-3.5" strokeWidth={1.8} aria-hidden />
        {t("urgency.overdue", { days: Math.abs(days) })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-due">
      <Clock className="size-3.5" strokeWidth={1.8} aria-hidden />
      {t("urgency.dueSoon", { days })}
    </span>
  );
}
