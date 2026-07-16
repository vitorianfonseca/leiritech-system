import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Users,
  ShieldCheck,
  GitBranch,
  Flag,
  Tags,
  LayoutTemplate,
  Gauge,
  Coins,
  Bell,
  Palette,
  Archive,
  Download,
} from "lucide-react";
import type { Role } from "@/lib/session";

export interface SettingsNavItem {
  /** i18n key under `settings.areas.` (label + description). */
  key: string;
  href: string;
  icon: LucideIcon;
  /** Admin-only config (BR-004). When false, a Gestor may also access it. */
  adminOnly: boolean;
}

export interface SettingsNavGroup {
  /** i18n key under `settings.groups.`. */
  labelKey: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    labelKey: "organization",
    items: [
      { key: "aurea", href: "/settings/aurea", icon: Building2, adminOnly: true },
      { key: "members", href: "/settings/members", icon: Users, adminOnly: true },
      { key: "roles", href: "/settings/roles", icon: ShieldCheck, adminOnly: true },
    ],
  },
  {
    labelKey: "commercial",
    items: [
      { key: "pipeline", href: "/settings/pipeline", icon: GitBranch, adminOnly: true },
      { key: "states", href: "/settings/states", icon: Flag, adminOnly: true },
      { key: "tags", href: "/settings/tags", icon: Tags, adminOnly: true },
      { key: "templates", href: "/settings/templates", icon: LayoutTemplate, adminOnly: false },
    ],
  },
  {
    labelKey: "resources",
    items: [
      { key: "capacity", href: "/settings/capacity", icon: Gauge, adminOnly: true },
      { key: "costs", href: "/settings/costs", icon: Coins, adminOnly: true },
    ],
  },
  {
    labelKey: "preferences",
    items: [
      { key: "notifications", href: "/settings/notifications", icon: Bell, adminOnly: false },
      { key: "theme", href: "/settings/theme", icon: Palette, adminOnly: false },
    ],
  },
  {
    labelKey: "data",
    items: [
      { key: "archive", href: "/settings/archive", icon: Archive, adminOnly: true },
      { key: "export", href: "/settings/export", icon: Download, adminOnly: true },
    ],
  },
];

/** Whether a role may see a given settings item. */
export function canSeeSettingsItem(item: SettingsNavItem, role: Role): boolean {
  if (role === "admin") return true;
  if (role === "gestor") return !item.adminOnly;
  return false;
}

/** Groups filtered for a role, with empty groups dropped. */
export function visibleSettingsGroups(role: Role): SettingsNavGroup[] {
  return SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeSettingsItem(item, role)),
  })).filter((group) => group.items.length > 0);
}

/** Flat list of items visible to a role (for the landing + mobile picker). */
export function visibleSettingsItems(role: Role): SettingsNavItem[] {
  return visibleSettingsGroups(role).flatMap((g) => g.items);
}
