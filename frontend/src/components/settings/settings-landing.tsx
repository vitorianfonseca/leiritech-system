"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/session";
import { visibleSettingsGroups } from "./settings-nav-config";

export interface SettingsLandingProps {
  role: Role;
}

/** /settings landing — a role-filtered directory of every configuration area. */
export function SettingsLanding({ role }: SettingsLandingProps) {
  const t = useTranslations("settings");
  const groups = React.useMemo(() => visibleSettingsGroups(role), [role]);

  return (
    <div className="space-y-8">
      <PageHeader title={t("index.title")} subtitle={t("index.subtitle")} />

      {groups.map((group) => (
        <section key={group.labelKey} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`groups.${group.labelKey}`)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-start gap-3 rounded-xl border border-border bg-card p-4 outline-none transition-colors",
                    "hover:border-gold/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-muted text-gold">
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      {t(`areas.${item.key}.title`)}
                      <ChevronRight
                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {t(`areas.${item.key}.description`)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
