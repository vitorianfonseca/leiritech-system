/**
 * Presentation helpers for the Projects feature (F8). Currency + date helpers
 * are re-exported from the finance formatters so amounts render identically
 * (cents in, "1.234,56 €" out) across the app.
 */

export {
  formatEUR,
  formatEURWhole,
  formatDate,
  formatPercent,
} from "@/components/finance/finance-format";
export { parseEuroToCents } from "@/lib/currency";

/** Two-letter initials for avatar fallbacks. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Progress-bar tone by completion (visual reinforcement, never colour-only). */
export function progressTone(progress: number): "signal" | "success" | "primary" {
  if (progress >= 100) return "success";
  if (progress >= 60) return "signal";
  return "primary";
}
