"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LocaleSwitcher, TextSizeSwitcher } from "@/components/shared";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const OPTIONS: { value: ThemeOption; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function ThemeSettingsView() {
  const t = useTranslations("settings.theme");
  const tp = useTranslations("preferences.textSize");
  const { theme, setTheme } = useTheme();
  // Mount detection without setState-in-effect: false during SSR/hydration,
  // true on the client, so the selected option never causes a hydration mismatch.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const active = (mounted ? theme : "light") ?? "light";

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold text-foreground">{t("appearanceTitle")}</h2>
        <div
          role="radiogroup"
          aria-label={t("appearanceTitle")}
          className="grid gap-3 sm:grid-cols-3"
        >
          {OPTIONS.map((opt) => {
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
                  selected ? "border-signal bg-signal-muted/40" : "border-border bg-card hover:bg-accent"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg",
                      selected ? "bg-signal text-signal-foreground" : "bg-muted text-muted-foreground"
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
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{tp("title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{tp("description")}</p>
        </div>
        <TextSizeSwitcher />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold text-foreground">{t("languageTitle")}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div>
            <p className="font-medium text-foreground">{t("languageLabel")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("languageDescription")}</p>
          </div>
          <LocaleSwitcher variant="full" />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{t("profileNote")}</p>
      </section>
    </div>
  );
}
