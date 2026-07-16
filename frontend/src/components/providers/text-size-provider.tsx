"use client";

import * as React from "react";
import { persistPref } from "@/lib/client-prefs";
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_COOKIE,
  parseTextSize,
  type TextSize,
} from "@/lib/text-size";

interface TextSizeContextValue {
  textSize: TextSize;
  setTextSize: (value: TextSize) => void;
}

const TextSizeContext = React.createContext<TextSizeContextValue | null>(null);

/**
 * Applies the persisted text-size preference app-wide. The server already sets
 * `data-text-size` on <html> from the cookie (no FOUC); this provider keeps the
 * React state in sync and updates the attribute live on change — no reload, the
 * CSS in globals.css does the scaling. Mirrors the theme/locale pattern.
 */
export function TextSizeProvider({
  initial = DEFAULT_TEXT_SIZE,
  children,
}: {
  initial?: TextSize;
  children: React.ReactNode;
}) {
  const [textSize, setTextSizeState] = React.useState<TextSize>(initial);

  const setTextSize = React.useCallback((value: TextSize) => {
    const next = parseTextSize(value);
    persistPref(TEXT_SIZE_COOKIE, next);
    document.documentElement.dataset.textSize = next;
    setTextSizeState(next);
  }, []);

  const value = React.useMemo(
    () => ({ textSize, setTextSize }),
    [textSize, setTextSize]
  );

  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>;
}

export function useTextSize(): TextSizeContextValue {
  const ctx = React.useContext(TextSizeContext);
  if (!ctx) {
    throw new Error("useTextSize must be used within a TextSizeProvider");
  }
  return ctx;
}
