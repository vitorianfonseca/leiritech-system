"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages, Check } from "lucide-react";
import { routing, type AppLocale } from "@/i18n/routing";
import { persistPref } from "@/lib/client-prefs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Changes the UI language WITHOUT touching the URL (mandatory rule).
 * - writes the `locale` cookie (returning anonymous visits keep the choice)
 * - mirrors to localStorage
 * - refreshes so server components re-render with the new messages
 *
 * When auth is wired, also PATCH /api/me { locale } so the profile is the
 * server-side source of truth. The URL never changes here.
 */
export function LocaleSwitcher({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const t = useTranslations("locale");
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function change(next: AppLocale) {
    if (next === current) return;
    persistPref("locale", next);
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "icon" ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("label")}
              disabled={pending}
            />
          ) : (
            <Button variant="outline" size="sm" disabled={pending} />
          )
        }
      >
        <Languages />
        {variant === "full" && (
          <span className="uppercase">{current.split("-")[0]}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        {routing.locales.map((loc) => (
          <DropdownMenuItem key={loc} onClick={() => change(loc)}>
            <Check
              className={cn(
                "transition-opacity",
                loc === current ? "opacity-100" : "opacity-0"
              )}
            />
            {t(loc)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
