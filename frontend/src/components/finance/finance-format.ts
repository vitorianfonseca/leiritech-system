/**
 * Formatting helpers for the finance surfaces (F14).
 *
 * EUR is rendered `pt-PT` style (`1.234,56 €`) and dates `dd/mm/yyyy`, per
 * DESIGN.md. Amounts are stored in cents; these helpers take cents. Pass the
 * active locale (from next-intl `useLocale()`) so the same components render
 * correctly under any resolved locale.
 */

/** Format a cents amount as a localized EUR currency string. */
export function formatEUR(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Format a cents amount as EUR without decimals (for large headline tiles). */
export function formatEURWhole(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Format an ISO date (yyyy-mm-dd) as dd/mm/yyyy. */
export function formatDate(iso: string | null, fallback = "—"): string {
  if (!iso) return fallback;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Format a signed percentage from a ratio (0.42 → "42%"). */
export function formatPercent(ratio: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio);
}
