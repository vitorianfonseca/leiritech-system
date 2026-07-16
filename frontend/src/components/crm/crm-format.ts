/**
 * Formatting helpers for the CRM surfaces (F4). EUR/date helpers are reused
 * from the finance module (single source of truth: `1.234,56 €`, `dd/mm/yyyy`).
 */
export { formatEUR, formatEURWhole, formatDate } from "@/components/finance/finance-format";

/** Format an ISO datetime as `dd/mm/yyyy HH:mm` using the active locale. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}
