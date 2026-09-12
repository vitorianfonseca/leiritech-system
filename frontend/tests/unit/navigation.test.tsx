import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NAV_SECTIONS, canSee, visibleSections } from "@/components/shell/nav-config";
import { NavList } from "@/components/shell/sidebar";
import { pipelineRoutes } from "@/lib/api/opportunities";
import { renderWithProviders, testMessages } from "../utils/render";
import { adminUser, grantedGestorUser } from "../utils/fixtures";

const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const nav = testMessages.nav;

beforeEach(() => {
  pathname.value = "/";
});

/* ------------------------------------------------------------------ *
 * Route table integrity
 * ------------------------------------------------------------------ */

describe("nav configuration", () => {
  const allItems = NAV_SECTIONS.flatMap((s) => s.items);

  it("declares a unique, absolute href for every entry", () => {
    const hrefs = allItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
  });

  it("never puts a locale segment in a URL (project-wide routing rule)", () => {
    for (const item of allItems) {
      expect(item.href).not.toMatch(/^\/(pt-PT|pt|en)(\/|$)/);
    }
  });

  it("has a translation for every nav key and section label", () => {
    for (const section of NAV_SECTIONS) {
      expect(nav).toHaveProperty(section.labelKey);
      for (const item of section.items) expect(nav).toHaveProperty(item.key);
    }
  });

  it("keeps route builders in sync with the nav table", () => {
    const pipelineItem = allItems.find((i) => i.key === "crmPipeline");
    expect(pipelineItem?.href).toBe(pipelineRoutes.board());
  });

  it("drops sections that end up with no visible items", () => {
    const sections = visibleSections(adminUser);
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
    expect(sections.map((s) => s.labelKey)).toEqual(
      NAV_SECTIONS.map((s) => s.labelKey),
    );
  });

  it("lets an admin through a grant-gated item without holding the grant", () => {
    const finance = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === "finance");
    expect(finance?.grant).toBe("payments");
    expect(adminUser.paymentsGrant).toBe(false);
    expect(canSee(finance!, adminUser)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Rendered navigation
 * ------------------------------------------------------------------ */

describe("<NavList />", () => {
  it("renders each entry as a link pointing at its configured route", () => {
    renderWithProviders(<NavList user={adminUser} collapsed={false} />);

    const region = screen.getByRole("navigation");
    for (const item of visibleSections(adminUser).flatMap((s) => s.items)) {
      const label = nav[item.key as keyof typeof nav];
      expect(within(region).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it("groups links under the localized section headings", () => {
    renderWithProviders(<NavList user={adminUser} collapsed={false} />);

    expect(screen.getByText(nav.sectionMain)).toBeInTheDocument();
    expect(screen.getByText(nav.sectionCommercial)).toBeInTheDocument();
    expect(screen.getByText(nav.sectionDelivery)).toBeInTheDocument();
    expect(screen.getByText(nav.sectionOrg)).toBeInTheDocument();
  });

  it("marks only the current route with aria-current='page'", () => {
    pathname.value = "/crm/pipeline";
    renderWithProviders(<NavList user={grantedGestorUser} collapsed={false} />);

    expect(screen.getByRole("link", { name: nav.crmPipeline })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: nav.crmCompanies })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the section active on a nested detail route", () => {
    pathname.value = "/projects/p-42/phases";
    renderWithProviders(<NavList user={grantedGestorUser} collapsed={false} />);

    expect(screen.getByRole("link", { name: nav.projects })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("treats '/' as an exact match so Início is not always active", () => {
    pathname.value = "/my-work";
    renderWithProviders(<NavList user={adminUser} collapsed={false} />);

    expect(screen.getByRole("link", { name: nav.home })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: nav.myWork })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark /crm/companies active from the /crm/contacts route", () => {
    pathname.value = "/crm/contacts";
    renderWithProviders(<NavList user={adminUser} collapsed={false} />);

    expect(screen.getByRole("link", { name: nav.crmCompanies })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: nav.crmContacts })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("notifies the host on navigation so the mobile drawer can close itself", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(
      <NavList user={adminUser} collapsed={false} onNavigate={onNavigate} />,
    );

    await user.click(screen.getByRole("link", { name: nav.tasks }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("hides the labels but keeps the links reachable when collapsed", () => {
    renderWithProviders(<NavList user={adminUser} collapsed />);

    expect(screen.queryByText(nav.sectionMain)).not.toBeInTheDocument();
    // Icon rail: the link is still in the a11y tree via its tooltip trigger.
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});
