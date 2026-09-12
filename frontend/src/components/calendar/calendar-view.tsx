"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { addMonths, addWeeks, addDays } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonList } from "@/components/shared";
import { useUrlState } from "@/lib/use-url-state";
import { calendarApi } from "@/lib/api/calendar";
import type { CalendarEvent } from "@/lib/api/calendar-types";
import type { Role } from "@/lib/session";
import {
  ViewSwitcher,
  type CalendarViewMode,
} from "./view-switcher";
import { CalendarLegend } from "./calendar-legend";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { AgendaView } from "./agenda-view";
import { EventDetailPanel } from "./event-detail-panel";
import { rangeForView } from "./calendar-utils";

export interface CalendarViewProps {
  user: { id: string; role: Role };
  /** Project-scoped embed (e.g. the project Calendário tab #32). */
  projectId?: string;
  defaultView?: CalendarViewMode;
  /** Hide the page-level legend/title chrome when embedded in another surface. */
  embedded?: boolean;
}

/**
 * Aggregate calendar orchestrator (F12). Owns the view mode + anchor date,
 * fetches the visible range via TanStack Query, and renders the selected
 * projection. Read-only: events open a detail panel and link to their source
 * record. Reused by the projects Calendário tab (#32) and tasks calendar (#34).
 */
export function CalendarView({
  user,
  projectId,
  defaultView = "month",
  embedded = false,
}: CalendarViewProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const isMembro = user.role === "membro";

  const [view, setView] = useUrlState<CalendarViewMode>("cal", defaultView, {
    history: "replace",
  });
  const [anchor, setAnchor] = React.useState<Date>(() => new Date());

  const range = React.useMemo(() => rangeForView(view, anchor), [view, anchor]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [
      "calendar",
      user.id,
      user.role,
      projectId ?? null,
      view,
      range.start,
      range.end,
    ] as const,
    queryFn: () =>
      calendarApi.getCalendarEvents(range, {
        userId: user.id,
        role: user.role,
        projectId,
      }),
  });

  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  const openEvent = React.useCallback((event: CalendarEvent) => {
    setSelected(event);
    setPanelOpen(true);
  }, []);

  const openDay = React.useCallback(
    (day: Date) => {
      setAnchor(day);
      setView("agenda");
    },
    [setView]
  );

  const goToday = React.useCallback(() => setAnchor(new Date()), []);
  const step = React.useCallback(
    (dir: 1 | -1) => {
      setAnchor((prev) => {
        if (view === "month") return addMonths(prev, dir);
        if (view === "week") return addWeeks(prev, dir);
        return addDays(prev, dir * 7);
      });
    },
    [view]
  );

  const rangeLabel = React.useMemo(() => {
    if (view === "month") {
      return new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(anchor);
    }
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    const start = new Date(`${range.start}T00:00:00`);
    const end = addDays(new Date(`${range.end}T00:00:00`), -1);
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }, [view, anchor, range, locale]);

  const events = data ?? [];
  const isEmpty = !isLoading && !isError && events.length === 0;

  return (
    // A column that fills its parent, so a page can hand the calendar the rest
    // of the viewport and have the month fit rather than run past the fold.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nav.previous")}
              onClick={() => step(-1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nav.next")}
              onClick={() => step(1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <h2 className="font-heading text-lg font-semibold capitalize text-foreground md:text-xl">
            {rangeLabel}
          </h2>
          <Button variant="outline" size="sm" onClick={goToday} className="ml-1">
            {t("nav.today")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <ViewSwitcher value={view} onChange={setView} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("refresh")}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={isFetching ? "animate-spin" : undefined}
              aria-hidden
            />
          </Button>
        </div>
      </div>

      {!embedded ? (
        <CalendarLegend isMembro={isMembro} className="pb-1" />
      ) : null}

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card p-2 sm:p-3">
        {isLoading ? (
          <div className="p-2">
            <SkeletonList rows={6} media={false} />
          </div>
        ) : isError ? (
          <EmptyState
            variant="bare"
            icon={TriangleAlert}
            title={t("error.title")}
            description={t("error.description")}
            action={
              <Button variant="outline" size="lg" onClick={() => refetch()}>
                <RefreshCw aria-hidden />
                {t("error.retry")}
              </Button>
            }
          />
        ) : isEmpty ? (
          <EmptyState
            variant="bare"
            icon={CalendarDays}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : view === "month" ? (
          <MonthView
            anchor={anchor}
            events={events}
            onOpenEvent={openEvent}
            onOpenDay={openDay}
          />
        ) : view === "week" ? (
          <WeekView anchor={anchor} events={events} onOpenEvent={openEvent} />
        ) : (
          <AgendaView events={events} onOpenEvent={openEvent} />
        )}
      </div>

      <EventDetailPanel
        event={selected}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
