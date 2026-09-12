"use client";

import * as React from "react";

export const ACCENTS = ["rose", "blue", "violet", "green", "amber"] as const;
export type Accent = (typeof ACCENTS)[number];

export const ACCENT_STORAGE_KEY = "leiritech-accent";

/**
 * The accent theme, as a second axis to light/dark.
 *
 * It lives on `<html data-accent>` rather than in React state so the CSS in
 * globals.css can key off it directly, and so the inline script in the layout
 * can set it before first paint — a theme applied after hydration shows the
 * default for a frame, which is the flash every theming system has to avoid.
 *
 * Rose is the default and is defined on `:root`, so the attribute is removed
 * rather than set to "rose": the absence of a value is the default, the same
 * rule the URL state follows.
 */
export function useAccent(): [Accent, (next: Accent) => void] {
  const accent = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("accentchange", cb);
      return () => window.removeEventListener("accentchange", cb);
    },
    () => (document.documentElement.dataset.accent as Accent) || "rose",
    () => "rose" as Accent
  );

  const set = React.useCallback((next: Accent) => {
    if (next === "rose") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = next;
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      // Private windows and blocked site data: the choice still applies for
      // this session, it just will not be remembered.
    }
    window.dispatchEvent(new Event("accentchange"));
  }, []);

  return [accent, set];
}
