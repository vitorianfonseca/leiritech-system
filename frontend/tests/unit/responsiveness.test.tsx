import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu } from "lucide-react";
import { SmartTable, type SmartTableColumn } from "@/components/shared/smart-table";
import { PipelineColumn } from "@/components/pipeline/pipeline-column";
import { SidebarProvider } from "@/components/shell/sidebar-context";
import { DesktopSidebar } from "@/components/shell/sidebar";
import { MobileNav, MobileNavTrigger } from "@/components/shell/mobile-nav";
import { renderWithProviders, testMessages } from "../utils/render";
import { adminUser, testStages } from "../utils/fixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const table = testMessages.shared.table;
const sidebar = testMessages.shell.sidebar;
const nav = testMessages.nav;

/**
 * jsdom has no layout engine, so a breakpoint cannot be "resized" into. What we
 * CAN verify — and what actually breaks in review — is that each layout has a
 * real DOM branch: the same row must exist in both the md+ table and the
 * below-md card list, each behind the right Tailwind breakpoint utility.
 */
function classesOf(el: Element | null | undefined): string {
  return el?.className.toString() ?? "";
}

function findByClassFragment(root: HTMLElement, fragment: string): HTMLElement {
  const match = Array.from(root.querySelectorAll<HTMLElement>("*")).find((el) =>
    classesOf(el).split(/\s+/).includes(fragment),
  );
  if (!match) throw new Error(`No element carries the class "${fragment}"`);
  return match;
}

interface Row {
  id: string;
  name: string;
  city: string;
  owner: string;
}

const rows: Row[] = [
  { id: "1", name: "Câmara de Leiria", city: "Leiria", owner: "Ana Gestora" },
  { id: "2", name: "Pombal Digital", city: "Pombal", owner: "Rui Membro" },
];

const columns: SmartTableColumn<Row>[] = [
  { id: "name", header: "Nome", cell: (r) => r.name, accessor: (r) => r.name, cardPriority: 1 },
  { id: "city", header: "Concelho", cell: (r) => r.city, accessor: (r) => r.city, cardPriority: 2 },
  // No cardPriority: desktop-only detail, deliberately dropped from the card.
  { id: "owner", header: "Responsável", cell: (r) => r.owner, accessor: (r) => r.owner },
];

/* ------------------------------------------------------------------ *
 * Table ⇄ card list
 * ------------------------------------------------------------------ */

describe("SmartTable responsive layouts", () => {
  it("ships both a md+ table and a below-md card list for the same rows", () => {
    const { container } = renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    const tableWrapper = screen.getByRole("table").parentElement!;
    expect(classesOf(tableWrapper).split(/\s+/)).toEqual(
      expect.arrayContaining(["hidden", "md:block"]),
    );

    const cardList = findByClassFragment(container, "md:hidden");
    expect(within(cardList).getByText("Câmara de Leiria")).toBeInTheDocument();
    expect(within(cardList).getByText("Pombal Digital")).toBeInTheDocument();
  });

  it("keeps only the card-priority columns on the compact layout, in order", () => {
    const { container } = renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    const cardList = findByClassFragment(container, "md:hidden");
    const firstCard = cardList.firstElementChild as HTMLElement;

    expect(within(firstCard).getByText("Câmara de Leiria")).toBeInTheDocument();
    expect(within(firstCard).getByText("Leiria")).toBeInTheDocument();
    // "Responsável" has no cardPriority — it must not crowd the phone layout.
    expect(within(firstCard).queryByText("Ana Gestora")).not.toBeInTheDocument();
    // Secondary values are labelled, the headline is not.
    expect(firstCard.textContent).toContain("Concelho:");
    expect(firstCard.textContent).not.toContain("Nome:");
  });

  it("stacks the toolbar vertically before switching to a row at sm", () => {
    renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    const search = screen.getByRole("textbox", { name: table.search });
    const toolbar = search.closest("div")!.parentElement!;
    expect(classesOf(toolbar).split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-col", "sm:flex-row"]),
    );
  });

  it("never lets a row overflow the viewport horizontally without a scroller", () => {
    renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    const tableWrapper = screen.getByRole("table").parentElement!;
    expect(classesOf(tableWrapper)).toContain("overflow-x-auto");
  });

  it("keeps pagination controls named for assistive tech when labels collapse", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} pageSize={1} />,
    );

    const next = screen.getByRole("button", { name: table.next });
    // The visible word is hidden below sm; the accessible name must survive.
    expect(classesOf(within(next).getByText(table.next))).toContain("sm:inline");
    expect(screen.getByRole("button", { name: table.previous })).toBeDisabled();

    await user.click(next);
    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * Pipeline board columns
 * ------------------------------------------------------------------ */

describe("pipeline column responsiveness", () => {
  it("is a fixed-width snap card on phones and a fluid grid cell from sm", () => {
    renderWithProviders(
      <PipelineColumn stage={testStages[1]} total={6} count={2} valueCents={null}>
        <p>cartões</p>
      </PipelineColumn>,
    );

    const column = screen.getByRole("region", {
      name: testMessages.pipeline.stages.qualification,
    });
    expect(classesOf(column).split(/\s+/)).toEqual(
      expect.arrayContaining(["w-72", "shrink-0", "snap-start", "sm:w-full"]),
    );
  });

  it("hides the column total when finance access is not granted", () => {
    const { rerender } = renderWithProviders(
      <PipelineColumn stage={testStages[1]} total={6} count={2} valueCents={null}>
        <p>cartões</p>
      </PipelineColumn>,
    );
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();

    rerender(
      <PipelineColumn stage={testStages[1]} total={6} count={2} valueCents={2_500_000}>
        <p>cartões</p>
      </PipelineColumn>,
    );
    expect(screen.getByText(/€/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * Sidebar ⇄ mobile drawer
 * ------------------------------------------------------------------ */

describe("navigation chrome across breakpoints", () => {
  function renderShell() {
    return renderWithProviders(
      <SidebarProvider>
        <MobileNavTrigger icon={<Menu />} />
        <MobileNav user={adminUser} />
        <DesktopSidebar user={adminUser} />
      </SidebarProvider>,
    );
  }

  it("keeps the desktop rail out of the phone layout and the trigger out of desktop", () => {
    renderShell();

    const aside = screen.getByRole("complementary");
    expect(classesOf(aside).split(/\s+/)).toEqual(
      expect.arrayContaining(["hidden", "md:flex"]),
    );

    const trigger = screen.getByRole("button", { name: sidebar.open });
    expect(classesOf(trigger)).toContain("md:hidden");
  });

  it("opens the drawer from the phone trigger and closes it after navigating", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: sidebar.open }));

    const drawer = await screen.findByRole("dialog");
    expect(classesOf(drawer)).toContain("md:hidden");
    const link = within(drawer).getByRole("link", { name: nav.tasks });
    expect(link).toHaveAttribute("href", "/tasks");

    await user.click(link);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers an explicit close affordance inside the drawer", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: sidebar.open }));
    const drawer = await screen.findByRole("dialog");

    await user.click(within(drawer).getByRole("button", { name: sidebar.close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("collapses the desktop rail to an icon width on demand", async () => {
    const user = userEvent.setup();
    renderShell();

    const aside = screen.getByRole("complementary");
    expect(classesOf(aside)).toContain("w-64");

    await user.click(screen.getByRole("button", { name: sidebar.collapse }));

    await waitFor(() => expect(classesOf(aside)).toContain("w-16"));
    expect(aside).toHaveAttribute("data-collapsed", "true");
  });
});
