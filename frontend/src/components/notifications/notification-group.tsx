"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/api/notifications-types";
import { NotificationItem } from "./notification-item";

export interface NotificationGroupProps {
  /** Same-entity notifications (share a groupKey), newest first. */
  items: Notification[];
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
}

/**
 * Collapses same-entity events into a single digest line (BR: grouping
 * collapses same-entity events). The most recent notification is always shown;
 * older ones in the same group fold behind a "show more" toggle so the feed
 * stays scannable. A single-item group renders as a plain row.
 */
export function NotificationGroup({
  items,
  onMarkRead,
  onArchive,
}: NotificationGroupProps) {
  const t = useTranslations("notifications");
  const [expanded, setExpanded] = React.useState(false);

  const [head, ...rest] = items;
  const extra = rest.length;

  return (
    <li className="list-none">
      <NotificationItem
        notification={head}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
      />

      {extra > 0 ? (
        <>
          <div className="pl-8">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                  expanded && "rotate-180"
                )}
                strokeWidth={1.8}
                aria-hidden
              />
              {expanded ? t("group.collapse") : t("group.expand", { count: extra })}
            </button>
          </div>

          {expanded ? (
            <div className="mt-1 space-y-1">
              {rest.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={onMarkRead}
                  onArchive={onArchive}
                  nested
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
