"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { visibleSections, type NavItem } from "./nav-config";
import { useSidebar } from "./sidebar-context";
import { LeiritechWordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSound } from "@/lib/use-sound";

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
  const { play } = useSound();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const label = t(item.key);

  const link = (
    <Link
      href={item.href}
      onClick={() => {
        play("navigate");
        onNavigate?.();
      }}
      aria-current={active ? "page" : undefined}
      className={cn(
        // The active state is a lifted white surface on warm paper, not a
        // tinted pill — and deliberately carries no signal blue. Navigating
        // is orientation, not action; blue is reserved for what to do next.
        "group/nav relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none",
        collapsed && "justify-center px-0",
        active
          ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_oklch(0.28_0.012_95/0.05)]"
          : "font-medium text-muted-foreground hover:bg-card/60 hover:text-foreground"
      )}
    >
      {/* One indicator for the whole nav, not one per item: `layoutId` makes
          it TRAVEL from the previous entry to this one. You see where you came
          from, which a cut cannot tell you. */}
      {active && !collapsed && (
        <motion.span
          aria-hidden
          layoutId="nav-indicator"
          transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
          className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-foreground"
        />
      )}
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none",
          active ? "text-foreground" : "text-muted-foreground/80"
        )}
        strokeWidth={active ? 2 : 1.75}
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
    <nav className="flex flex-col gap-6 px-3 py-5" aria-label={t("home")}>
      {sections.map((section) => (
        <div key={section.labelKey} className="flex flex-col gap-0.5">
          {!collapsed && (
            <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground/70">
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
        <Link href="/" aria-label="LeiriTech">
          <LeiritechWordmark collapsed={collapsed} />
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
