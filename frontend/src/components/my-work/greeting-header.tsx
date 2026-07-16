"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shell/page-header";

export interface GreetingHeaderProps {
  name: string;
  /** Real counts derived from the loaded data — never placeholders. */
  todayCount: number;
  overdueCount: number;
  meetingsCount: number;
}

function timeOfDayKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return "evening";
}

/**
 * Client-only hour of day via useSyncExternalStore — returns null on the server
 * and during hydration, then the local hour, avoiding both an SSR mismatch and
 * a setState-in-effect.
 */
function useClientHour(): number | null {
  return React.useSyncExternalStore(
    () => () => {},
    () => new Date().getHours(),
    () => null
  );
}

/**
 * Contextual greeting: time-of-day salutation + first name + a one-line summary
 * built from REAL counts (today / overdue / meetings). The time-of-day is
 * resolved on the client from the viewer's clock; to avoid an SSR/hydration
 * mismatch it falls back to a neutral greeting until mounted.
 */
export function GreetingHeader({
  name,
  todayCount,
  overdueCount,
  meetingsCount,
}: GreetingHeaderProps) {
  const t = useTranslations("myWork");
  const hour = useClientHour();

  const greeting =
    hour === null
      ? t("greeting.neutral", { name })
      : t(`greeting.${timeOfDayKey(hour)}`, { name });

  // Build the summary from non-zero parts so it always reads naturally.
  const parts: string[] = [];
  if (todayCount > 0) parts.push(t("summary.today", { count: todayCount }));
  if (overdueCount > 0) parts.push(t("summary.overdue", { count: overdueCount }));
  if (meetingsCount > 0) parts.push(t("summary.meetings", { count: meetingsCount }));

  const subtitle = parts.length > 0 ? parts.join(" · ") : t("summary.allClear");

  return <PageHeader title={greeting} subtitle={subtitle} />;
}
