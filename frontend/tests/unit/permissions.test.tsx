import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavList } from "@/components/shell/sidebar";
import { visibleSections } from "@/components/shell/nav-config";
import { OpportunityCardView } from "@/components/pipeline/opportunity-card";
import { canAccessPipeline } from "@/lib/api/opportunities-types";
import { canAccessFinance, canManageFinance } from "@/lib/api/finance-types";
import {
  canAccessProjects,
  canCancelProject,
  canCreateProject,
  canManageProject,
  canSeeProjectFinance,
} from "@/lib/api/projects-types";
import { canAccessTasks, canApproveTasks, canReviewTasks } from "@/lib/api/tasks-types";
import {
  canAccessSettings,
  canAdministerSettings,
  canInviteMembers,
} from "@/lib/api/settings-types";
import { isScopedCrm } from "@/lib/api/crm-types";
import { isScopedDashboard } from "@/lib/api/dashboard-types";
import type { Role } from "@/lib/session";
import { renderWithProviders, testMessages } from "../utils/render";
import {
  adminUser,
  gestorUser,
  grantedGestorUser,
  makeOpportunity,
  membroUser,
} from "../utils/fixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const nav = testMessages.nav;
const card = testMessages.pipeline.card;
const ROLES: Role[] = ["admin", "gestor", "membro"];

/** Nav keys a role can reach, for readable per-role assertions. */
function navKeysFor(user: typeof adminUser): string[] {
  return visibleSections(user).flatMap((s) => s.items.map((i) => i.key));
}

/* ------------------------------------------------------------------ *
 * Access predicates (WORKFLOW_SPEC §3 / BR-002..BR-008)
 * ------------------------------------------------------------------ */

describe("role predicates", () => {
  it("keeps Membro out of the commercial pipeline entirely (BR-002)", () => {
    expect(ROLES.map(canAccessPipeline)).toEqual([true, true, false]);
  });

  it("gates finance on the payments grant for Gestor, never for Membro (BR-008)", () => {
    expect(canAccessFinance("admin", false)).toBe(true);
    expect(canAccessFinance("gestor", false)).toBe(false);
    expect(canAccessFinance("gestor", true)).toBe(true);
    expect(canAccessFinance("membro", true)).toBe(false);
    // Writing is currently the same predicate; assert it so a future split is caught.
    expect(canManageFinance("gestor", true)).toBe(true);
    expect(canManageFinance("membro", true)).toBe(false);
    expect(canSeeProjectFinance("gestor", false)).toBe(false);
  });

  it("lets every role reach projects and tasks but only managers write", () => {
    expect(ROLES.map(canAccessProjects)).toEqual([true, true, true]);
    expect(ROLES.map(canAccessTasks)).toEqual([true, true, true]);
    expect(ROLES.map(canCreateProject)).toEqual([true, true, false]);
    expect(ROLES.map(canApproveTasks)).toEqual([true, true, false]);
    expect(ROLES.map(canReviewTasks)).toEqual([true, true, false]);
  });

  it("scopes project lifecycle to the owning Gestor", () => {
    expect(canManageProject("gestor", true)).toBe(true);
    expect(canManageProject("gestor", false)).toBe(false);
    expect(canManageProject("admin", false)).toBe(true);
    expect(canManageProject("membro", true)).toBe(false);
  });

  it("is stricter about cancelling than about managing", () => {
    expect(canCancelProject("admin", false)).toBe(true);
    expect(canCancelProject("gestor", true)).toBe(true);
    expect(canCancelProject("gestor", false)).toBe(false);
    expect(canCancelProject("membro", true)).toBe(false);
  });

  it("keeps organisation settings Admin-only but invites grantable (BR-003/004)", () => {
    expect(ROLES.map(canAdministerSettings)).toEqual([true, false, false]);
    expect(ROLES.map(canAccessSettings)).toEqual([true, true, false]);
    expect(canInviteMembers("gestor", false)).toBe(false);
    expect(canInviteMembers("gestor", true)).toBe(true);
    expect(canInviteMembers("admin", false)).toBe(true);
    expect(canInviteMembers("membro", true)).toBe(false);
  });

  it("row-scopes CRM and the dashboard for Membro only (BR-002)", () => {
    expect(ROLES.map(isScopedCrm)).toEqual([false, false, true]);
    expect(ROLES.map(isScopedDashboard)).toEqual([false, false, true]);
  });
});

/* ------------------------------------------------------------------ *
 * Permission-scoped navigation
 * ------------------------------------------------------------------ */

describe("role-scoped navigation", () => {
  it("gives an Admin every entry, including settings", () => {
    renderWithProviders(<NavList user={adminUser} collapsed={false} />);

    expect(screen.getByRole("link", { name: nav.settings })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: nav.finance })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: nav.invite })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: nav.crmPipeline })).toBeInTheDocument();
  });

  it("hides grant-gated entries from a Gestor who holds no grants", () => {
    renderWithProviders(<NavList user={gestorUser} collapsed={false} />);

    expect(screen.queryByRole("link", { name: nav.finance })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: nav.invite })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: nav.settings })).not.toBeInTheDocument();
    // Manager-level commercial access is NOT grant-gated.
    expect(screen.getByRole("link", { name: nav.crmPipeline })).toBeInTheDocument();
  });

  it("reveals finance and invites once the grants are set", () => {
    renderWithProviders(<NavList user={grantedGestorUser} collapsed={false} />);

    expect(screen.getByRole("link", { name: nav.finance })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: nav.invite })).toBeInTheDocument();
    // Still not an Admin.
    expect(screen.queryByRole("link", { name: nav.settings })).not.toBeInTheDocument();
  });

  it("shows a Membro only their own work surfaces", () => {
    renderWithProviders(<NavList user={membroUser} collapsed={false} />);

    for (const hidden of [nav.crmPipeline, nav.crmProposals, nav.crmCatalog, nav.finance, nav.settings]) {
      expect(screen.queryByRole("link", { name: hidden })).not.toBeInTheDocument();
    }
    for (const visible of [nav.home, nav.myWork, nav.projects, nav.tasks, nav.calendar]) {
      expect(screen.getByRole("link", { name: visible })).toBeInTheDocument();
    }
  });

  it("never grants a lower role more than a higher one", () => {
    const admin = new Set(navKeysFor(adminUser));
    const gestor = navKeysFor(grantedGestorUser);
    const membro = navKeysFor(membroUser);

    expect(gestor.every((k) => admin.has(k))).toBe(true);
    expect(membro.every((k) => new Set(gestor).has(k))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Permission-scoped controls + financial gating
 * ------------------------------------------------------------------ */

describe("permission-scoped controls", () => {
  it("offers win/lose actions to a manager", async () => {
    const user = userEvent.setup();
    const onWin = vi.fn();
    renderWithProviders(
      <OpportunityCardView
        opportunity={makeOpportunity()}
        canManage
        onWin={onWin}
        onLose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: card.actions }));
    await user.click(await screen.findByText(card.markWon));
    expect(onWin).toHaveBeenCalledTimes(1);
  });

  it("hides the actions menu from a viewer who cannot manage the deal", () => {
    renderWithProviders(
      <OpportunityCardView opportunity={makeOpportunity()} canManage={false} />,
    );

    expect(screen.queryByRole("button", { name: card.actions })).not.toBeInTheDocument();
    // Read access is preserved: the detail link stays available.
    expect(screen.getByRole("link", { name: "Website institucional" })).toHaveAttribute(
      "href",
      "/crm/opportunities/opp-1",
    );
  });

  it("hides the reopen action while the opportunity is still open", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OpportunityCardView
        opportunity={makeOpportunity()}
        canManage
        onWin={vi.fn()}
        onLose={vi.fn()}
        onReopen={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: card.actions }));
    expect(await screen.findByText(card.markWon)).toBeInTheDocument();
    expect(screen.queryByText(card.reopen)).not.toBeInTheDocument();
  });

  it("substitutes a 'restricted' label for the deal value without finance access (BR-008)", () => {
    renderWithProviders(
      <OpportunityCardView
        opportunity={makeOpportunity({ valueCents: null })}
        canManage={false}
      />,
    );

    expect(screen.getByText(card.valueRestricted)).toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("renders the value in euros when finance access is granted", () => {
    renderWithProviders(
      <OpportunityCardView
        opportunity={makeOpportunity({ valueCents: 2_500_000 })}
        canManage={false}
      />,
    );

    expect(screen.queryByText(card.valueRestricted)).not.toBeInTheDocument();
    expect(screen.getByText(/€/)).toHaveTextContent(/25\D?000/);
  });
});
