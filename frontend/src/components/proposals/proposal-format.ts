import type { ComponentProps } from "react";
import type { Badge } from "@/components/ui/badge";
import type { ProposalState } from "@/lib/api/proposals-types";

export { formatEUR, formatDate } from "@/components/finance/finance-format";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

/**
 * Proposal state → Badge variant (DESIGN.md status zones; never invented
 * colours). The lifecycle reads as: draft is neutral, sent is informational,
 * viewed is the gold "engaged" moment, accepted is success, rejected is the
 * alarm/destructive zone, expired is the faded "done"/receded treatment.
 * Colour is always paired with an icon + label (WCAG AA — never colour alone).
 */
export const PROPOSAL_STATE_VARIANT: Record<ProposalState, BadgeVariant> = {
  draft: "default",
  sent: "info",
  viewed: "gold",
  accepted: "success",
  rejected: "destructive",
  expired: "done",
};

/** Parse a `1.234,56` / `1234.56` value string (EUR) to cents, or null. */
export function parseEuroToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Human-readable file size (1.2 MB / 842 KB) using the active locale. */
export function formatFileSize(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)} ${units[unit]}`;
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}
