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
import { spring } from "@/lib/motion";
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
        // Nearly invisible at rest. The active item is not a filled pill —
        // it is simply the only ink-weight label in the column, with a short
        // rule at the leading edge. Chrome that announces itself competes
        // with the content it is supposed to be a frame for.
        "group/nav relative flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm transition-all duration-[var(--duration-base)] motion-reduce:transition-none",
        collapsed && "justify-center px-0",
        active
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {/* The pill itself travels between entries on a shared layout id, so
          moving through the nav reads as one object sliding rather than two
          separate highlights blinking on and off. */}
      {active && (
        <motion.span
          aria-hidden
          layoutId="nav-pill"
          transition={spring.layout}
          className="absolute inset-0 rounded-2xl bg-signal-muted"
        />
      )}
      <Icon
        className={cn(
          "relative z-10 size-[1.15rem] shrink-0 transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none",
          active ? "text-signal" : "text-muted-foreground/60"
        )}
        strokeWidth={active ? 2.1 : 1.75}
        aria-hidden
      />
      {!collapsed && <span className="relative z-10 truncate">{label}</span>}
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
        <div key={section.labelKey} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3.5 pb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground/50 uppercase">
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
        "hidden shrink-0 bg-sidebar transition-[width] duration-200 ease-out md:flex md:flex-col",
        collapsed ? "w-[4.5rem]" : "w-[16.5rem]"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center px-3",
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
          "p-3",
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
