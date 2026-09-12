"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { duration, easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { AttentionGroup, AttentionGroupKey } from "@/lib/api/dashboard-types";

/**
 * The welcome banner.
 *
 * A banner that only greets you is a decoration occupying the best real
 * estate on the page. This one names the three things most worth a person's
 * time and sends you at them, so the most prominent element is also the most
 * actionable — and the panel earns its height instead of padding it out.
 *
 * The breakdown comes from the live attention payload; when it is empty the
 * banner says so rather than inventing urgency.
 */

/** Groups ranked by how badly they want a person, worst first. */
const GROUP_RANK: AttentionGroupKey[] = [
  "overduePayments",
  "projectsAtRisk",
  "overdueTasks",
  "blockedTasks",
  "lowProgressNearDelivery",
  "proposalsAwaiting",
  "opportunitiesNoNextAction",
  "overloadedMembers",
];

/** The dot is the only colour here — the pane behind it stays neutral. */
const GROUP_TONE: Record<AttentionGroupKey, string> = {
  overduePayments: "bg-status-overdue",
  projectsAtRisk: "bg-health-at-risk",
  overdueTasks: "bg-status-overdue",
  blockedTasks: "bg-status-blocked",
  lowProgressNearDelivery: "bg-health-attention",
  proposalsAwaiting: "bg-health-attention",
  opportunitiesNoNextAction: "bg-signal",
  overloadedMembers: "bg-health-attention",
};

export function WelcomeBanner({
  greeting,
  attentionCount,
  groups,
  loading,
}: {
  greeting: string;
  attentionCount: number;
  groups: AttentionGroup[];
  loading: boolean;
}) {
  const t = useTranslations("dashboard");
  const reduced = useReducedMotion();

  const breakdown = [...(groups ?? [])]
    .filter((g) => g.items.length > 0)
    .sort((a, b) => GROUP_RANK.indexOf(a.key) - GROUP_RANK.indexOf(b.key))
    .slice(0, 3);

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: easeOut }}
      className="relative isolate mt-2 min-h-[13.5rem] overflow-hidden rounded-3xl bg-card px-7 py-6 text-foreground shadow-[0_2px_8px_oklch(0.28_0.06_285/0.05),0_12px_32px_-12px_oklch(0.28_0.06_285/0.10)] sm:px-10 sm:py-7"
    >
      <div className="relative z-10 max-w-[min(42rem,calc(100%-20rem))]">
        <h1 className="font-heading text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
          {greeting}
        </h1>

        {loading ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="h-9 w-40 animate-pulse rounded-xl bg-muted" />
            <span className="h-9 w-32 animate-pulse rounded-xl bg-muted" />
            <span className="h-9 w-44 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : attentionCount > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("banner.needsAttention", { count: attentionCount })}
            </p>

            {/* The breakdown is the point: "10 things" tells you nothing you
                can act on; "1 at risk, 1 blocked, 6 going cold" tells you
                where the day goes. */}
            <ul className="mt-4 flex flex-wrap gap-2">
              {breakdown.map((g) => (
                <li
                  key={g.key}
                  className="glass glass-quiet flex items-center gap-2 rounded-xl px-3 py-2"
                >
                  <span
                    aria-hidden
                    className={cn("size-1.5 shrink-0 rounded-full", GROUP_TONE[g.key])}
                  />
                  <span className="font-heading text-sm font-semibold tabular-nums">
                    {g.items.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`attention.groups.${g.key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 flex items-center gap-2.5 text-sm">
            <span className="glass-chip glass-chip-neutral inline-flex size-8 items-center justify-center rounded-lg">
              <Check className="size-4 text-health-healthy" aria-hidden />
            </span>
            <span className="text-muted-foreground">{t("standfirst.allClear")}</span>
          </p>
        )}

        {!loading && attentionCount > 0 ? (
          <Link
            href="/my-work"
            className="glass glass-primary mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {t("banner.action")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      {/* Unlike the robot this replaced, the scene has a ground line and a
          horizon, so it sits inside the panel rather than breaking its top
          edge — bottom-aligned, feet on the card's floor. The panel carries a
          min-height so the line work stays legible at this width.

          Dark mode: the artwork is black ink on nothing, which disappears on
          a dark ground. Inverting flips the ink to white and takes the blue
          with it; the hue rotation puts the blue back where it started.
          `priority` — first thing on the first screen. */}
      <Image
        src="/illustrations/planning.png"
        alt=""
        aria-hidden
        width={1000}
        height={568}
        priority
        className="pointer-events-none absolute right-6 bottom-0 hidden h-[88%] w-auto select-none md:block lg:right-10 dark:invert dark:hue-rotate-180"
      />
    </motion.section>
  );
}
