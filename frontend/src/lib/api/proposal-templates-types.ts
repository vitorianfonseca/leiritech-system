/**
 * Proposal-template domain types. Distinct from PROJECT templates (`templates.ts`).
 * Money is EUR cents; `taxRate`/`quantity` are serialized by the backend Numeric
 * (strings). The editor works in `LineItem` (numeric quantity) — map on load.
 */

import type { BillingType, CatalogUnit } from "./catalog-types";
import type { Totals } from "./proposal-content-types";

export interface TemplateSection {
  id: string;
  position: number;
  heading: string;
  body: string;
}

export interface TemplateItem {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  unit: CatalogUnit;
  unitPrice: number;
  taxRate: string;
  billingType: BillingType;
  quantity: string;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  description: string | null;
  defaultValidityDays: number | null;
  defaultDiscountBps: number;
  terms: string | null;
  sections: TemplateSection[];
  items: TemplateItem[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totals: Totals;
}

export interface TemplateSectionInput {
  heading: string;
  body: string;
}

export interface TemplateItemInput {
  catalogItemId?: string | null;
  name: string;
  unit: CatalogUnit;
  unitPrice: number;
  taxRate: string;
  billingType: BillingType;
  quantity: number;
}

export interface ProposalTemplateInput {
  name: string;
  description?: string | null;
  defaultValidityDays?: number | null;
  defaultDiscountBps: number;
  terms?: string | null;
  sections: TemplateSectionInput[];
  items: TemplateItemInput[];
}
