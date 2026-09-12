"use client";

import * as React from "react";
import { accentFromHex, neutralTokens } from "./color";

export const ACCENTS = [
  "rose",
  "blue",
  "violet",
  "green",
  "amber",
  "slate",
  "sand",
  "olive",
  "plum",
] as const;
export type Accent = (typeof ACCENTS)[number] | "custom";

export const ACCENT_STORAGE_KEY = "leiritech-accent";
export const ACCENT_HEX_STORAGE_KEY = "leiritech-accent-hex";
export const DEFAULT_CUSTOM_HEX = "#6E7FD6";

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
 *
 * "custom" is different in kind. A named theme is a block of CSS; a custom one
 * is a hue the user chose, so its few tokens are written onto the element as
 * inline styles. Everything downstream — the chart ramp, the glass refraction,
 * the illustration — already derives from `--accent-hue`, so setting that one
 * variable carries the choice through the whole system.
 */
export function applyCustomAccent(hex: string): void {
  const { light, dark, hue } = accentFromHex(hex);
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const accent = isDark ? dark : light;
  root.style.setProperty("--accent-hue", String(hue));
  for (const token of ["--primary", "--ring", "--signal", "--sidebar-ring", "--sidebar-primary"]) {
    root.style.setProperty(token, accent);
  }
  root.style.setProperty(
    "--signal-muted",
    isDark ? `oklch(0.320 0.045 ${hue})` : `oklch(0.945 0.030 ${hue})`
  );
  // The illustration is a flat PNG whose accent sits near hue 340.
  root.style.setProperty("--brand-rotate", `${hue - 340}deg`);

  // The neutrals too. Without these only the details move and the page keeps
  // the default theme's tinted paper, which reads as the colour not applying.
  for (const [token, value] of Object.entries(neutralTokens(hue, isDark))) {
    root.style.setProperty(token, value);
  }
}

function clearCustomAccent(): void {
  const root = document.documentElement;
  const tokens = [
    "--accent-hue",
    "--primary",
    "--ring",
    "--signal",
    "--sidebar-ring",
    "--sidebar-primary",
    "--signal-muted",
    "--brand-rotate",
    ...Object.keys(neutralTokens(0, false)),
    ...Object.keys(neutralTokens(0, true)),
  ];
  for (const token of tokens) root.style.removeProperty(token);
}

export function useAccent(): {
  accent: Accent;
  customHex: string;
  setAccent: (next: Accent) => void;
  setCustomHex: (hex: string) => void;
} {
  const accent = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("accentchange", cb);
      return () => window.removeEventListener("accentchange", cb);
    },
    () => (document.documentElement.dataset.accent as Accent) || "rose",
    () => "rose" as Accent
  );

  const customHex = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("accentchange", cb);
      return () => window.removeEventListener("accentchange", cb);
    },
    () => {
      try {
        return window.localStorage.getItem(ACCENT_HEX_STORAGE_KEY) || DEFAULT_CUSTOM_HEX;
      } catch {
        return DEFAULT_CUSTOM_HEX;
      }
    },
    () => DEFAULT_CUSTOM_HEX
  );

  const store = React.useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private windows and blocked site data: the choice still applies for
      // this session, it just will not be remembered.
    }
  }, []);

  const setAccent = React.useCallback(
    (next: Accent) => {
      const root = document.documentElement;
      if (next === "custom") {
        root.dataset.accent = "custom";
        applyCustomAccent(customHex);
      } else {
        clearCustomAccent();
        if (next === "rose") delete root.dataset.accent;
        else root.dataset.accent = next;
      }
      store(ACCENT_STORAGE_KEY, next);
      window.dispatchEvent(new Event("accentchange"));
    },
    [customHex, store]
  );

  const setCustomHex = React.useCallback(
    (hex: string) => {
      document.documentElement.dataset.accent = "custom";
      applyCustomAccent(hex);
      store(ACCENT_HEX_STORAGE_KEY, hex);
      store(ACCENT_STORAGE_KEY, "custom");
      window.dispatchEvent(new Event("accentchange"));
    },
    [store]
  );

  return { accent, customHex, setAccent, setCustomHex };
}
