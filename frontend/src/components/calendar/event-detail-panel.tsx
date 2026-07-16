"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DetailSidePanel } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/api/calendar-types";
import { EVENT_TYPE_CONFIG, URGENCY_CONFIG } from "./event-config";

export interface EventDetailPanelProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const URGENCY_BADGE: Record<
  NonNullable<CalendarEvent["urgency"]>,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  overdue: "overdue",
  due: "due",
  upcoming: "default",
  done: "done",
};

/**
 * Read-only detail for a single calendar event. Because the calendar is a
 * projection, this panel *is* the record view; "Abrir registo" links to the
 * source record so the projection stays architecture-ready without duplicating
 * edit surfaces here.
 */
export function EventDetailPanel({
  event,
  open,
  onOpenChange,
}: EventDetailPanelProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();

  const currency = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }),
    [locale]
  );
  const dateTimeFmt = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale]
  );

  if (!event) return null;

  const config = EVENT_TYPE_CONFIG[event.type];
  const Icon = config.icon;

  const when = event.allDay
    ? `${dateTimeFmt.format(new Date(event.start))} · ${t("allDay")}`
    : `${dateTimeFmt.format(new Date(event.start))} · ${format(
        new Date(event.start),
        "HH:mm"
      )}${event.end ? `–${format(new Date(event.end), "HH:mm")}` : ""}`;

  const rows: Array<[string, React.ReactNode]> = [
    [t("detail.type"), t(`types.${config.labelKey}`)],
    [t("detail.when"), when],
  ];
  if (event.projectName) rows.push([t("detail.project"), event.projectName]);
  if (event.location) rows.push([t("detail.location"), event.location]);
  if (event.amountCents != null) {
    rows.push([t("detail.amount"), currency.format(event.amountCents / 100)]);
  }

  return (
    <DetailSidePanel
      open={open}
      onOpenChange={onOpenChange}
      header={
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--evt)]"
            style={
              {
                "--evt": config.accentVar,
                backgroundColor:
                  "color-mix(in oklch, var(--evt) 18%, transparent)",
              } as React.CSSProperties
            }
          >
            <Icon className="size-4" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-semibold leading-tight">
              {event.title}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t(`types.${config.labelKey}`)}
              </span>
              {event.urgency && event.urgency !== "upcoming" ? (
                <Badge variant={URGENCY_BADGE[event.urgency]}>
                  {t(`urgency.${URGENCY_CONFIG[event.urgency].labelKey}`)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      }
      footer={
        <Link
          href={event.sourceHref}
          className={cn(buttonVariants({ variant: "default" }), "w-full")}
        >
          {t("detail.openRecord")}
          <ArrowUpRight aria-hidden />
        </Link>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {event.description ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {event.description}
        </p>
      ) : null}
      <p className="mt-6 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        {t("detail.readOnlyNote")}
      </p>
    </DetailSidePanel>
  );
}
