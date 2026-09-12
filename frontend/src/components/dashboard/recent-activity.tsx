"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { History } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { collaborationApi } from "@/lib/api/collaboration";
import { recordRoutes } from "@/lib/api/dashboard";
import { listStage, listItem } from "@/lib/motion";
import type { ActivityLog } from "@/lib/api/collaboration-types";

/**
 * "What changed" — the third question the dashboard exists to answer.
 *
 * Deliberately a trail, not a table: what matters is the shape of the last
 * few hours, not a sortable list. Each row names who did what to which record
 * and links straight to it, so reading the feed and acting on it are the same
 * gesture.
 *
 * Scope is decided server-side (BR-002): a Gestor and above see the whole
 * trail, anyone else sees their own actions.
 */

function relative(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((then - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(mins);
  if (abs < 60) return rtf.format(mins, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(mins / 60), "hour");
  return rtf.format(Math.round(mins / 1440), "day");
}

/**
 * The log stores `<entity>.<verb>` — "opportunity.won", "time_entry.created".
 * Earlier this component translated the whole string as one key, so every
 * entry fell through to the same fallback sentence. Split it, translate the
 * verb, and name the entity from the action itself, which is more reliable
 * than `entityType` for rows written by automations.
 */
function useDescribe() {
  const t = useTranslations("dashboard.changed");
  return React.useCallback(
    (entry: ActivityLog) => {
      const raw = entry.rawAction ?? entry.action;
      const [entity, verb] = raw.includes(".")
        ? raw.split(".")
        : [entry.entityType, raw];
      const name = t.has(`entities.${entity}`)
        ? t(`entities.${entity}`)
        : t("entities.record");
      return t.has(`verbs.${verb}`)
        ? t(`verbs.${verb}`, { entity: name })
        : t("verbs.updated", { entity: name });
    },
    [t],
  );
}

function hrefFor(entry: ActivityLog): string | null {
  const route = (recordRoutes as Record<string, ((id: string) => string) | undefined>)[
    entry.entityType
  ];
  return route ? route(entry.entityId) : null;
}

export function RecentActivity() {
  const t = useTranslations("dashboard.changed");
  const locale = useLocale();
  const describe = useDescribe();

  const { data, isLoading } = useQuery({
    queryKey: ["activity", "recent"] as const,
    queryFn: () => collaborationApi.listRecentActivity(8),
    staleTime: 60_000,
  });

  return (
    <Card aria-label={t("title")}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
      {isLoading ? (
        <ul className="space-y-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span
                className="h-3 animate-pulse rounded bg-muted"
                // Uneven widths: a column of identical bars reads as a
                // placeholder graphic, not as text about to arrive.
                style={{ width: `${52 - i * 5}%` }}
              />
              <span className="h-3 w-14 shrink-0 animate-pulse rounded bg-muted/60" />
            </li>
          ))}
        </ul>
      ) : !data || data.length === 0 ? (
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <History className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden />
          <p className="max-w-[34ch] text-pretty">{t("empty")}</p>
        </div>
      ) : (
        <motion.ul
          variants={listStage}
          initial="hidden"
          animate="visible"
          className="space-y-0.5"
        >
          {data.map((entry) => {
            const href = hrefFor(entry);
            const body = (
              <>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{entry.actor.name}</span>{" "}
                  <span className="text-muted-foreground">{describe(entry)}</span>
                </span>
                <time
                  dateTime={entry.createdAt}
                  className="shrink-0 text-xs text-muted-foreground/80 tabular-nums"
                >
                  {relative(entry.createdAt, locale)}
                </time>
              </>
            );

            return (
              <motion.li variants={listItem} key={entry.id}>
                {href ? (
                  <Link
                    href={href}
                    className="-mx-2 flex items-baseline gap-3 rounded-md px-2 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none"
                  >
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-baseline gap-3 px-2 py-1.5 text-sm">
                    {body}
                  </span>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
      </CardContent>
    </Card>
  );
}
