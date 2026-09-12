"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Sun,
  Moon,
  Monitor,
  Check,
  Save,
  Bell,
  Mail,
  SlidersHorizontal,
  TriangleAlert,
  RefreshCw,
} from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher, TextSizeSwitcher, EmptyState, SkeletonList, toast } from "@/components/shared";
import { SoundPreference } from "./sound-preference";
import { cn } from "@/lib/utils";
import { profileApi } from "@/lib/api/profile";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from "@/lib/api/settings-types";
import { PreferenceToggle } from "./preference-toggle";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: { value: ThemeOption; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function PreferencesSection({ user }: { user: SessionUser }) {
  const t = useTranslations("profile.preferences");
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-8">
      {/* Appearance / theme */}
      <div className="space-y-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            {t("appearance.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("appearance.description")}
          </p>
        </div>
        <ThemePicker />
      </div>

      {/* Text size */}
      <TextSizePreference />

      {/* Language */}
      <div className="space-y-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            {t("language.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("language.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="font-medium text-foreground">{t("language.label")}</p>
          <LocaleSwitcher variant="full" />
        </div>
      </div>

      {/* Sound */}
      <SoundPreference />

      {/* Notifications */}
      <div className="space-y-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            {t("notifications.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("notifications.description")}
          </p>
        </div>
        {isAdmin ? <NotificationsAdminLink /> : <NotificationChannels user={user} />}
      </div>
    </div>
  );
}

function ThemePicker() {
  const t = useTranslations("profile.preferences.appearance");
  const { theme, setTheme } = useTheme();
  // Mount detection without setState-in-effect (avoids hydration mismatch).
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const active = (mounted ? theme : "light") ?? "light";

  return (
    <div
      role="radiogroup"
      aria-label={t("title")}
      className="grid gap-3 sm:grid-cols-3"
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "group flex flex-col items-start gap-3 rounded-xl border p-4 text-left outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-signal bg-signal-muted/40"
                : "border-border bg-card hover:bg-accent"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg",
                  selected
                    ? "bg-signal text-signal-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={1.8} aria-hidden />
              </span>
              {selected ? (
                <Check className="size-4 text-signal" strokeWidth={2.4} aria-hidden />
              ) : null}
            </div>
            <div>
              <p className="font-medium text-foreground">{t(`options.${opt.value}.title`)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t(`options.${opt.value}.description`)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TextSizePreference() {
  const t = useTranslations("preferences.textSize");
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <TextSizeSwitcher />
    </div>
  );
}

function NotificationsAdminLink() {
  const t = useTranslations("profile.preferences.notifications");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{t("adminLink.title")}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("adminLink.description")}</p>
      </div>
      <Button
        variant="outline"
        size="lg"
        nativeButton={false}
        render={<Link href="/settings/notifications" />}
      >
        <SlidersHorizontal aria-hidden />
        {t("adminLink.action")}
      </Button>
    </div>
  );
}

function NotificationChannels({ user }: { user: SessionUser }) {
  const t = useTranslations("profile.preferences.notifications");
  const tCat = useTranslations("settings.notifications.categories");
  const tErr = useTranslations("profile.errors");

  const query = useQuery({
    queryKey: ["profile-prefs", user.id],
    queryFn: () => profileApi.getPreferences(user),
  });

  const [draft, setDraft] = React.useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [syncedFrom, setSyncedFrom] = React.useState<NotificationPreferences | null>(null);

  if (query.data && query.data.notificationChannels !== syncedFrom) {
    setSyncedFrom(query.data.notificationChannels);
    setDraft(structuredClone(query.data.notificationChannels));
  }

  const dirty =
    draft && query.data
      ? JSON.stringify(draft) !== JSON.stringify(query.data.notificationChannels)
      : false;

  function toggle(cat: NotificationCategory, channel: "inApp" | "email") {
    setDraft((prev) =>
      prev ? { ...prev, [cat]: { ...prev[cat], [channel]: !prev[cat][channel] } } : prev
    );
  }

  async function save() {
    if (!draft) return;
    try {
      setSaving(true);
      const next = await profileApi.updatePreferences(user, {
        notificationChannels: draft,
      });
      setSyncedFrom(next.notificationChannels);
      setDraft(structuredClone(next.notificationChannels));
      query.refetch();
      toast({ tone: "success", title: t("saved") });
    } catch {
      toast({ tone: "destructive", title: tErr("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  if (query.isError) {
    return (
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
    );
  }

  if (query.isLoading || !draft) {
    return <SkeletonList rows={4} media={false} />;
  }

  return (
    <div className="space-y-4">
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
                <p className="font-medium text-foreground">{tCat(`${cat}.title`)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {tCat(`${cat}.description`)}
                </p>
              </div>
              <div className="flex items-center gap-6 sm:contents">
                <div className="flex w-16 justify-center">
                  <PreferenceToggle
                    checked={draft[cat].inApp}
                    onChange={() => toggle(cat, "inApp")}
                    label={t("toggle.inApp", { category: tCat(`${cat}.title`) })}
                  />
                </div>
                <div className="flex w-16 justify-center">
                  <PreferenceToggle
                    checked={draft[cat].email}
                    onChange={() => toggle(cat, "email")}
                    label={t("toggle.email", { category: tCat(`${cat}.title`) })}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || saving}>
          <Save aria-hidden />
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
