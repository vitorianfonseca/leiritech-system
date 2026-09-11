/**
 * Shared money-parsing helper (H7, AUDIT_REPORT.md).
 *
 * `parseEuroToCents` used to be implemented independently in three feature
 * modules (pipeline, proposals, projects) with drifting behavior — notably
 * the projects copy returned `0` on unparsable input instead of `null`,
 * which let a malformed contracted-value string silently become €0.00
 * instead of failing validation. This is the single implementation; every
 * caller MUST treat `null` as "could not parse" and surface a validation
 * error, never coerce it to `0`.
 */

/**
 * Parse a `pt-PT`-style euro amount string (`"1.234,56"` or a plain
 * `"1234.56"`) into integer cents. Returns `null` — never `0` — when the
 * input is empty, whitespace-only, or not a finite number, so callers can
 * distinguish "no value" / "invalid value" from a genuine zero amount.
 */
export function parseEuroToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
