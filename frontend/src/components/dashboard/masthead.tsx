"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttentionGroup } from "@/lib/api/dashboard-types";
import { duration, ease } from "@/lib/motion";

/**
 * The dashboard masthead.
 *
 * Not a page header with a title and a subtitle — a standfirst. It answers
 * the only question worth asking on arrival: *does anything need me?* The
 * count is read off the live attention payload, never estimated, and when
 * it is zero the page says so plainly instead of inventing something to
 * worry about.
 */
export function Masthead({
  greeting,
  attention,
  loading,
  onRefresh,
  refreshing,
}: {
  greeting: string;
  attention: AttentionGroup[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  const count = React.useMemo(
    () => attention.reduce((n, g) => n + g.items.length, 0),
    [attention],
  );

  const today = React.useMemo(() => {
    const d = new Date();
    const formatted = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [locale]);

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.out }}
          className="font-heading text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.1] font-bold text-balance text-foreground"
        >
          {greeting}
        </motion.h1>

        <p className="mt-2 text-sm text-muted-foreground">{today}</p>

        {/* The standfirst. Real count, or an honest all-clear. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.slow, ease: ease.out, delay: 0.08 }}
          className="mt-4 max-w-[46ch] text-lg leading-snug text-pretty text-muted-foreground"
        >
          {loading ? (
            <span className="inline-block h-6 w-64 animate-pulse rounded bg-muted align-middle" />
          ) : count > 0 ? (
            t.rich("standfirst.needsAttention", {
              count,
              strong: (chunks) => (
                <strong className="font-semibold text-foreground tabular-nums">
                  {chunks}
                </strong>
              ),
            })
          ) : (
            t("standfirst.allClear")
          )}
        </motion.p>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("actions.refresh")}
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw
          className={refreshing ? "animate-spin" : undefined}
          aria-hidden
        />
      </Button>
    </header>
  );
}
