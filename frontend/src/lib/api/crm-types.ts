/**
 * CRM API models (F4) — companies, contacts, interactions and the typed
 * cross-feature references rendered on a company's relationship tabs.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * Scoping (BR-002): a Membro only sees companies/contacts tied to projects they
 * are a member of. Financial fields (BR-008): `totalContractedCents`, payment
 * milestones and opportunity/proposal values are stripped for any user without
 * finance access. "Cliente ativo" (BR-038) is a DERIVED flag — never stored —
 * true when the company has ≥1 active/won relationship. Companies are only ever
 * archived, never hard-deleted (BR-060), and archiving is blocked while a live
 * project, open opportunity or unconverted won opportunity exists (BR-062/H6).
 */

import type { Role } from "@/lib/session";

/** Company lifecycle state (setor-agnostic). `arquivada` is read-only (BR-061). */
export type CompanyStatus =
  | "potencial"
  | "ativo"
  | "inativo"
  | "parceiro"
  | "arquivada";

export const COMPANY_STATUSES: CompanyStatus[] = [
  "potencial",
  "ativo",
  "inativo",
  "parceiro",
  "arquivada",
];

/** Where the relationship originated (origem). */
export type CompanySource =
  | "referral"
  | "inbound"
  | "outbound"
  | "event"
  | "partner"
  | "other";

export const COMPANY_SOURCES: CompanySource[] = [
  "referral",
  "inbound",
  "outbound",
  "event",
  "partner",
  "other",
];

/** Contact lifecycle state. */
export type ContactStatus = "active" | "inactive";

/** Interaction kinds (WORKFLOW_SPEC §14): chamada/reunião/email/mensagem/nota/follow-up. */
export type InteractionType =
  | "call"
  | "meeting"
  | "email"
  | "message"
  | "note"
  | "follow_up";

export const INTERACTION_TYPES: InteractionType[] = [
  "call",
  "meeting",
  "email",
  "message",
  "note",
  "follow_up",
];

/* ------------------------------------------------------------------ *
 * Core entities
 * ------------------------------------------------------------------ */

export interface CompanySummary {
  id: string;
  name: string;
  /** Mock logo URL — never fetched in the mock phase; UI falls back to initials. */
  logoUrl: string | null;
  status: CompanyStatus;
  sector: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ownerId: string;
  ownerName: string;
  source: CompanySource;
  /** ISO-8601 date of the last logged interaction, or null. */
  lastInteractionAt: string | null;
  /** Human next-step description + ISO date, or null. */
  nextAction: string | null;
  nextActionAt: string | null;
  /** Derived "cliente ativo" flag (BR-038) — never persisted. */
  clienteAtivo: boolean;
  openOpportunities: number;
  activeProjects: number;
  /**
   * Total contracted across the company's projects, in cents (EUR). FINANCIAL —
   * null for any user without finance access (BR-008).
   */
  totalContractedCents: number | null;
  notesCount: number;
  attachmentsCount: number;
  /** ISO date the company was archived, or null while active (BR-060/061). */
  archivedAt: string | null;
}

export interface Contact {
  id: string;
  name: string;
  photoUrl: string | null;
  /** cargo */
  role: string | null;
  email: string | null;
  phone: string | null;
  /** Company website (drives the "open website" quick action). */
  website: string | null;
  companyId: string;
  companyName: string;
  ownerId: string;
  ownerName: string;
  notes: string | null;
  lastInteractionAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  status: ContactStatus;
  archivedAt: string | null;
}

/** An interaction logged against a company (and optionally a contact/opp/project). */
export interface Interaction {
  id: string;
  companyId: string;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  type: InteractionType;
  subject: string;
  body: string | null;
  /** ISO-8601 datetime the interaction occurred. */
  occurredAt: string;
  authorId: string;
  authorName: string;
}

/* ------------------------------------------------------------------ *
 * Typed cross-feature references (rendered read-only on the tabs).
 * These features may not exist yet; the tabs link to the canonical route
 * where one exists (see crmRoutes / dashboard recordRoutes) and otherwise
 * render a tasteful placeholder — never a dead link.
 * ------------------------------------------------------------------ */

export type OpportunityStage =
  | "qualification"
  | "discovery"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export interface OpportunityRef {
  id: string;
  title: string;
  stage: OpportunityStage;
  /** Whether it counts as "open" (not won/lost) — feeds BR-062. */
  open: boolean;
  /** Won but not yet converted to a project — blocks archive (BR-062/H6). */
  wonUnconverted: boolean;
  /** FINANCIAL — null without finance access (BR-008). */
  valueCents: number | null;
  nextAction: string | null;
}

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface ProposalRef {
  id: string;
  title: string;
  status: ProposalStatus;
  /** FINANCIAL — null without finance access (BR-008). */
  valueCents: number | null;
  validUntil: string | null;
}

export type ProjectRefStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled"
  | "archived";

export type ProjectHealth = "healthy" | "attention" | "at_risk";

export interface ProjectRef {
  id: string;
  name: string;
  status: ProjectRefStatus;
  health: ProjectHealth;
  /** 0–100 completion. */
  progress: number;
  /** Whether it counts as a live project (planning/active/on_hold) — feeds BR-062. */
  live: boolean;
}

export interface MeetingRef {
  id: string;
  title: string;
  /** ISO-8601 datetime. */
  scheduledAt: string;
  attendees: string[];
  location: string | null;
}

export interface FileRef {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  uploadedByName: string;
}

/** FINANCIAL payment reference (reuses finance milestone shape) — gated (BR-008). */
export interface PaymentRef {
  id: string;
  description: string;
  projectName: string;
  amountCents: number;
  receivedAmountCents: number;
  status:
    | "planned"
    | "invoiced"
    | "partially_paid"
    | "paid"
    | "overdue"
    | "cancelled";
  expectedDate: string;
}

/** Full relationship view for a single company. */
export interface CompanyDetail extends CompanySummary {
  description: string | null;
  contacts: Contact[];
  opportunities: OpportunityRef[];
  proposals: ProposalRef[];
  projects: ProjectRef[];
  meetings: MeetingRef[];
  files: FileRef[];
  /** FINANCIAL — empty for any user without finance access (BR-008). */
  payments: PaymentRef[];
  /** Whether the caller may see financial surfaces (drives the Pagamentos tab). */
  canSeeFinancials: boolean;
}

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

export interface CompanyInput {
  name: string;
  status: CompanyStatus;
  sector: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ownerId: string;
  source: CompanySource;
  description: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
}

export interface ContactInput {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  companyId: string;
  ownerId: string;
  status: ContactStatus;
  notes: string | null;
}

export interface InteractionInput {
  companyId: string;
  contactId: string | null;
  opportunityId: string | null;
  projectId: string | null;
  type: InteractionType;
  subject: string;
  body: string | null;
  occurredAt: string;
  authorId: string;
}

/* ------------------------------------------------------------------ *
 * Access + errors
 * ------------------------------------------------------------------ */

/** A single reason a company cannot be archived (BR-062). */
export interface ArchiveBlocker {
  kind: "liveProject" | "openOpportunity" | "wonUnconvertedOpportunity";
  label: string;
}

export type CrmErrorCode = "not_found" | "forbidden" | "archive_blocked" | "network";

/**
 * Typed error thrown by the CRM client. `code` maps to an i18n key. When
 * `code === "archive_blocked"`, `blockers` lists the offending records so the
 * UI can tell the user exactly what to resolve first (BR-062).
 */
export class CrmError extends Error {
  readonly code: CrmErrorCode;
  readonly blockers: ArchiveBlocker[];
  constructor(code: CrmErrorCode, blockers: ArchiveBlocker[] = [], message?: string) {
    super(message ?? code);
    this.name = "CrmError";
    this.code = code;
    this.blockers = blockers;
  }
}

/**
 * Whether a Membro's view is scoped to their own project relationships
 * (BR-002). Managers and admins see the full book.
 */
export function isScopedCrm(role: Role): boolean {
  return role === "membro";
}
