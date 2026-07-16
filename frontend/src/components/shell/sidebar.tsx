"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { visibleSections, type NavItem } from "./nav-config";
import { useSidebar } from "./sidebar-context";
import { AureaWordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const label = t(item.key);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold"
        />
      )}
      <Icon
        className={cn("size-[18px] shrink-0", active && "text-gold")}
        strokeWidth={1.8}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavList({
  user,
  collapsed,
  onNavigate,
}: {
  user: SessionUser;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const sections = visibleSections(user);

  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label={t("home")}>
      {sections.map((section) => (
        <div key={section.labelKey} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t(section.labelKey)}
            </p>
          )}
          {collapsed && (
            <div aria-hidden className="mx-auto mb-1 h-px w-5 bg-sidebar-border" />
          )}
          {section.items.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Desktop sidebar (md+), collapsible to an icon rail. */
export function DesktopSidebar({ user }: { user: SessionUser }) {
  const t = useTranslations("shell.sidebar");
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "hidden md:flex md:flex-col shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-4",
          collapsed && "justify-center px-0"
        )}
      >
        <Link href="/" aria-label="Aurea System">
          <AureaWordmark collapsed={collapsed} />
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <NavList user={user} collapsed={collapsed} />
      </ScrollArea>

      <div
        className={cn(
          "border-t border-sidebar-border p-2",
          collapsed ? "flex justify-center" : ""
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size={collapsed ? "icon" : "sm"}
                onClick={toggleCollapsed}
                aria-label={collapsed ? t("expand") : t("collapse")}
                className={cn(!collapsed && "w-full justify-start gap-3 px-3")}
              />
            }
          >
            {collapsed ? <PanelLeft /> : <PanelLeftClose />}
            {!collapsed && (
              <span className="text-muted-foreground">{t("collapse")}</span>
            )}
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">{t("expand")}</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}

/** Mobile navigation drawer (below md), a11y via Dialog. */
export { NavList };
