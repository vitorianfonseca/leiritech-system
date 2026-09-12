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
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { listVariants, rowVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
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

/**
 * Severity is a 3px bar down the left edge of the row.
 *
 * In a dense queue a coloured pill on the right competes with the title it is
 * meant to qualify, and eight of them turn the panel into confetti. A stripe
 * at the start of the line is read before the text and never fights it — the
 * convention every log viewer and issue tracker converged on for good reason.
 * The status word stays in the row, so colour is never the sole carrier.
 */
const SEVERITY_BAR: Record<AttentionSeverity, string> = {
  overdue: "bg-status-overdue",
  atRisk: "bg-health-at-risk",
  due: "bg-status-due",
  blocked: "bg-status-blocked",
  attention: "bg-health-attention",
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
            <Badge variant="signal" aria-hidden>
              {totalItems}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto">
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
  const [expanded, setExpanded] = React.useState(false);

  const GroupIcon = GROUP_ICON[group.key];
  const overflow = group.items.length - GROUP_PREVIEW;
  const visible = expanded ? group.items : group.items.slice(0, GROUP_PREVIEW);

  return (
    <section aria-label={t(`groups.${group.key}`)}>
      <h3 className="label-micro flex items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground">
        <GroupIcon className="size-3 shrink-0" strokeWidth={2.2} aria-hidden />
        {t(`groups.${group.key}`)}
        <span className="font-data text-[0.7rem] font-normal opacity-70">
          {group.items.length}
        </span>
      </h3>

      <motion.ul variants={listVariants} initial="hidden" animate="visible">
        {visible.map((item) => (
          <motion.li variants={rowVariants} key={`${group.key}-${item.id}`}>
            <Link
              href={hrefFor(item.entityType, item.entityId)}
              className="group/row grid grid-cols-[2px_1fr_auto] items-stretch gap-3.5 border-b border-border pr-3 transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
            >
              {/* A hairline tick, inset from the row's edges. A full-bleed
                  slab of colour reads as a warning stripe on machinery; this
                  marks the row without shouting over its title. */}
              <span
                aria-hidden
                className={`my-2.5 w-0.5 rounded-full ${SEVERITY_BAR[item.severity]}`}
              />
              <span className="min-w-0 py-2.5">
                <span className="block truncate text-[0.8125rem] font-medium text-foreground">
                  {item.title}
                </span>
                {/* The meta string already opens with the status ("Bloqueada ·
                    aguarda cliente"), so prefixing the severity word repeated
                    it. The colour bar carries the severity; this line carries
                    the detail. */}
                {/* Prose, so it is set in the text face. Mono is for figures;
                    using it for a sentence is what made this read as a log. */}
                <span className="mt-0.5 block truncate text-[0.75rem] text-muted-foreground">
                  {t(`meta.${item.metaKey}`, item.metaParams)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 self-center text-[0.8125rem] font-medium text-signal">
                {t(`actions.${group.key}`)}
                <ChevronRight
                  className="size-3 transition-transform duration-[var(--duration-fast)] group-hover/row:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden
                />
              </span>
            </Link>
          </motion.li>
        ))}
      </motion.ul>

      {overflow > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="label-micro flex w-full items-center gap-1 border-b border-border px-3 py-1.5 text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
        >
          <ChevronRight
            className={cn(
              "size-3 transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
          {expanded ? t("showLess") : t("showMore", { count: overflow })}
        </button>
      ) : null}
    </section>
  );
}
