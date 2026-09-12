import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmartTable, type SmartTableColumn } from "@/components/shared/smart-table";
import { EmptyState } from "@/components/shared/empty-state";
import { AuthErrorState } from "@/components/auth/auth-error-state";
import { OpportunityError } from "@/lib/api/opportunities-types";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { renderWithProviders, testMessages } from "../utils/render";
import { makeOpportunity, testStages } from "../utils/fixtures";

/* ------------------------------------------------------------------ *
 * Mocks
 * ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  getPipelineStages: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => "/crm/pipeline",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/opportunities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/opportunities")>();
  return {
    ...actual,
    opportunitiesApi: {
      ...actual.opportunitiesApi,
      listOpportunities: mocks.listOpportunities,
      getPipelineStages: mocks.getPipelineStages,
    },
  };
});

const table = testMessages.shared.table;
const pipeline = testMessages.pipeline;

interface Row {
  id: string;
  name: string;
  city: string;
}

const rows: Row[] = [
  { id: "1", name: "Câmara de Leiria", city: "Leiria" },
  { id: "2", name: "Marinha Grande Tech", city: "Marinha Grande" },
  { id: "3", name: "Pombal Digital", city: "Pombal" },
];

const columns: SmartTableColumn<Row>[] = [
  {
    id: "name",
    header: "Nome",
    cell: (r) => r.name,
    accessor: (r) => r.name,
    sortable: true,
    cardPriority: 1,
  },
  {
    id: "city",
    header: "Concelho",
    cell: (r) => r.city,
    accessor: (r) => r.city,
    cardPriority: 2,
  },
];

beforeEach(() => {
  mocks.listOpportunities.mockReset();
  mocks.getPipelineStages.mockReset();
  mocks.push.mockReset();
});

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

describe("loading states", () => {
  it("SmartTable swaps the grid for an announced skeleton while loading", () => {
    renderWithProviders(
      <SmartTable data={[]} columns={columns} getRowId={(r) => r.id} loading />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // The empty state must NOT flash while the request is still in flight.
    expect(screen.queryByText(table.empty)).not.toBeInTheDocument();
  });

  it("PipelineBoard renders a board skeleton until both queries settle", async () => {
    mocks.getPipelineStages.mockResolvedValue(testStages);
    mocks.listOpportunities.mockResolvedValue([makeOpportunity()]);

    renderWithProviders(<PipelineBoard user={{ role: "gestor", userId: "u-1", paymentsGrant: true }} />);

    const skeleton = screen.getByRole("status");
    expect(skeleton).toHaveAttribute("aria-live", "polite");
    // The real board must not be painted underneath the skeleton.
    expect(screen.queryByText(pipeline.title)).not.toBeInTheDocument();

    await waitForElementToBeRemoved(skeleton);
    expect(screen.getByText(pipeline.title)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: pipeline.stages.qualification }),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * Empty
 * ------------------------------------------------------------------ */

describe("empty states", () => {
  it("uses the localized default copy when no data ever arrives", () => {
    renderWithProviders(
      <SmartTable data={[]} columns={columns} getRowId={(r) => r.id} />,
    );

    expect(screen.getByText(table.empty)).toBeInTheDocument();
    expect(screen.getByText(table.emptyDescription)).toBeInTheDocument();
    // No footer / pagination noise around an empty result.
    expect(screen.queryByText(table.previous)).not.toBeInTheDocument();
  });

  it("prefers caller-supplied empty copy over the generic default", () => {
    renderWithProviders(
      <SmartTable
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        emptyTitle="Ainda sem empresas"
        emptyDescription="Crie a primeira empresa."
      />,
    );

    expect(screen.getByText("Ainda sem empresas")).toBeInTheDocument();
    expect(screen.queryByText(table.empty)).not.toBeInTheDocument();
  });

  it("distinguishes 'nothing yet' from 'nothing matched' and can clear the query", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    await user.type(screen.getByRole("textbox", { name: table.search }), "zzzz");

    expect(await screen.findByText(table.noResults)).toBeInTheDocument();
    expect(screen.getByText(table.noResultsDescription)).toBeInTheDocument();
    // Crucially NOT the "nothing here yet" copy — the data set is non-empty.
    expect(screen.queryByText(table.empty)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: table.clearFilters }));
    // Rendered twice by design: the md+ table and the mobile card list.
    expect(await screen.findAllByText("Câmara de Leiria")).toHaveLength(2);
  });

  it("EmptyState renders an optional CTA and a decorative icon only", () => {
    renderWithProviders(
      <EmptyState
        title="Ainda sem oportunidades"
        description="Crie a primeira."
        action={<button type="button">Nova oportunidade</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Nova oportunidade" })).toBeInTheDocument();
    // The icon is decorative: it must not add an accessible image to the tree.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("PipelineBoard shows the pipeline empty state instead of a bare board", async () => {
    mocks.getPipelineStages.mockResolvedValue(testStages);
    mocks.listOpportunities.mockResolvedValue([]);

    renderWithProviders(<PipelineBoard user={{ role: "gestor", userId: "u-1", paymentsGrant: true }} />);

    expect(await screen.findByText(pipeline.empty.title)).toBeInTheDocument();
    expect(screen.getByText(pipeline.empty.description)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: pipeline.stages.qualification })).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * Error
 * ------------------------------------------------------------------ */

describe("error states", () => {
  it("offers a retry that refetches after a transient failure", async () => {
    const user = userEvent.setup();
    mocks.getPipelineStages.mockResolvedValue(testStages);
    mocks.listOpportunities.mockRejectedValue(new Error("boom"));

    renderWithProviders(<PipelineBoard user={{ role: "gestor", userId: "u-1", paymentsGrant: true }} />);

    expect(await screen.findByText(pipeline.errors.loadTitle)).toBeInTheDocument();

    mocks.listOpportunities.mockResolvedValue([makeOpportunity()]);
    await user.click(screen.getByRole("button", { name: pipeline.errors.retry }));

    expect(await screen.findByText("Website institucional")).toBeInTheDocument();
    expect(screen.queryByText(pipeline.errors.loadTitle)).not.toBeInTheDocument();
  });

  it("shows a forbidden state with NO retry when the failure is a permission error", async () => {
    mocks.getPipelineStages.mockResolvedValue(testStages);
    mocks.listOpportunities.mockRejectedValue(new OpportunityError("forbidden"));

    renderWithProviders(<PipelineBoard user={{ role: "gestor", userId: "u-1", paymentsGrant: false }} />);

    expect(await screen.findByText(pipeline.errors.forbiddenTitle)).toBeInTheDocument();
    expect(screen.getByText(pipeline.errors.forbiddenDescription)).toBeInTheDocument();
    // Retrying a 403 would just fail again — the affordance must be absent.
    expect(screen.queryByRole("button", { name: pipeline.errors.retry })).not.toBeInTheDocument();
  });

  it("AuthErrorState announces the failure and calls reset", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithProviders(<AuthErrorState reset={reset} />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(testMessages.auth.errorBoundary.title)).toBeInTheDocument();
    expect(alert).toHaveAttribute("aria-live", "assertive");

    await user.click(
      screen.getByRole("button", { name: testMessages.auth.errorBoundary.retry }),
    );
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * Populated — the states above only mean something against a real one
 * ------------------------------------------------------------------ */

describe("populated state", () => {
  it("renders rows and a pluralized result count", async () => {
    renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(await screen.findByText("3 registos")).toBeInTheDocument();
  });

  it("uses the singular form for exactly one record", async () => {
    renderWithProviders(
      <SmartTable data={[rows[0]]} columns={columns} getRowId={(r) => r.id} />,
    );
    expect(await screen.findByText("1 registo")).toBeInTheDocument();
  });

  it("sorts on demand and exposes aria-sort to assistive tech", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SmartTable data={rows} columns={columns} getRowId={(r) => r.id} />,
    );

    await user.click(screen.getByRole("button", { name: table.sortAsc }));

    const header = screen.getAllByRole("columnheader")[0];
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "ascending"));
    const firstCell = within(screen.getByRole("table")).getAllByRole("cell")[0];
    expect(firstCell).toHaveTextContent("Câmara de Leiria");
  });
});
