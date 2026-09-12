"use client";

import * as React from "react";
import { useTranslations, useFormatter, useNow } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  Plus,
  Pencil,
  ArrowRightLeft,
  UserPlus,
  MessageSquare,
  Paperclip,
  Archive,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "./empty-state";
import { SkeletonList } from "./skeletons";
import {
  collaborationApi,
  type CollaborationApi,
} from "@/lib/api/collaboration";
import {
  type ActivityAction,
  type ActivityLog,
  type CollaborationEntityType,
} from "@/lib/api/collaboration-types";

export interface ActivityFeedProps {
  entityType: CollaborationEntityType;
  entityId: string;
  /** Injectable for tests; defaults to the mock client. */
  api?: CollaborationApi;
  className?: string;
}

const ACTION_ICON: Record<ActivityAction, LucideIcon> = {
  created: Plus,
  updated: Pencil,
  status_changed: ArrowRightLeft,
  assigned: UserPlus,
  commented: MessageSquare,
  attached: Paperclip,
  archived: Archive,
  restored: RotateCcw,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function ActivityRow({ log, isLast }: { log: ActivityLog; isLast: boolean }) {
  const t = useTranslations("collaboration.activity");
  const format = useFormatter();
  const now = useNow();
  const Icon = ACTION_ICON[log.action];
  const created = new Date(log.createdAt);
  let field = "";
  if (log.field) {
    const fieldKey = `fields.${log.field}` as const;
    field = t.has(fieldKey) ? t(fieldKey) : log.field;
  }

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {/* Timeline rail — omitted on the last row */}
      {!isLast ? (
        <span
          className="absolute left-[15px] top-9 bottom-0 w-px bg-border"
          aria-hidden
        />
      ) : null}
      <span className="relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Avatar className="size-5">
              {log.actor.avatarUrl ? (
                <AvatarImage src={log.actor.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="text-[0.6rem]">
                {initials(log.actor.name)}
              </AvatarFallback>
            </Avatar>
            {log.actor.name}
          </span>
          <span className="text-muted-foreground">
            {t(`actions.${log.action}`, { field })}
          </span>
        </div>

        {log.before || log.after ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {log.before ? (
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-muted-foreground line-through">
                {log.before}
              </span>
            ) : null}
            {log.before && log.after ? (
              <ArrowRight className="size-3 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            ) : null}
            {log.after ? (
              <span className="rounded border border-border bg-card px-1.5 py-0.5 font-medium text-foreground">
                {log.after}
              </span>
            ) : null}
          </div>
        ) : null}

        <time
          dateTime={log.createdAt}
          title={format.dateTime(created, { dateStyle: "medium", timeStyle: "short" })}
          className="mt-1 block text-xs text-muted-foreground"
        >
          {format.relativeTime(created, now)}
        </time>
      </div>
    </li>
  );
}

/**
 * Reusable, read-only activity feed for any entity (companies, opportunities,
 * projects, tasks), keyed by `entityType` + `entityId`. Renders `activity_logs`
 * chronologically (newest first) with actor, action, before/after and
 * timestamp. Append-only and non-editable for all users (BR-064) — this
 * component exposes no mutation. Handles loading / empty / error.
 */
export function ActivityFeed({
  entityType,
  entityId,
  api = collaborationApi,
  className,
}: ActivityFeedProps) {
  const t = useTranslations("collaboration.activity");
  const query = useQuery({
    queryKey: ["collaboration", "activity", entityType, entityId],
    queryFn: () => api.listActivity(entityType, entityId),
  });

  const logs = query.data ?? [];

  return (
    <section className={cn("space-y-5", className)} aria-label={t("title")}>
      <header className="flex items-center gap-2">
        <ActivityIcon className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        <h2 className="font-heading text-sm font-semibold text-foreground">
          {t("title")}
        </h2>
      </header>

      {query.isPending ? (
        <SkeletonList rows={4} />
      ) : query.isError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-muted/40 px-6 py-8 text-center"
        >
          <AlertTriangle className="size-6 text-destructive" strokeWidth={1.8} aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{t("errorTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <ol className="relative">
          {logs.map((log, i) => (
            <ActivityRow key={log.id} log={log} isLast={i === logs.length - 1} />
          ))}
        </ol>
      )}
    </section>
  );
}
