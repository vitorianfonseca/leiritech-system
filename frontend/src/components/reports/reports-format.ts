/**
 * Formatting helpers for the reports surface (F19). EUR + dates reuse the
 * finance formatters (single source of truth); hours + counts are added here.
 */

export {
  formatEUR,
  formatEURWhole,
  formatDate,
  formatPercent,
} from "@/components/finance/finance-format";

/** Format an hour figure with one decimal + the localized "h" unit. */
export function formatHours(hours: number, locale: string): string {
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(hours);
  return `${n} h`;
}

/** Format a plain integer count in the active locale. */
export function formatCount(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

/**
 * Compact number for chart axes — 6000 → "6k", 28000 → "28k", 1_250_000 →
 * "1,3M". Keeps money axes narrow and legible instead of clipping long figures.
 */
export function compactNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Format a ratio (0.42) as a whole-percent string ("42%"). */
export function formatRatio(ratio: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio);
}
