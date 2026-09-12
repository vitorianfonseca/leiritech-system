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
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { listStage, listItem, spring } from "@/lib/motion";
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
          // Shaped like the queue it replaces: a group heading, then rows with
          // a severity tick and titles of differing length.
          <div className="space-y-6" aria-hidden>
            {[0, 1].map((g) => (
              <div key={g} className="space-y-2">
                <div className="h-2.5 w-28 animate-pulse rounded bg-muted/70" />
                {[0, 1].map((r) => (
                  <div key={r} className="flex items-center gap-3.5">
                    <div className="h-8 w-0.5 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div
                        className="h-3 animate-pulse rounded bg-muted"
                        style={{ width: `${58 - r * 12 - g * 6}%` }}
                      />
                      <div
                        className="h-2.5 animate-pulse rounded bg-muted/60"
                        style={{ width: `${40 - r * 8}%` }}
                      />
                    </div>
                    <div className="h-7 w-24 shrink-0 animate-pulse rounded-lg bg-muted/70" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : totalItems === 0 ? (
          // The best state this panel can be in. It should read as an
          // achievement and point somewhere useful, not as missing data.
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.pop}
            className="flex h-full flex-col items-start justify-center gap-3 py-10"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-health-healthy-bg">
              <CheckCircle2 className="size-5 text-health-healthy" aria-hidden />
            </span>
            <div>
              <p className="font-heading text-base font-semibold text-foreground">
                {t("empty.title")}
              </p>
              <p className="mt-0.5 max-w-[38ch] text-sm text-pretty text-muted-foreground">
                {t("empty.description")}
              </p>
            </div>
            <Link
              href="/my-work"
              className="text-sm font-medium text-signal transition-opacity duration-[var(--duration-fast)] hover:opacity-80 motion-reduce:transition-none"
            >
              {t("empty.action")}
            </Link>
          </motion.div>
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

      <motion.ul variants={listStage} initial="hidden" animate="visible">
        {visible.map((item) => (
          <motion.li
            variants={listItem}
            key={`${group.key}-${item.id}`}
            className="group/row relative grid grid-cols-[2px_1fr_auto] items-center gap-3.5 border-b border-border pr-3 transition-colors duration-[var(--duration-fast)] hover:bg-accent motion-reduce:transition-none"
          >
            {/* A hairline tick, inset from the row's edges. A full-bleed slab
                of colour reads as a warning stripe on machinery; this marks
                the row without shouting over its title. */}
            <span
              aria-hidden
              className={`my-2.5 h-[calc(100%-1.25rem)] w-0.5 rounded-full ${SEVERITY_BAR[item.severity]}`}
            />

            <span className="min-w-0 py-2.5">
              {/*
                The title is a link; the row is NOT. An `after:inset-0` here
                would stretch the link across the whole row, which makes every
                pixel of it a click target — and the pointer then never turns
                back into an arrow while you are anywhere near the queue. That
                was worth it when the action was a small text link; now that
                the action is a real button beside it, a row-wide target buys
                nothing and costs the sense of where things are clickable.
              */}
              <Link
                href={hrefFor(item.entityType, item.entityId)}
                className="inline-block max-w-full truncate align-top text-[0.8125rem] font-medium text-foreground hover:text-signal focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {item.title}
              </Link>
              {/* The meta string already opens with the status, and it is
                  prose — so it is set in the text face, not the mono one. */}
              <span className="mt-0.5 block truncate text-[0.75rem] text-muted-foreground">
                {t(`meta.${item.metaKey}`, item.metaParams)}
              </span>
            </span>

            <Link
              href={hrefFor(item.entityType, item.entityId)}
              className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[0.8125rem] font-medium text-signal shadow-sm transition-[background-color,border-color,transform] duration-[var(--duration-fast)] hover:border-signal hover:bg-signal-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] motion-reduce:transition-none"
            >
              {t(`actions.${group.key}`)}
              <ChevronRight
                className="size-3.5 transition-transform duration-[var(--duration-fast)] group-hover/row:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
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
