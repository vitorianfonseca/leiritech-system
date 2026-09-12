"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Check, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/api/notifications-types";
import {
  CATEGORY_ICON,
  toneForType,
  badgeVariantForTone,
} from "./notification-meta";

export interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
  /** Nested items inside a group get a lighter, indented treatment. */
  nested?: boolean;
}

/**
 * A single notification row. Read/unread is signalled by THREE independent
 * cues (never colour alone): a leading dot, the body weight/tone, and an
 * sr-only state label. The body is a link to the source record; the mark-read
 * and archive controls sit outside the link so there is no nested-interactive
 * a11y violation.
 */
export function NotificationItem({
  notification: n,
  onMarkRead,
  onArchive,
  nested = false,
}: NotificationItemProps) {
  const t = useTranslations("notifications");
  const unread = n.readAt === null;
  const tone = toneForType(n.type);
  const Icon = CATEGORY_ICON[n.category];

  const timestamp = React.useMemo(
    () => format(new Date(n.createdAt), "dd/MM/yyyy HH:mm"),
    [n.createdAt]
  );

  return (
    <div
      className={cn(
        "group/item relative flex items-start gap-3 rounded-lg px-3 py-3 transition-colors",
        unread ? "bg-accent" : "bg-card",
        "hover:bg-accent",
        nested && "ml-4 border-l border-border pl-4"
      )}
      data-unread={unread}
    >
      {/* Unread dot (cue 1) */}
      <span className="mt-2 flex w-2 shrink-0 justify-center" aria-hidden>
        {unread ? (
          <span className="size-2 rounded-full bg-signal" />
        ) : (
          <span className="invisible size-2 rounded-full" />
        )}
      </span>

      {/* Category icon */}
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          tone === "urgent"
            ? "bg-destructive-muted text-destructive"
            : tone === "attention"
              ? "bg-status-due-bg text-status-due"
              : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-4" strokeWidth={1.7} aria-hidden />
      </span>

      {/* Body + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badgeVariantForTone(tone)}>
            {t(`categories.${n.category}`)}
          </Badge>
          {/* State label (cue 3) — visible chip so state never relies on colour */}
          <span
            className={cn(
              "text-xs",
              unread ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {unread ? t("state.unread") : t("state.read")}
          </span>
        </div>

        <Link
          href={n.href}
          onClick={() => {
            if (unread) onMarkRead(n.id);
          }}
          className="mt-1 block rounded-sm text-sm leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              // Body weight (cue 2)
              unread
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground"
            )}
          >
            {n.body}
          </span>
        </Link>

        <time
          dateTime={n.createdAt}
          className="mt-1 block font-mono text-xs tabular-nums text-muted-foreground"
        >
          {timestamp}
        </time>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {unread ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("item.markRead")}
                  onClick={() => onMarkRead(n.id)}
                />
              }
            >
              <Check aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("item.markRead")}</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("item.archive")}
                onClick={() => onArchive(n.id)}
              />
            }
          >
            <Archive aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("item.archive")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
