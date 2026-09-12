"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckSquare,
  Users,
  Flag,
  PackageCheck,
  Compass,
  FileClock,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { pt, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { calendarApi } from "@/lib/api/calendar";
import type { CalendarEvent, CalendarEventType } from "@/lib/api/calendar-types";
import type { Role } from "@/lib/session";

const TYPE_ICON: Record<CalendarEventType, LucideIcon> = {
  task: CheckSquare,
  meeting: Users,
  milestone: Flag,
  delivery: PackageCheck,
  next_action: Compass,
  proposal_expiry: FileClock,
  payment: Wallet,
};

/** Urgency → the same warm status tokens used across the app (icon + colour). */
const URGENCY_DOT: Record<string, string> = {
  overdue: "bg-status-overdue",
  due: "bg-status-due",
  upcoming: "bg-status-done",
  done: "bg-status-done",
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Dashboard right-rail card (F2/F12): the next two weeks of dated items —
 * deliveries, meetings, milestones, task deadlines, commercial next-actions,
 * expiring proposals and (finance-gated) payments — aggregated from the same
 * `/calendar` projection the full Calendar page uses. Scoped + gated server-side
 * (BR-002/008). Fills the rail's height and scrolls when busy.
 */
export function AgendaCard({
  user,
  className,
}: {
  user: { id: string; role: Role };
  className?: string;
}) {
  const t = useTranslations("dashboard.weekAgenda");
  const locale = useLocale();
  const dfLocale = locale.startsWith("pt") ? pt : enUS;

  const range = React.useMemo(() => {
    const now = new Date();
    return { start: format(now, "yyyy-MM-dd"), end: format(addDays(now, 7), "yyyy-MM-dd") };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-agenda", user.id, range.start, range.end] as const,
    queryFn: () =>
      calendarApi.getCalendarEvents(range, { userId: user.id, role: user.role }),
  });

  const groups = React.useMemo(() => {
    const events = [...(data ?? [])].sort((a, b) => a.start.localeCompare(b.start));
    const byDay = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const k = dayKey(ev.start);
      (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(ev);
    }
    return [...byDay.entries()];
  }, [data]);

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          // Day headings and rows of unequal width, so the skeleton is shaped
          // like an agenda rather than a stack of identical grey bars.
          <div className="space-y-4" aria-hidden>
            {[0, 1].map((g) => (
              <div key={g} className="space-y-2">
                <div className="h-2.5 w-20 animate-pulse rounded bg-muted/70" />
                {[0, 1].map((r) => (
                  <div key={r} className="flex items-center gap-2.5">
                    <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted/60" />
                    <div
                      className="h-3 animate-pulse rounded bg-muted"
                      style={{ width: `${68 - r * 14 - g * 8}%` }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          // An empty week is good news, so it reads as good news and offers
          // the one thing worth doing from here — not "no data".
          <div className="flex h-full flex-col items-start justify-center gap-3 py-8">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
              <p className="mt-0.5 max-w-[30ch] text-sm text-pretty text-muted-foreground">
                {t("empty")}
              </p>
            </div>
            <Link
              href="/calendar"
              className="text-sm font-medium text-signal transition-opacity duration-[var(--duration-fast)] hover:opacity-80 motion-reduce:transition-none"
            >
              {t("emptyAction")}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([day, events]) => (
              <div key={day} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {format(parseISO(day), "EEE, d LLL", { locale: dfLocale })}
                </p>
                <ul className="space-y-1">
                  {events.map((ev) => {
                    const Icon = TYPE_ICON[ev.type];
                    return (
                      <li key={ev.id}>
                        <Link
                          href={ev.sourceHref}
                          className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              URGENCY_DOT[ev.urgency ?? "upcoming"] ?? URGENCY_DOT.upcoming
                            )}
                            aria-hidden
                          />
                          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">{ev.title}</span>
                            {ev.projectName ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {ev.projectName}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
