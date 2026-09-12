import type { LucideIcon } from "lucide-react";
import {
  Home,
  Briefcase,
  Building2,
  Users,
  GitBranch,
  FileText,
  Package,
  FileStack,
  FolderKanban,
  ListChecks,
  CalendarDays,
  Timer,
  UsersRound,
  Wallet,
  Settings,
  UserPlus,
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
      // BR-002: /crm/contacts serves role-scoped data (a Membro sees only the
      // clients of their own projects), so the link is visible to everyone.
      { key: "crmContacts", href: "/crm/contacts", icon: Users, roles: ALL },
      { key: "crmPipeline", href: "/crm/pipeline", icon: GitBranch, roles: MANAGERS },
      { key: "crmProposals", href: "/crm/proposals", icon: FileText, roles: MANAGERS },
      { key: "crmCatalog", href: "/crm/catalog", icon: Package, roles: MANAGERS },
      { key: "crmProposalTemplates", href: "/crm/proposal-templates", icon: FileStack, roles: MANAGERS },
    ],
  },
  {
    labelKey: "sectionDelivery",
    items: [
      { key: "projects", href: "/projects", icon: FolderKanban, roles: ALL },
      { key: "tasks", href: "/tasks", icon: ListChecks, roles: ALL },
      { key: "time", href: "/time", icon: Timer, roles: ALL },
      { key: "calendar", href: "/calendar", icon: CalendarDays, roles: ALL },
    ],
  },
  {
    labelKey: "sectionOrg",
    items: [
      { key: "team", href: "/team", icon: UsersRound, roles: ALL },
      // BR-003 / §3: a Gestor with an explicit invites grant can invite members
      // without opening full admin settings. Admin always passes.
      { key: "invite", href: "/settings/members/invite", icon: UserPlus, roles: MANAGERS, grant: "invites" },
      { key: "finance", href: "/finance", icon: Wallet, roles: MANAGERS, grant: "payments" },
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
