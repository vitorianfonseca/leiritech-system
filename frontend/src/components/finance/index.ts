/**
 * Finance component library (F14, GATED + FINANCIAL).
 *
 * Reusable across /finance and the projects Financeiro tab (#32). Everything
 * consumes DESIGN.md tokens, is fully i18n'd (next-intl `finance.*`), meets
 * WCAG AA, and uses strictly NON-fiscal terminology — "marco de pagamento",
 * never "fatura" (BR-070/072).
 *
 * Access is gated upstream via `canAccessFinance` / `canManageFinance`
 * (see `@/lib/api/finance-types`). Financial data is invisible to Membro.
 */

export { FinancialStatTiles } from "./financial-stat-tiles";
export type { FinancialStatTilesProps } from "./financial-stat-tiles";

export { MarginCard } from "./margin-card";
export type { MarginCardProps } from "./margin-card";

export { PaymentMilestoneTable } from "./payment-milestone-table";
export type { PaymentMilestoneTableProps } from "./payment-milestone-table";

export { ProjectCostsPanel } from "./project-costs-panel";
export type { ProjectCostsPanelProps } from "./project-costs-panel";

export { MilestoneFormDialog } from "./milestone-form-dialog";
export type { MilestoneFormDialogProps } from "./milestone-form-dialog";

export { RecordPaymentDialog } from "./record-payment-dialog";
export type { RecordPaymentDialogProps } from "./record-payment-dialog";

export { ProjectCostDialog } from "./project-cost-dialog";
export type { ProjectCostDialogProps } from "./project-cost-dialog";

export {
  StatusBadge,
  UrgencyHint,
  milestoneUrgency,
  DUE_SOON_DAYS,
} from "./milestone-status";
export type { Urgency } from "./milestone-status";

export {
  formatEUR,
  formatEURWhole,
  formatDate,
  formatPercent,
} from "./finance-format";
