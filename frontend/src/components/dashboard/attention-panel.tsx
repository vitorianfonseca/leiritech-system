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
import { EmptyState, SkeletonList } from "@/components/shared";
import { cn } from "@/lib/utils";
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

/**
 * Severity reads as a dot plus its word, not a filled pill. Eight pills in a
 * column compete with the titles they are meant to qualify; a dot and a word
 * sit quietly beside them. Colour is never the only carrier — the word is
 * always there, so this survives greyscale and colour blindness alike.
 */
const SEVERITY: Record<AttentionSeverity, { dot: string; statusKey: string }> = {
  overdue: { dot: "bg-status-overdue", statusKey: "overdue" },
  atRisk: { dot: "bg-health-at-risk", statusKey: "atRisk" },
  due: { dot: "bg-status-due", statusKey: "due" },
  blocked: { dot: "bg-status-blocked", statusKey: "blocked" },
  attention: { dot: "bg-health-attention", statusKey: "attention" },
};

function hrefFor(entityType: AttentionEntityType, entityId: string): string {
  return recordRoutes[entityType](entityId);
}

/**
 * "Atenção necessária" (F2) — the first thing on the dashboard, because it is
 * the only part that asks something of a person.
 *
 * Set as a ledger: hairline rules between rows, no card inside a card, no
 * chips. Every row names what it is, how bad it is, and — the point of the
 * whole panel — **what to do next**, in signal blue. A list that tells you
 * six opportunities have no next action while offering no way to set one is
 * a report, not a tool.
 *
 * Groups are prioritized (most urgent first) and financial groups are
 * stripped upstream for unauthorized users (BR-008).
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
    <section className={cn("min-w-0", className)} aria-label={t("title")}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        {!loading && totalItems > 0 ? (
          <span className="text-sm tabular-nums text-muted-foreground">
            {totalItems}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="pt-4">
          <SkeletonList rows={5} />
        </div>
      ) : totalItems === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <div className="divide-y divide-border">
          {nonEmpty.map((group) => (
            <AttentionSection key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
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
    <section aria-label={t(`groups.${group.key}`)} className="py-5 first:pt-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
        <GroupIcon
          className="size-4 shrink-0 text-muted-foreground/70"
          strokeWidth={1.9}
          aria-hidden
        />
        {t(`groups.${group.key}`)}
        <span className="tabular-nums text-muted-foreground/60">
          {group.items.length}
        </span>
      </h3>

      <ul>
        {visible.map((item) => {
          const sev = SEVERITY[item.severity];
          return (
            <li key={`${group.key}-${item.id}`}>
              <Link
                href={hrefFor(item.entityType, item.entityId)}
                className="group/row -mx-2 flex items-center gap-4 rounded-md px-2 py-2.5 transition-colors duration-[var(--duration-fast)] hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`meta.${item.metaKey}`, item.metaParams)}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full", sev.dot)}
                  />
                  {ts(sev.statusKey)}
                </span>

                {/* The next action. The only blue on the row, and the reason
                    the row is here at all. */}
                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-signal sm:flex">
                  {t(`actions.${group.key}`)}
                  <ChevronRight
                    className="size-3.5 transition-transform duration-[var(--duration-fast)] group-hover/row:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden
                  />
                </span>
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
          className="mt-1 flex items-center gap-1 rounded text-xs font-medium text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none",
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
