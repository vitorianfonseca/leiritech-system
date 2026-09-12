"use client";

import * as React from "react";

/**
 * The project a task view is scoped to, if any.
 *
 * A card shows "Project · Phase" so a task is placeable when the board spans
 * everything. Inside one project that prefix is the same on every card and
 * pushes the phase — the part that still varies — out of a truncated line.
 *
 * This is a context rather than a prop because the card sits four levels below
 * the view that knows the scope (view → board → column → sortable → card), and
 * threading a display flag through the drag-and-drop layers would put presentation
 * concerns into components that only handle movement.
 */
export const TaskScopeContext = React.createContext<string | null>(null);

/** The scoped project id, or null when the view spans every project. */
export function useTaskScope(): string | null {
  return React.useContext(TaskScopeContext);
}
