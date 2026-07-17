/**
 * Taxonomy reconciliation between the backend enums and the frontend type
 * contracts (integration issue #57).
 *
 * Resolution summary (see the integration report):
 *  - Opportunities: the backend is the SINGLE source of truth. Each deal carries
 *    a dynamic `stageId` (FK → pipeline_stages, whose `code` now matches the
 *    frontend `PipelineStageId` spec set) plus an `outcome` of open|won|lost.
 *    The stale fixed CRM stage enum is derived from those two fields here, so
 *    the CRM company tab and the pipeline board never diverge again.
 *  - "cliente ativo" (BR-038): NOT derived on the client. It is the backend's
 *    server-computed `is_active_client` flag → `clienteAtivo`. One authority.
 *  - Company/contact/interaction enums: backend uses English codes; a couple of
 *    frontend contracts use Portuguese/underscored variants — mapped below.
 */

import type {
  CompanyStatus,
  ContactStatus,
  InteractionType,
  OpportunityStage,
} from "./crm-types";

/* --------------------------- Company status ---------------------------- */
// Backend COMPANY_STATUSES = potential|active|inactive|partner (+ archived_at).
const COMPANY_STATUS_FROM_BACKEND: Record<string, CompanyStatus> = {
  potential: "potencial",
  active: "ativo",
  inactive: "inativo",
  partner: "parceiro",
  archived: "arquivada",
};
const COMPANY_STATUS_TO_BACKEND: Record<CompanyStatus, string> = {
  potencial: "potential",
  ativo: "active",
  inativo: "inactive",
  parceiro: "partner",
  arquivada: "archived",
};

/** Map a backend company status (+ archived flag) to the frontend enum. */
export function companyStatusFromBackend(
  status: string,
  archivedAt: string | null,
): CompanyStatus {
  if (archivedAt) return "arquivada";
  return COMPANY_STATUS_FROM_BACKEND[status] ?? "potencial";
}

export function companyStatusToBackend(status: CompanyStatus): string {
  return COMPANY_STATUS_TO_BACKEND[status] ?? "potential";
}

/* --------------------------- Contact status ---------------------------- */
export function contactStatusFromBackend(status: string): ContactStatus {
  return status === "inactive" ? "inactive" : "active";
}

/* -------------------------- Interaction type --------------------------- */
// Backend uses "followup"; the frontend contract uses "follow_up".
export function interactionTypeFromBackend(type: string): InteractionType {
  return type === "followup" ? "follow_up" : (type as InteractionType);
}
export function interactionTypeToBackend(type: InteractionType): string {
  return type === "follow_up" ? "followup" : type;
}

/* --------------------------- Opportunity ------------------------------- */
export type BackendOutcome = "open" | "won" | "lost";

/**
 * Derive the stale CRM `OpportunityStage` enum from the backend outcome + the
 * dynamic stage code. Won/lost are terminal; otherwise the open deal is bucketed
 * by its pipeline stage code.
 */
export function crmOpportunityStage(
  outcome: string,
  stageCode: string | null,
): OpportunityStage {
  if (outcome === "won") return "won";
  if (outcome === "lost") return "lost";
  switch (stageCode) {
    case "new_contact":
    case "qualification":
      return "qualification";
    case "meeting_scheduled":
      return "discovery";
    case "proposal_drafting":
    case "proposal_sent":
      return "proposal";
    case "negotiation":
      return "negotiation";
    default:
      return "qualification";
  }
}

/** Whether a deal counts as "open" (feeds archive-blocking BR-062). */
export function isOpenOutcome(outcome: string): boolean {
  return outcome === "open";
}
