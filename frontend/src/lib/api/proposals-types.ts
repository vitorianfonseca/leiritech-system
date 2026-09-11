/**
 * Proposals API models (F6) — proposal metadata + PDF upload lifecycle.
 *
 * A proposal is metadata plus an attached PDF (there is NO in-app document
 * editor). The state machine tracks the buyer's engagement with the document
 * (WORKFLOW_SPEC §1.2): `draft → sent → viewed → accepted/rejected/expired`,
 * with `expired → sent` re-issuance. The backend (FastAPI) does not exist yet;
 * these types describe the contract the integration agent fulfils. UI code
 * depends only on these shapes, never on the mock implementation, so the impl
 * can be swapped without touching callers.
 *
 * Access (WORKFLOW_SPEC §3 / BR-002): proposals are Gestor+/Admin only — a
 * Membro has NO access (the route renders not-found). Financial gating (BR-008):
 * `valueCents` is null for any caller without finance access, mirroring the
 * opportunities client. Business rules enforced by the client:
 *   - BR-025: a proposal cannot be `sent` without a PDF, a value and a
 *     `validUntil` date (and the linked opportunity must not be lost).
 *   - BR-026: `accepted` / `rejected` are terminal — renegotiation needs a new
 *     proposal record; the old one is never mutated.
 *   - BR-027: proposals past `validUntil` while `sent` / `viewed` auto-transition
 *     to `expired` on read (AUTO-04; the real backend runs this as a cron).
 *   - BR-028: any non-accepted proposal (`draft` / `rejected` / `expired`) may be
 *     archived; an `accepted` proposal cannot (permanently linked to its
 *     project — BR-036 / H2).
 */

import type { Role } from "@/lib/session";

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

export type ProposalState =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired";

export const PROPOSAL_STATES: ProposalState[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
];

/* ------------------------------------------------------------------ *
 * Attached document (F17 — signed-URL mock; real R2 wiring is integration)
 * ------------------------------------------------------------------ */

export interface ProposalFile {
  /** Original file name, e.g. `proposta-adega-vale.pdf`. */
  name: string;
  /** File size in bytes (drives the human-readable size label). */
  sizeBytes: number;
  /** ISO-8601 datetime the file was attached. */
  uploadedAt: string;
  /**
   * Mock signed download URL. The integration agent replaces this with a real
   * short-lived R2 signed URL; the UI only ever renders it as a download link.
   */
  url: string;
}

/* ------------------------------------------------------------------ *
 * Core entity
 * ------------------------------------------------------------------ */

export interface Proposal {
  id: string;
  /** Human reference (mono), e.g. `PROP-2026-014`. */
  reference: string;
  /** Linked opportunity (F5) the proposal belongs to. */
  opportunityId: string;
  opportunityTitle: string;
  /** Whether the linked opportunity is lost — blocks `accepted` (§1.2). */
  opportunityLost: boolean;
  companyId: string;
  companyName: string;
  /** Optional recipient contact (F4). */
  contactId: string | null;
  contactName: string | null;
  /** Proposal value in cents (EUR). FINANCIAL — null without finance access (BR-008). */
  valueCents: number | null;
  state: ProposalState;
  /** Attached PDF, or null while none is uploaded. */
  file: ProposalFile | null;
  /** ISO date (yyyy-mm-dd) the proposal was created. */
  createdAt: string;
  /** ISO date the proposal was sent, or null while `draft`. */
  sentAt: string | null;
  /** ISO date the proposal is valid until, or null while not yet set. */
  validUntil: string | null;
  /** ISO date the recipient first viewed the proposal, or null. */
  viewedAt: string | null;
  /** ISO date a terminal decision (accepted / rejected) was recorded, or null. */
  decidedAt: string | null;
  /** Free-text internal notes. */
  notes: string | null;
  /** Rejection note (BR — captured when marking rejected). */
  rejectionNote: string | null;
  /** ISO date the proposal was archived, or null while active (BR-028 / BR-060). */
  archivedAt: string | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Derived helpers (UI reads these without recomputing the rules)
 * ------------------------------------------------------------------ */

/** `accepted` / `rejected` are terminal (BR-026). */
export function isTerminal(p: Proposal): boolean {
  return p.state === "accepted" || p.state === "rejected";
}

/** A proposal is "live" (awaiting a buyer decision) when sent or viewed. */
export function isLive(p: Proposal): boolean {
  return p.state === "sent" || p.state === "viewed";
}

/** Whether all BR-025 prerequisites for sending are met (PDF + value + validity). */
export function meetsSendRequirements(p: Proposal): boolean {
  return p.file != null && p.valueCents != null && p.validUntil != null;
}

/** Whether a `draft` proposal is ready to send (BR-025). */
export function canSend(p: Proposal): boolean {
  return p.state === "draft" && meetsSendRequirements(p);
}

/**
 * Whether the proposal may be archived (BR-028): any non-accepted state that is
 * not itself a live document (`sent` / `viewed` stay in the funnel). Accepted is
 * permanently linked to its project and never archivable.
 */
export function canArchive(p: Proposal): boolean {
  if (p.archivedAt) return false;
  return p.state === "draft" || p.state === "rejected" || p.state === "expired";
}

/** Whether a `sent` / `viewed` proposal is past its validity date (BR-027). */
export function isPastValidity(p: Proposal, today: Date = new Date()): boolean {
  if (!p.validUntil) return false;
  const due = new Date(`${p.validUntil}T23:59:59`);
  return due.getTime() < today.getTime();
}

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

/** Quick-create form (progressive): reference is generated server-side. */
export interface CreateProposalInput {
  opportunityId: string;
  contactId: string | null;
  /** Value in cents, or null when not yet known. */
  valueCents: number | null;
  /** ISO date the proposal is valid until, or null. */
  validUntil: string | null;
  notes: string | null;
}

/** PDF attachment to upload — the real `File`, transferred to R2 via the attachments API. */
export interface UploadPdfInput {
  file: File;
}

/** Mark rejected — a rejection note is mandatory (§1.2). */
export interface RejectProposalInput {
  note: string;
}

/** Reissue an expired proposal — a new validity date is mandatory (§1.2). */
export interface ResendProposalInput {
  validUntil: string;
}

/* ------------------------------------------------------------------ *
 * Access + errors
 * ------------------------------------------------------------------ */

export type ProposalErrorCode =
  | "not_found"
  | "forbidden"
  /** BR-025 — PDF + value + validity required before sending. */
  | "send_requirements_missing"
  /** Draft cannot be viewed/decided before being sent (§1.2). */
  | "draft_not_decidable"
  /** BR-026 — accepted is terminal and immutable. */
  | "accepted_locked"
  /** BR-028 — accepted proposal is linked to its project, not archivable. */
  | "accepted_not_archivable"
  /** Rejected cannot flip straight to accepted — reissue instead (§1.2). */
  | "rejected_not_acceptable"
  /** A rejection note is required. */
  | "reject_note_required"
  /** Linked opportunity is lost — cannot accept (§1.2). */
  | "opportunity_lost"
  /** Resend is only valid from `expired`. */
  | "not_expired"
  /** Resend requires a new validity date. */
  | "resend_validity_required"
  /** Generic illegal transition. */
  | "invalid_transition";

/**
 * Typed error thrown by the proposals client. `code` maps to an i18n key under
 * `proposals.errors.<code>` — the canonical pt-PT messages from WORKFLOW_SPEC
 * §1.2 live in the message catalogue, never hardcoded here.
 */
export class ProposalError extends Error {
  readonly code: ProposalErrorCode;
  constructor(code: ProposalErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ProposalError";
    this.code = code;
  }
}

/**
 * Whether a role may access proposals at all. Membro is blocked entirely
 * (BR-002) — the route renders not-found for them.
 */
export function canAccessProposals(role: Role): boolean {
  return role === "admin" || role === "gestor";
}
