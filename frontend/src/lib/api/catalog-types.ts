/** Product/service catalog domain types. Money is EUR cents; `taxRate` is a
 * percentage string (e.g. "23.00") as serialized by the backend Numeric. */

export type CatalogUnit =
  | "unit"
  | "hour"
  | "day"
  | "month"
  | "m2"
  | "license"
  | "fixed";

export type BillingType = "one_time" | "monthly" | "annual";

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: CatalogUnit;
  unitPrice: number; // EUR cents
  taxRate: string; // percent, e.g. "23.00"
  billingType: BillingType;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemInput {
  name: string;
  description?: string | null;
  category?: string | null;
  unit: CatalogUnit;
  unitPrice: number;
  taxRate?: string;
  billingType: BillingType;
}

export interface CatalogListParams {
  q?: string;
  category?: string;
  billingType?: BillingType;
  includeArchived?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const CATALOG_UNITS: CatalogUnit[] = [
  "unit",
  "hour",
  "day",
  "month",
  "m2",
  "license",
  "fixed",
];

export const BILLING_TYPES: BillingType[] = ["one_time", "monthly", "annual"];
