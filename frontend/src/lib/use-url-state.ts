"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

/**
 * A piece of UI state that survives a refresh, because it lives in the URL.
 *
 * Which tab is open, which view mode is picked — all of it was React state, so
 * reloading a page you were working on dropped you back at the default. The
 * URL is the right home for it: it survives refresh and restore-session, the
 * back button does what it looks like it does, and a link someone pastes into
 * chat opens where they were rather than at the top.
 *
 * Writes go through `window.history`, which Next integrates with its router —
 * `useSearchParams` sees the change without a server round-trip, so switching
 * a tab stays instant. `push` is the default: a tab switch is a place you can
 * go back from. Pass `replace` for state that is a refinement rather than a
 * destination (a filter, a view mode), so Back leaves the page instead of
 * walking through every toggle.
 *
 * An unrecognised value in the URL falls back to the default rather than
 * rendering an empty surface — links get edited, and old links outlive the
 * values they name.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  options?: { valid?: readonly T[]; history?: "push" | "replace" }
): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const { valid, history = "push" } = options ?? {};

  const raw = searchParams.get(key);
  const value: T = raw !== null && (!valid || (valid as readonly string[]).includes(raw))
    ? (raw as T)
    : fallback;

  const set = React.useCallback(
    (next: T) => {
      const params = new URLSearchParams(window.location.search);
      // The default is the absence of the parameter, so a URL only carries
      // what was actually chosen.
      if (next === fallback) params.delete(key);
      else params.set(key, next);
      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
      if (history === "replace") window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [key, fallback, history]
  );

  return [value, set];
}
