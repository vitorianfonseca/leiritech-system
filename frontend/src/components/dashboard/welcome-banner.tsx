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
      className="relative isolate mt-10 rounded-3xl bg-card px-7 py-7 text-foreground shadow-[0_2px_8px_oklch(0.30_0.03_265/0.05),0_12px_32px_-12px_oklch(0.30_0.03_265/0.10)] sm:px-10 sm:py-8"
    >
      <div className="relative z-10 max-w-[36rem]">
        <h1 className="font-heading text-[clamp(1.9rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em] text-balance">
          {greeting}
        </h1>

        {loading ? (
          <div className="mt-4 flex items-center gap-3">
            <span className="size-9 animate-pulse rounded-xl bg-foreground/10" />
            <span className="h-4 w-44 animate-pulse rounded bg-foreground/10" />
          </div>
        ) : attentionCount > 0 ? (
          <p className="mt-4 flex items-center gap-2.5 text-base">
            <span className="font-heading inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-signal px-2.5 text-lg font-bold tabular-nums text-signal-foreground">
              {attentionCount}
            </span>
            <span className="text-muted-foreground">{t("banner.needsAttentionSuffix", { count: attentionCount })}</span>
          </p>
        ) : (
          <p className="mt-4 flex items-center gap-2.5 text-base">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-health-healthy-bg">
              <Check className="size-5 text-health-healthy" aria-hidden />
            </span>
            <span className="text-muted-foreground">{t("standfirst.allClear")}</span>
          </p>
        )}

        {!loading && attentionCount > 0 ? (
          <Link
            href="/my-work"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-signal-foreground transition-transform duration-[var(--duration-fast)] hover:scale-[1.02] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none"
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
        className="pointer-events-none absolute right-4 -bottom-[19%] hidden h-[172%] w-auto select-none drop-shadow-[0_16px_26px_oklch(0.30_0.03_265/0.15)] md:block lg:right-10"
      />
    </motion.section>
  );
}
