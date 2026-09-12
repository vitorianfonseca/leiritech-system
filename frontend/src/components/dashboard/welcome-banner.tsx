"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { duration, easeOut } from "@/lib/motion";

/**
 * The welcome banner.
 *
 * Takes the reference's shape — a panel across the top with a greeting, a
 * line of context and one action — but gives it something to say. A banner
 * that only greets you occupies the best real estate on the page for nothing;
 * this one states how many things need a person and sends you at them. A banner that only greets you is a decoration occupying the best
 * real estate on the page; this one states how many things need a person and
 * sends you straight at them, so the most prominent element is also the most
 * actionable.
 *
 * The count comes from the live attention payload; when it is zero the banner
 * says so rather than inventing urgency.
 */
export function WelcomeBanner({
  greeting,
  attentionCount,
  loading,
}: {
  greeting: string;
  attentionCount: number;
  loading: boolean;
}) {
  const t = useTranslations("dashboard");
  const reduced = useReducedMotion();

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: easeOut }}
      className="relative isolate mt-10 rounded-3xl bg-card px-7 py-8 text-foreground shadow-[0_2px_8px_oklch(0.28_0.06_285/0.05),0_12px_32px_-12px_oklch(0.28_0.06_285/0.10)] sm:px-11 sm:py-9"
    >
      <div className="relative z-10 max-w-[40rem]">
        <h1 className="font-heading text-[clamp(2rem,4.8vw,3.25rem)] leading-[1.02] font-bold tracking-[-0.035em] text-balance">
          {greeting}
        </h1>

        {loading ? (
          <div className="mt-4 flex items-center gap-3">
            <span className="size-10 animate-pulse rounded-xl bg-muted" />
            <span className="h-4 w-44 animate-pulse rounded bg-muted" />
          </div>
        ) : attentionCount > 0 ? (
          <p className="mt-4 flex items-center gap-2.5 text-base">
            <span className="font-heading inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-[linear-gradient(140deg,oklch(0.575_0.215_292),oklch(0.300_0.120_280))] px-3 text-xl font-bold tabular-nums text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.35)]">
              {attentionCount}
            </span>
            <span className="text-muted-foreground">{t("banner.needsAttentionSuffix", { count: attentionCount })}</span>
          </p>
        ) : (
          <p className="mt-4 flex items-center gap-2.5 text-base">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-health-healthy-bg">
              <Check className="size-5 text-health-healthy" aria-hidden />
            </span>
            <span className="text-muted-foreground">{t("standfirst.allClear")}</span>
          </p>
        )}

        {!loading && attentionCount > 0 ? (
          <Link
            href="/my-work"
            className="btn-glass mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-transform duration-[var(--duration-fast)] hover:scale-[1.02] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none"
          >
            {t("banner.action")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      {/* The source PNG carries roughly 12% of empty space below the feet, so
          anchoring it to `bottom-0` left them floating well above the card's
          floor. Pushing it past the edge by that much lands the feet on the
          line while the head still clears the top — which is what stops the
          banner reading as a flat rectangle. The panel therefore cannot clip
          (no `overflow-hidden`) and carries a top margin for the head to rise
          into. `priority` — first thing on the first screen. */}
      <Image
        src="/illustrations/assistant.png"
        alt=""
        aria-hidden
        width={500}
        height={500}
        priority
        className="pointer-events-none absolute right-5 -bottom-[16%] hidden h-[150%] w-auto select-none drop-shadow-[0_16px_26px_oklch(0.28_0.06_285/0.16)] md:block lg:right-12"
      />
    </motion.section>
  );
}
