/**
 * Shared types for structured proposal content (sections + priced line items)
 * and totals, used by BOTH proposal templates and proposals. Money is EUR
 * cents; `taxRate` is a percent string (e.g. "23.00").
 *
 * `computeTotals` is a CLIENT MIRROR of the backend `proposal_totals.py` — same
 * rules (per-line rounding half-up, discount on net before tax, grouped by
 * billing type) so the editor can show live totals without a round-trip. The
 * server remains the source of truth that persists `proposals.value`.
 */

import type { BillingType, CatalogUnit } from "./catalog-types";

export interface SectionData {
  heading: string;
  body: string;
}

export interface LineItem {
  catalogItemId: string | null;
  name: string;
  unit: CatalogUnit;
  unitPrice: number; // EUR cents
  taxRate: string; // percent, e.g. "23.00"
  billingType: BillingType;
  quantity: number;
}

export interface GroupTotal {
  net: number;
  tax: number;
  gross: number;
}

export interface Totals {
  oneTime: GroupTotal;
  monthly: GroupTotal;
  annual: GroupTotal;
  value: number;
}

const EMPTY: GroupTotal = { net: 0, tax: 0, gross: 0 };

/** Mirror of backend `compute_totals`. `discountBps` in basis points. */
export function computeTotals(lines: LineItem[], discountBps = 0): Totals {
  const factor = (10000 - discountBps) / 10000;
  const buckets: Record<BillingType, { net: number; tax: number }> = {
    one_time: { net: 0, tax: 0 },
    monthly: { net: 0, tax: 0 },
    annual: { net: 0, tax: 0 },
  };
  for (const line of lines) {
    const rawNet = line.quantity * line.unitPrice;
    const net = Math.round(rawNet * factor);
    const rate = Number(line.taxRate.replace(",", ".")) || 0;
    const tax = Math.round((net * rate) / 100);
    const bucket = buckets[line.billingType];
    if (!bucket) continue;
    bucket.net += net;
    bucket.tax += tax;
  }
  const group = (b: { net: number; tax: number }): GroupTotal => ({
    net: b.net,
    tax: b.tax,
    gross: b.net + b.tax,
  });
  const oneTime = group(buckets.one_time);
  return {
    oneTime,
    monthly: group(buckets.monthly),
    annual: group(buckets.annual),
    value: oneTime.net,
  };
}

export const EMPTY_TOTALS: Totals = {
  oneTime: EMPTY,
  monthly: EMPTY,
  annual: EMPTY,
  value: 0,
};

/** A proposal's persisted structured content (as returned by the backend). */
export interface ContentSection {
  id: string;
  position: number;
  heading: string;
  body: string;
}

export interface ContentItem {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  unit: LineItem["unit"];
  unitPrice: number;
  taxRate: string;
  billingType: BillingType;
  quantity: string;
}

export interface ProposalContent {
  discountBps: number;
  terms: string | null;
  sections: ContentSection[];
  items: ContentItem[];
  totals: Totals;
}

/** Payload to replace a draft proposal's content. */
export interface ProposalContentInput {
  discountBps: number;
  terms: string | null;
  sections: SectionData[];
  items: LineItem[];
}

/** Map persisted content items to the editor's numeric-quantity LineItem. */
export function contentItemsToLines(items: ContentItem[]): LineItem[] {
  return items.map((it) => ({
    catalogItemId: it.catalogItemId,
    name: it.name,
    unit: it.unit,
    unitPrice: it.unitPrice,
    taxRate: it.taxRate,
    billingType: it.billingType,
    quantity: Number(String(it.quantity).replace(",", ".")) || 0,
  }));
}
