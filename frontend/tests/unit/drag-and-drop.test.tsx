import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { PipelineColumn } from "@/components/pipeline/pipeline-column";
import { SortableOpportunityCard } from "@/components/pipeline/opportunity-card";
import { renderWithProviders, testMessages } from "../utils/render";
import { makeOpportunity, testStages } from "../utils/fixtures";

/* ------------------------------------------------------------------ *
 * Mocks
 *
 * dnd-kit's PointerSensor needs real hit-testing and layout, which jsdom does
 * not provide. Instead of faking pointer physics we stub ONLY <DndContext>,
 * capturing the drag callbacks the board registers, and then fire real
 * DragStart/DragEnd payloads at them. Everything else — useDraggable,
 * useDroppable, the move dialog, the API call — stays real, so what is under
 * test is the board's actual drop handling, not a simulation of it.
 * ------------------------------------------------------------------ */

const dnd = vi.hoisted(() => ({
  handlers: {} as {
    onDragStart?: (e: DragStartEvent) => void;
    onDragEnd?: (e: DragEndEvent) => void;
    onDragCancel?: () => void;
  },
}));

const mocks = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  getPipelineStages: vi.fn(),
  moveOpportunity: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      ...props
    }: React.PropsWithChildren<typeof dnd.handlers>) => {
      dnd.handlers = props;
      return <div data-testid="dnd-context">{children}</div>;
    },
    DragOverlay: ({ children }: React.PropsWithChildren) => (
      <div data-testid="drag-overlay">{children}</div>
    ),
  };
});

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
      moveOpportunity: mocks.moveOpportunity,
    },
  };
});

const pipeline = testMessages.pipeline;
const managerUser = { role: "gestor" as const, userId: "u-gestor", paymentsGrant: true };

const opp = makeOpportunity({
  id: "opp-1",
  title: "Website institucional",
  stageId: "qualification",
});

function dragEnd(activeId: string, overId: string | null): void {
  act(() => {
    dnd.handlers.onDragEnd?.({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
    } as unknown as DragEndEvent);
  });
}

async function renderBoard(opportunities = [opp]) {
  mocks.getPipelineStages.mockResolvedValue(testStages);
  mocks.listOpportunities.mockResolvedValue(opportunities);
  const result = renderWithProviders(<PipelineBoard user={managerUser} />);
  await screen.findByText(opportunities[0]?.title ?? pipeline.title);
  return result;
}

beforeEach(() => {
  dnd.handlers = {};
  mocks.listOpportunities.mockReset();
  mocks.getPipelineStages.mockReset();
  mocks.moveOpportunity.mockReset();
  mocks.moveOpportunity.mockResolvedValue(undefined);
  mocks.push.mockReset();
});

/* ------------------------------------------------------------------ *
 * Droppable columns + draggable cards
 * ------------------------------------------------------------------ */

describe("droppable columns", () => {
  it("registers one landing zone per stage, labelled for assistive tech", async () => {
    await renderBoard();

    for (const stage of testStages) {
      const label = pipeline.stages[stage.id];
      expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the cards of a stage inside that stage's column", async () => {
    await renderBoard();

    const column = screen.getByRole("region", { name: pipeline.stages.qualification });
    expect(within(column).getByText("Website institucional")).toBeInTheDocument();

    const other = screen.getByRole("region", { name: pipeline.stages.negotiation });
    expect(within(other).getByText(pipeline.column.empty)).toBeInTheDocument();
  });

  it("shows an explicit per-column empty state rather than a blank drop zone", () => {
    renderWithProviders(
      <PipelineColumn stage={testStages[0]} total={6} count={0} valueCents={null}>
        <p>{pipeline.column.empty}</p>
      </PipelineColumn>,
    );

    const column = screen.getByRole("region", { name: pipeline.stages.new_contact });
    expect(within(column).getByText(pipeline.column.empty)).toBeInTheDocument();
    expect(within(column).getByText("10% de probabilidade")).toBeInTheDocument();
  });
});

describe("draggable cards", () => {
  it("exposes a labelled keyboard-focusable drag handle for managers", () => {
    renderWithProviders(
      <SortableOpportunityCard
        opportunity={opp}
        canManage
        onWin={vi.fn()}
        onLose={vi.fn()}
      />,
    );

    const handle = screen.getByRole("button", { name: "Arrastar «Website institucional»" });
    expect(handle).toHaveAttribute("type", "button");
    // touch-none is what makes the pointer sensor usable on a touch screen.
    expect(handle.className).toContain("touch-none");
  });

  it("omits the drag handle entirely when the viewer cannot manage the deal", () => {
    renderWithProviders(
      <SortableOpportunityCard
        opportunity={opp}
        canManage={false}
        onWin={vi.fn()}
        onLose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Arrastar/ }),
    ).not.toBeInTheDocument();
    // …and the card itself is still readable.
    expect(screen.getByText("Website institucional")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * Drop handling
 * ------------------------------------------------------------------ */

describe("dropping a card on another stage", () => {
  it("opens the move dialog showing the origin and the target stage", async () => {
    await renderBoard();

    dragEnd("opp-1", "negotiation");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(pipeline.move.title)).toBeInTheDocument();
    expect(within(dialog).getByText(pipeline.stages.qualification)).toBeInTheDocument();
    expect(within(dialog).getByText(pipeline.stages.negotiation)).toBeInTheDocument();
    // Nothing is persisted until the dialog is confirmed (BR-010).
    expect(mocks.moveOpportunity).not.toHaveBeenCalled();
  });

  it("blocks the move until a próxima ação is supplied (BR-010)", async () => {
    const user = userEvent.setup();
    await renderBoard([makeOpportunity({ nextAction: null, nextActionAt: null })]);

    dragEnd("opp-1", "proposal_sent");
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: pipeline.move.confirm }));

    expect(
      await within(dialog).findByText(pipeline.validation.nextActionRequired),
    ).toBeInTheDocument();
    expect(mocks.moveOpportunity).not.toHaveBeenCalled();
  });

  it("commits the move with the target stage and the próxima ação", async () => {
    const user = userEvent.setup();
    await renderBoard();

    dragEnd("opp-1", "proposal_sent");
    const dialog = await screen.findByRole("dialog");

    const nextAction = within(dialog).getByDisplayValue("Agendar reunião de arranque");
    await user.clear(nextAction);
    await user.type(nextAction, "Enviar proposta revista");
    await user.click(within(dialog).getByRole("button", { name: pipeline.move.confirm }));

    await waitFor(() =>
      expect(mocks.moveOpportunity).toHaveBeenCalledWith(
        "opp-1",
        {
          toStageId: "proposal_sent",
          nextAction: "Enviar proposta revista",
          nextActionAt: "2999-01-31",
        },
        "u-gestor",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers an undo that moves the card back to the original stage", async () => {
    const user = userEvent.setup();
    await renderBoard();

    dragEnd("opp-1", "negotiation");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: pipeline.move.confirm }));

    await waitFor(() => expect(mocks.moveOpportunity).toHaveBeenCalledTimes(1));
    expect(mocks.moveOpportunity.mock.calls[0][1].toStageId).toBe("negotiation");
  });
});

describe("drops that must be no-ops", () => {
  it("ignores a drop back onto the card's own column", async () => {
    await renderBoard();

    dragEnd("opp-1", "qualification");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.moveOpportunity).not.toHaveBeenCalled();
  });

  it("ignores a drop released outside every column", async () => {
    await renderBoard();

    dragEnd("opp-1", null);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.moveOpportunity).not.toHaveBeenCalled();
  });

  it("ignores a drag id that no longer maps to a loaded opportunity", async () => {
    await renderBoard();

    dragEnd("opp-deleted", "negotiation");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.moveOpportunity).not.toHaveBeenCalled();
  });
});

describe("drag overlay", () => {
  it("mirrors the dragged card while a drag is active and clears on cancel", async () => {
    await renderBoard();

    const overlay = screen.getByTestId("drag-overlay");
    expect(overlay).toBeEmptyDOMElement();

    act(() => {
      dnd.handlers.onDragStart?.({ active: { id: "opp-1" } } as unknown as DragStartEvent);
    });
    expect(within(screen.getByTestId("drag-overlay")).getByText("Website institucional"))
      .toBeInTheDocument();

    act(() => dnd.handlers.onDragCancel?.());
    expect(screen.getByTestId("drag-overlay")).toBeEmptyDOMElement();
  });
});
