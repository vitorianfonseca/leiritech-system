"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Save, Bell, Mail, TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, SkeletonList, toast } from "@/components/shared";
import { cn } from "@/lib/utils";
import { settingsApi } from "@/lib/api/settings";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from "@/lib/api/settings-types";

export function NotificationsSettingsView() {
  const t = useTranslations("settings.notifications");
  const tErr = useTranslations("settings.notifications.errors");

  const query = useQuery({
    queryKey: ["settings-notifications"],
    queryFn: () => settingsApi.getNotificationPreferences(),
  });

  const [draft, setDraft] = React.useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [syncedFrom, setSyncedFrom] = React.useState<NotificationPreferences | null>(null);
  if (query.data && query.data !== syncedFrom) {
    setSyncedFrom(query.data);
    setDraft(structuredClone(query.data));
  }

  const dirty = draft && query.data ? JSON.stringify(draft) !== JSON.stringify(query.data) : false;

  function toggle(cat: NotificationCategory, channel: "inApp" | "email") {
    setDraft((prev) =>
      prev ? { ...prev, [cat]: { ...prev[cat], [channel]: !prev[cat][channel] } } : prev
    );
  }

  async function save() {
    if (!draft) return;
    try {
      setSaving(true);
      const next = await settingsApi.updateNotificationPreferences(draft);
      setSyncedFrom(next);
      setDraft(structuredClone(next));
      query.refetch();
      toast({ tone: "success", title: t("saved") });
    } catch {
      toast({ tone: "destructive", title: tErr("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={save} disabled={!dirty || saving}>
            <Save aria-hidden />
            {saving ? t("saving") : t("save")}
          </Button>
        }
      />

      {query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={tErr("loadTitle")}
          description={tErr("loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => query.refetch()}>
              <RefreshCw aria-hidden />
              {tErr("retry")}
            </Button>
          }
        />
      ) : query.isLoading || !draft ? (
        <SkeletonList rows={5} media={false} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="hidden grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-border bg-muted/40 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>{t("columns.category")}</span>
            <span className="inline-flex w-16 items-center justify-center gap-1">
              <Bell className="size-3.5" aria-hidden /> {t("columns.inApp")}
            </span>
            <span className="inline-flex w-16 items-center justify-center gap-1">
              <Mail className="size-3.5" aria-hidden /> {t("columns.email")}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {NOTIFICATION_CATEGORIES.map((cat) => (
              <li
                key={cat}
                className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t(`categories.${cat}.title`)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t(`categories.${cat}.description`)}
                  </p>
                </div>
                <div className="flex items-center gap-6 sm:contents">
                  <div className="flex w-16 justify-center sm:justify-center">
                    <Toggle
                      checked={draft[cat].inApp}
                      onChange={() => toggle(cat, "inApp")}
                      label={t("toggle.inApp", { category: t(`categories.${cat}.title`) })}
                    />
                  </div>
                  <div className="flex w-16 justify-center">
                    <Toggle
                      checked={draft[cat].email}
                      onChange={() => toggle(cat, "email")}
                      label={t("toggle.email", { category: t(`categories.${cat}.title`) })}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        checked ? "bg-signal" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
