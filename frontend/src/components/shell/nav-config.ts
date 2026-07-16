import type { LucideIcon } from "lucide-react";
import {
  Home,
  Briefcase,
  Building2,
  Users,
  GitBranch,
  FileText,
  FolderKanban,
  ListChecks,
  CalendarDays,
  UsersRound,
  Wallet,
  ChartColumn,
  Settings,
} from "lucide-react";
import type { Role, SessionUser } from "@/lib/session";

export type Grant = "payments" | "invites";

export interface NavItem {
  /** i18n key under `nav.` */
  key: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  /** If set, a Gestor also needs this explicit grant (admin always passes). */
  grant?: Grant;
}

export interface NavSection {
  /** i18n key under `nav.` */
  labelKey: string;
  items: NavItem[];
}

const ALL: Role[] = ["admin", "gestor", "membro"];
const MANAGERS: Role[] = ["admin", "gestor"];
const ADMIN: Role[] = ["admin"];

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "sectionMain",
    items: [
      { key: "home", href: "/", icon: Home, roles: ALL },
      { key: "myWork", href: "/my-work", icon: Briefcase, roles: ALL },
    ],
  },
  {
    labelKey: "sectionCommercial",
    items: [
      { key: "crmCompanies", href: "/crm/companies", icon: Building2, roles: ALL },
      { key: "crmContacts", href: "/crm/contacts", icon: Users, roles: MANAGERS },
      { key: "crmPipeline", href: "/crm/pipeline", icon: GitBranch, roles: MANAGERS },
      { key: "crmProposals", href: "/crm/proposals", icon: FileText, roles: MANAGERS },
    ],
  },
  {
    labelKey: "sectionDelivery",
    items: [
      { key: "projects", href: "/projects", icon: FolderKanban, roles: ALL },
      { key: "tasks", href: "/tasks", icon: ListChecks, roles: ALL },
      { key: "calendar", href: "/calendar", icon: CalendarDays, roles: ALL },
    ],
  },
  {
    labelKey: "sectionOrg",
    items: [
      { key: "team", href: "/team", icon: UsersRound, roles: ALL },
      { key: "finance", href: "/finance", icon: Wallet, roles: MANAGERS, grant: "payments" },
      { key: "reports", href: "/reports", icon: ChartColumn, roles: ALL },
      { key: "settings", href: "/settings", icon: Settings, roles: ADMIN },
    ],
  },
];

export function canSee(item: NavItem, user: SessionUser): boolean {
  if (!item.roles.includes(user.role)) return false;
  if (item.grant && user.role !== "admin") {
    return item.grant === "payments" ? user.paymentsGrant : user.invitesGrant;
  }
  return true;
}

/** Sections with role-invisible items removed; empty sections dropped. */
export function visibleSections(user: SessionUser): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSee(item, user)),
  })).filter((section) => section.items.length > 0);
}
