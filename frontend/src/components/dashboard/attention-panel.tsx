"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Ban,
  ShieldAlert,
  GaugeCircle,
  Compass,
  FileClock,
  UserRoundCog,
  Wallet,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SkeletonList } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { recordRoutes } from "@/lib/api/dashboard";
import type {
  AttentionEntityType,
  AttentionGroup,
  AttentionGroupKey,
  AttentionSeverity,
} from "@/lib/api/dashboard-types";

const GROUP_ICON: Record<AttentionGroupKey, LucideIcon> = {
  overdueTasks: AlarmClock,
  blockedTasks: Ban,
  projectsAtRisk: ShieldAlert,
  lowProgressNearDelivery: GaugeCircle,
  opportunitiesNoNextAction: Compass,
  proposalsAwaiting: FileClock,
  overloadedMembers: UserRoundCog,
  overduePayments: Wallet,
};

/** Badge variant + `status.*` label key per urgency zone (DESIGN.md). */
const SEVERITY: Record<
  AttentionSeverity,
  { variant: React.ComponentProps<typeof Badge>["variant"]; statusKey: string }
> = {
  overdue: { variant: "overdue", statusKey: "overdue" },
  atRisk: { variant: "atRisk", statusKey: "atRisk" },
  due: { variant: "due", statusKey: "due" },
  blocked: { variant: "blocked", statusKey: "blocked" },
  attention: { variant: "attention", statusKey: "attention" },
};

/** Icon chip tint per severity — icon + colour, never colour alone. */
const SEVERITY_CHIP: Record<AttentionSeverity, string> = {
  overdue: "bg-status-overdue-bg text-status-overdue",
  atRisk: "bg-health-at-risk-bg text-health-at-risk",
  due: "bg-status-due-bg text-status-due",
  blocked: "bg-status-blocked-bg text-status-blocked",
  attention: "bg-health-attention-bg text-health-attention",
};

function hrefFor(entityType: AttentionEntityType, entityId: string): string {
  return recordRoutes[entityType](entityId);
}

/**
 * "Atenção necessária" (F2) — the actionable, grouped needs-attention panel.
 * Groups are prioritized (most urgent first), each row links directly to its
 * source record, and the empty state reads "tudo em dia". Fed by the fixed
 * automations (WORKFLOW_SPEC §6.1). Financial groups are stripped upstream for
 * unauthorized users (BR-008).
 */
export function AttentionPanel({
  groups,
  loading = false,
  className,
}: {
  groups: AttentionGroup[];
  loading?: boolean;
  className?: string;
}) {
  const t = useTranslations("dashboard.attention");

  const nonEmpty = groups.filter((g) => g.items.length > 0);
  const totalItems = nonEmpty.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          {!loading && totalItems > 0 ? (
            <Badge variant="gold" aria-hidden>
              {totalItems}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <SkeletonList rows={5} />
        ) : totalItems === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <div className="space-y-6">
            {nonEmpty.map((group) => (
              <AttentionSection key={group.key} group={group} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** How many rows a group shows before "ver mais" reveals the rest. */
const GROUP_PREVIEW = 4;

/**
 * One prioritized group. Long groups are capped to GROUP_PREVIEW rows with a
 * "ver mais / ver menos" toggle so a busy operation never renders an endless
 * wall of items — the panel stays scannable.
 */
function AttentionSection({ group }: { group: AttentionGroup }) {
  const t = useTranslations("dashboard.attention");
  const ts = useTranslations("status");
  const [expanded, setExpanded] = React.useState(false);

  const GroupIcon = GROUP_ICON[group.key];
  const overflow = group.items.length - GROUP_PREVIEW;
  const visible = expanded ? group.items : group.items.slice(0, GROUP_PREVIEW);

  return (
    <section aria-label={t(`groups.${group.key}`)}>
      <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <GroupIcon className="size-3.5" strokeWidth={1.8} aria-hidden />
        {t(`groups.${group.key}`)}
        <span className="text-muted-foreground/60">({group.items.length})</span>
      </h3>
      <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
        {visible.map((item) => {
          const sev = SEVERITY[item.severity];
          return (
            <li key={`${group.key}-${item.id}`}>
              <Link
                href={hrefFor(item.entityType, item.entityId)}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${SEVERITY_CHIP[item.severity]}`}
                >
                  <GroupIcon className="size-4" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`meta.${item.metaKey}`, item.metaParams)}
                  </p>
                </div>
                <Badge variant={sev.variant}>{ts(sev.statusKey)}</Badge>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/40"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
      {overflow > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden
          />
          {expanded ? t("showLess") : t("showMore", { count: overflow })}
        </button>
      ) : null}
    </section>
  );
}
