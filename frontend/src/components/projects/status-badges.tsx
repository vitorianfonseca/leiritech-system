"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  TriangleAlert,
  OctagonAlert,
  Compass,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Archive,
  Circle,
  CircleDashed,
  Ban,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DeliveryMilestoneStatus,
  PhaseState,
  ProjectHealth,
  ProjectState,
} from "@/lib/api/projects-types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/* --------------------------- Health (RAG) --------------------------- */

const HEALTH_META: Record<ProjectHealth, { variant: BadgeVariant; icon: LucideIcon }> = {
  healthy: { variant: "healthy", icon: CircleCheck },
  attention: { variant: "attention", icon: TriangleAlert },
  at_risk: { variant: "atRisk", icon: OctagonAlert },
};

/**
 * Published health badge. When health is only suggested (not yet published) the
 * badge is rendered muted/outlined to signal "sugestão" and pairs with a hint.
 */
export function HealthBadge({
  health,
  suggested = false,
  className,
}: {
  health: ProjectHealth;
  suggested?: boolean;
  className?: string;
}) {
  const t = useTranslations("projects.health");
  const meta = HEALTH_META[health];
  const Icon = meta.icon;
  return (
    <Badge
      variant={suggested ? "outline" : meta.variant}
      className={cn(suggested && "border-dashed text-muted-foreground", className)}
    >
      <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
      {t(health)}
      {suggested ? <span className="ml-0.5 text-[0.6875rem]">· {t("suggestedShort")}</span> : null}
    </Badge>
  );
}

/* --------------------------- Project state --------------------------- */

const STATE_META: Record<ProjectState, { variant: BadgeVariant; icon: LucideIcon }> = {
  planning: { variant: "outline", icon: Compass },
  active: { variant: "gold", icon: PlayCircle },
  on_hold: { variant: "warning", icon: PauseCircle },
  completed: { variant: "success", icon: CheckCircle2 },
  cancelled: { variant: "destructive", icon: XCircle },
  archived: { variant: "done", icon: Archive },
};

export function ProjectStateBadge({
  state,
  className,
}: {
  state: ProjectState;
  className?: string;
}) {
  const t = useTranslations("projects.states");
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className}>
      <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
      {t(state)}
    </Badge>
  );
}

/* --------------------------- Phase state --------------------------- */

const PHASE_META: Record<PhaseState, { variant: BadgeVariant; icon: LucideIcon }> = {
  not_started: { variant: "outline", icon: CircleDashed },
  in_progress: { variant: "info", icon: Circle },
  blocked: { variant: "blocked", icon: Ban },
  completed: { variant: "success", icon: CheckCircle2 },
};

export function PhaseStateBadge({
  state,
  className,
}: {
  state: PhaseState;
  className?: string;
}) {
  const t = useTranslations("projects.phaseStates");
  const meta = PHASE_META[state];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className}>
      <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
      {t(state)}
    </Badge>
  );
}

/* --------------------------- Delivery milestone --------------------------- */

const DELIVERY_META: Record<DeliveryMilestoneStatus, { variant: BadgeVariant; icon: LucideIcon }> = {
  upcoming: { variant: "outline", icon: Clock },
  due_soon: { variant: "due", icon: Clock },
  overdue: { variant: "overdue", icon: TriangleAlert },
  met: { variant: "done", icon: CheckCircle2 },
};

export function DeliveryMilestoneBadge({
  status,
  className,
}: {
  status: DeliveryMilestoneStatus;
  className?: string;
}) {
  const t = useTranslations("projects.deliveryStatus");
  const meta = DELIVERY_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className}>
      <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
      {t(status)}
    </Badge>
  );
}

/* --------------------------- Attention flag --------------------------- */

export function TaskFlagBadge({
  flag,
  className,
}: {
  flag: "overdue" | "blocked";
  className?: string;
}) {
  const t = useTranslations("projects.taskFlags");
  return (
    <Badge variant={flag === "overdue" ? "overdue" : "blocked"} className={className}>
      {flag === "overdue" ? (
        <TriangleAlert className="size-3.5" strokeWidth={1.8} aria-hidden />
      ) : (
        <Ban className="size-3.5" strokeWidth={1.8} aria-hidden />
      )}
      {t(flag)}
    </Badge>
  );
}
