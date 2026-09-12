import type * as React from "react";
import type { PipelineStageId } from "@/lib/api/opportunities-types";

export { formatEUR, formatDate } from "@/components/finance/finance-format";
export { parseEuroToCents } from "@/lib/currency";

/**
 * Column accent (F5). On brand (DESIGN.md "paper + ink + one flash of signal"),
 * buyer progress is expressed as an increasingly saturated signal top rule: early stages
 * are a faint signal, the final active stage (Negociação) reads full signal — the
 * deal literally warming toward the win. Uses ONLY the signal token (alpha ramp),
 * never a per-stage rainbow.
 */
export function stageAccentStyle(
  order: number,
  total: number
): React.CSSProperties {
  const ratio = total > 1 ? order / (total - 1) : 1;
  const alpha = 0.25 + ratio * 0.75; // 0.25 → 1.0
  return {
    backgroundColor: `color-mix(in oklch, var(--signal) ${Math.round(
      alpha * 100
    )}%, transparent)`,
  };
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** Stable stage order index for sorting. */
export function stageIndex(
  id: PipelineStageId,
  order: PipelineStageId[]
): number {
  const i = order.indexOf(id);
  return i === -1 ? order.length : i;
}
