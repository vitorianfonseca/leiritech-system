"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bell, ArrowRight } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "@/components/shared";
import { notificationsApi } from "@/lib/api/notifications";
import {
  CATEGORY_ICON,
  toneForType,
} from "@/components/notifications/notification-meta";

/**
 * Foundation notifications popover, wired to the notifications service (F15).
 * Shows the unread count on the bell, the most recent items, and a "ver todas"
 * link into the full center (`/notifications`). Role scoping is handled by the
 * API client (financial hidden from Membro — BR-008; own-scope only — BR-002).
 */
export function Notifications({ user }: { user: Pick<SessionUser, "id" | "role"> }) {
  const t = useTranslations("shell.notifications");
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const summaryKey = React.useMemo(
    () => ["notifications-summary", user.id, user.role] as const,
    [user.id, user.role]
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: summaryKey,
    queryFn: () => notificationsApi.summary(user.id, user.role, 5),
  });

  const unread = data?.unreadCount ?? 0;
  const recent = data?.recent ?? [];

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: summaryKey });
    qc.invalidateQueries({ queryKey: ["notifications", user.id, user.role] });
  }, [qc, summaryKey, user.id, user.role]);

  const handleMarkAllRead = React.useCallback(() => {
    notificationsApi
      .markAllRead(user.id, user.role)
      .then(invalidate)
      .catch(() => toast({ tone: "destructive", title: t("actionFailed") }));
  }, [invalidate, t, user.id, user.role]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    unread > 0
                      ? `${t("label")} — ${t("unreadCount", { count: unread })}`
                      : t("label")
                  }
                  className="relative"
                />
              }
            />
          }
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-signal ring-2 ring-background"
            />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("label")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-heading text-sm font-semibold">{t("title")}</p>
          <button
            onClick={handleMarkAllRead}
            disabled={unread === 0}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            {t("markAllRead")}
          </button>
        </div>
        <Separator />

        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("loading")}
          </div>
        ) : isError ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("error")}
          </div>
        ) : recent.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell
              className="mx-auto mb-3 size-8 text-muted-foreground/50"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {recent.map((n) => {
              const Icon = CATEGORY_ICON[n.category];
              const tone = toneForType(n.type);
              const isUnread = n.readAt === null;
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      if (isUnread) {
                        notificationsApi
                          .markRead(n.id)
                          .then(invalidate)
                          .catch(() => toast({ tone: "destructive", title: t("actionFailed") }));
                      }
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      isUnread ? "bg-accent" : "bg-popover"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        tone === "urgent"
                          ? "bg-destructive-muted text-destructive"
                          : tone === "attention"
                            ? "bg-status-due-bg text-status-due"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={1.7} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "flex items-start gap-1.5 text-[0.8rem] leading-snug",
                          isUnread
                            ? "font-medium text-foreground"
                            : "font-normal text-muted-foreground"
                        )}
                      >
                        {isUnread ? (
                          <span
                            className="mt-1 size-1.5 shrink-0 rounded-full bg-signal"
                            aria-label={t("unreadCount", { count: 1 })}
                          />
                        ) : null}
                        <span className="line-clamp-2">{n.body}</span>
                      </span>
                      <time
                        dateTime={n.createdAt}
                        className="mt-1 block font-mono text-[0.7rem] tabular-nums text-muted-foreground"
                      >
                        {format(new Date(n.createdAt), "dd/MM/yyyy HH:mm")}
                      </time>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            size="lg"
            className="w-full justify-center"
            nativeButton={false}
            render={<Link href="/notifications" />}
            onClick={() => setOpen(false)}
          >
            {t("viewAll")}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
