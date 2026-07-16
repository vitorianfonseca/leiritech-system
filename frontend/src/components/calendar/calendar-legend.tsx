"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_CONFIG, visibleEventTypes } from "./event-config";

export interface CalendarLegendProps {
  /** Membro never sees financial (payment) events — BR-008. */
  isMembro: boolean;
  className?: string;
}

/**
 * Colour legend for the aggregate calendar. Each entry pairs the type colour
 * with its icon and label so the per-type palette is decodable without relying
 * on colour alone (WCAG AA).
 */
export function CalendarLegend({ isMembro, className }: CalendarLegendProps) {
  const t = useTranslations("calendar");
  const types = visibleEventTypes(isMembro);

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}
      aria-label={t("legend.label")}
    >
      {types.map((type) => {
        const config = EVENT_TYPE_CONFIG[type];
        const Icon = config.icon;
        return (
          <li
            key={type}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="flex size-4 items-center justify-center rounded-[4px] text-[var(--evt)]"
              style={
                {
                  "--evt": config.accentVar,
                  backgroundColor:
                    "color-mix(in oklch, var(--evt) 18%, transparent)",
                } as React.CSSProperties
              }
            >
              <Icon className="size-3" strokeWidth={1.8} aria-hidden />
            </span>
            <span>{t(`types.${config.labelKey}`)}</span>
          </li>
        );
      })}
    </ul>
  );
}
