/**
 * UI text-size preference (server-safe module — no "use client").
 *
 * Modelled exactly like the theme/locale prefs: a `text-size` cookie mirrored to
 * localStorage, applied app-wide through a `data-text-size` attribute on <html>
 * that scales the root font-size (see globals.css). Because every Tailwind size
 * is rem-based, scaling the root font scales the whole UI proportionally.
 */
export const TEXT_SIZE_COOKIE = "text-size";

export const TEXT_SIZES = ["compact", "normal", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const DEFAULT_TEXT_SIZE: TextSize = "normal";

export function parseTextSize(value: string | undefined | null): TextSize {
  return TEXT_SIZES.includes(value as TextSize) ? (value as TextSize) : DEFAULT_TEXT_SIZE;
}
