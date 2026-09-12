"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings2, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/session";
import { visibleSettingsGroups, visibleSettingsItems } from "./settings-nav-config";

export interface SettingsNavProps {
  role: Role;
}

/**
 * Settings section navigation. Desktop: a grouped vertical sidebar. Mobile
 * (< md): a dropdown labelled with the active area so the nav collapses at
 * 390px. Active item is derived from the pathname.
 */
export function SettingsNav({ role }: SettingsNavProps) {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const groups = React.useMemo(() => visibleSettingsGroups(role), [role]);
  const items = React.useMemo(() => visibleSettingsItems(role), [role]);

  const activeItem = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <>
      {/* Mobile: collapsed dropdown */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="w-full justify-between" size="lg">
                <span className="inline-flex items-center gap-2">
                  {activeItem ? (
                    <activeItem.icon className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
                  ) : (
                    <Settings2 className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
                  )}
                  {activeItem ? t(`areas.${activeItem.key}.title`) : t("index.title")}
                </span>
                <ChevronRight className="size-4 rotate-90 text-muted-foreground" aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-sm">
            {items.map((item) => {
              const active = item === activeItem;
              return (
                <DropdownMenuItem
                  key={item.href}
                  render={<Link href={item.href} />}
                  className={cn(active && "bg-signal-muted text-signal")}
                >
                  <item.icon aria-hidden />
                  {t(`areas.${item.key}.title`)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop: grouped sidebar */}
      <nav className="hidden md:block" aria-label={t("navLabel")}>
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.labelKey} className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`groups.${group.labelKey}`)}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-signal-muted text-signal"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-signal" : "text-muted-foreground group-hover:text-foreground"
                          )}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        {t(`areas.${item.key}.title`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
