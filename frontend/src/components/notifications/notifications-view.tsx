"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  TriangleAlert,
  RefreshCw,
  CheckCheck,
  ListFilter,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ConfirmDialog,
  EmptyState,
  SkeletonList,
  toast,
  toastWithUndo,
} from "@/components/shared";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import { notificationsApi } from "@/lib/api/notifications";
import type {
  Notification,
  NotificationCategory,
  NotificationReadFilter,
} from "@/lib/api/notifications-types";
import type { Role } from "@/lib/session";
import { NotificationGroup } from "./notification-group";

export interface NotificationsViewProps {
  user: { id: string; name: string; role: Role };
}

type CategoryFilter = NotificationCategory | "all";

/** Group a newest-first list by groupKey, preserving newest-first group order. */
function groupByKey(items: Notification[]): Notification[][] {
  const order: string[] = [];
  const map = new Map<string, Notification[]>();
  for (const n of items) {
    const bucket = map.get(n.groupKey);
    if (bucket) {
      bucket.push(n);
    } else {
      map.set(n.groupKey, [n]);
      order.push(n.groupKey);
    }
  }
  return order.map((k) => map.get(k)!);
}

export function NotificationsView({ user }: NotificationsViewProps) {
  const t = useTranslations("notifications");
  const qc = useQueryClient();

  const queryKey = React.useMemo(
    () => ["notifications", user.id, user.role] as const,
    [user.id, user.role]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => notificationsApi.list(user.id, user.role),
  });

  const refresh = React.useCallback(
    () => qc.invalidateQueries({ queryKey }),
    [qc, queryKey]
  );

  const [readFilter, setReadFilter] =
    React.useState<NotificationReadFilter>("all");
  const [category, setCategory] = React.useState<CategoryFilter>("all");
  const [confirmMarkAll, setConfirmMarkAll] = React.useState(false);

  /* ---------------- derived ---------------- */
  const all = React.useMemo(() => data ?? [], [data]);
  const unreadCount = React.useMemo(
    () => all.filter((n) => !n.readAt).length,
    [all]
  );

  // Categories actually present drive the filter menu (so Membro never sees a
  // "payment" option that can't occur for them).
  const availableCategories = React.useMemo(() => {
    const set = new Set<NotificationCategory>();
    for (const n of all) set.add(n.category);
    return [...set];
  }, [all]);

  const filtered = React.useMemo(() => {
    return all.filter((n) => {
      if (readFilter === "unread" && n.readAt) return false;
      if (category !== "all" && n.category !== category) return false;
      return true;
    });
  }, [all, readFilter, category]);

  const groups = React.useMemo(() => groupByKey(filtered), [filtered]);

  /* ---------------- actions ---------------- */
  const handleMarkRead = React.useCallback(
    (id: string) => {
      notificationsApi
        .markRead(id)
        .then(refresh)
        .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
    },
    [refresh, t]
  );

  const handleArchive = React.useCallback(
    (id: string) => {
      notificationsApi
        .archive(id)
        .then(refresh)
        .then(() => {
          toastWithUndo({
            tone: "success",
            title: t("toasts.archived"),
            onUndo: async () => {
              await notificationsApi.unarchive(id);
              await refresh();
            },
          });
        })
        .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
    },
    [refresh, t]
  );

  const handleMarkAllRead = React.useCallback(() => {
    notificationsApi
      .markAllRead(user.id, user.role)
      .then((changed) => {
        return refresh().then(() => changed);
      })
      .then((changed) => {
        if (changed.length === 0) return;
        toastWithUndo({
          tone: "success",
          title: t("toasts.allRead"),
          onUndo: async () => {
            await notificationsApi.markUnread(changed);
            await refresh();
          },
        });
      })
      .catch(() => toast({ tone: "destructive", title: t("errors.actionFailed") }));
  }, [refresh, t, user.id, user.role]);

  /* ---------------- states ---------------- */
  if (isLoading) return <LoadingState />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon={TriangleAlert}
          title={t("errors.loadTitle")}
          description={t("errors.loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              <RefreshCw aria-hidden />
              {t("errors.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const isEmpty = all.length === 0;
  const isFilteredEmpty = !isEmpty && filtered.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<Link href="/profile" />}
            >
              <SlidersHorizontal aria-hidden />
              <span className="hidden sm:inline">{t("preferences")}</span>
            </Button>
            <Button
              variant="default"
              size="lg"
              onClick={() => setConfirmMarkAll(true)}
              disabled={unreadCount === 0}
            >
              <CheckCheck aria-hidden />
              <span className="hidden sm:inline">{t("markAllRead")}</span>
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Read-state segmented control */}
        <div
          role="tablist"
          aria-label={t("filters.readLabel")}
          className="inline-flex items-center rounded-lg border border-border bg-card p-0.5"
        >
          {(["unread", "all"] as const).map((value) => {
            const active = readFilter === value;
            return (
              <button
                key={value}
                role="tab"
                aria-selected={active}
                onClick={() => setReadFilter(value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-secondary text-secondary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(`filters.${value}`)}
                {value === "unread" && unreadCount > 0 ? (
                  <Badge variant="signal" className="px-1.5">
                    {unreadCount}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Category filter */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="lg" />}
            aria-label={t("filters.typeLabel")}
          >
            <ListFilter aria-hidden />
            {category === "all"
              ? t("filters.allTypes")
              : t(`categories.${category}`)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuLabel>{t("filters.typeLabel")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCategory("all")}>
              <Check
                className={cn(category !== "all" && "opacity-0")}
                aria-hidden
              />
              {t("filters.allTypes")}
            </DropdownMenuItem>
            {availableCategories.map((c) => (
              <DropdownMenuItem key={c} onClick={() => setCategory(c)}>
                <Check
                  className={cn(category !== c && "opacity-0")}
                  aria-hidden
                />
                {t(`categories.${c}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto text-sm text-muted-foreground">
          {t("count.unread", { count: unreadCount })}
        </span>
      </div>

      {/* List / empty states */}
      {isEmpty ? (
        <EmptyState
          icon={Bell}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : isFilteredEmpty ? (
        <EmptyState
          icon={readFilter === "unread" ? BellOff : ListFilter}
          title={
            readFilter === "unread"
              ? t("empty.unreadTitle")
              : t("empty.filteredTitle")
          }
          description={
            readFilter === "unread"
              ? t("empty.unreadDescription")
              : t("empty.filteredDescription")
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {groups.map((items) => (
            <NotificationGroup
              key={items[0].groupKey}
              items={items}
              onMarkRead={handleMarkRead}
              onArchive={handleArchive}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmMarkAll}
        onOpenChange={setConfirmMarkAll}
        title={t("confirm.markAllTitle")}
        description={t("confirm.markAllDescription")}
        confirmLabel={t("confirm.markAllConfirm")}
        onConfirm={handleMarkAllRead}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-2 pb-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="flex gap-3">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <SkeletonList rows={6} media />
      </div>
    </div>
  );
}
