/**
 * Commercial pipeline API models (F5) — opportunities, buyer-progress stages
 * and the won/lost outcome flows.
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes,
 * never on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * Access (WORKFLOW_SPEC §3 / BR-002): the pipeline and opportunities are
 * Gestor+/Admin only — a Membro has NO access (the route renders not-found).
 * Financial gating (BR-008): `valueCents` is null for any caller without
 * finance access. The opportunity state machine lives in WORKFLOW_SPEC §1.1:
 * moves between active stages require a próxima ação (BR-010); marking lost
 * requires a reason (BR-011); won is terminal (BR-013); probability is a
 * per-stage attribute, admin-tunable, never a transition gate (BR-020).
 */

import type { Role } from "@/lib/session";

/* ------------------------------------------------------------------ *
 * Stages (buyer-progress) + terminal outcomes
 * ------------------------------------------------------------------ */

/**
 * Ordered, buyer-progress pipeline stages (WORKFLOW_SPEC §1.1). These are the
 * canonical MVP set; the real backend stores them as admin-configurable rows in
 * `pipeline_stages` (BR-012), which is why the board renders them from
 * `getPipelineStages()` rather than hardcoding.
 */
export type PipelineStageId =
  | "new_contact"
  | "qualification"
  | "meeting_scheduled"
  | "proposal_drafting"
  | "proposal_sent"
  | "negotiation";

export const PIPELINE_STAGE_IDS: PipelineStageId[] = [
  "new_contact",
  "qualification",
  "meeting_scheduled",
  "proposal_drafting",
  "proposal_sent",
  "negotiation",
];

/** Terminal outcome states — NOT draggable Kanban columns (WORKFLOW_SPEC §1.1). */
export type OpportunityOutcome = "won" | "lost";

/**
 * A configured pipeline stage. `winProbability` is the stage default (BR-020)
 * used to seed a new opportunity's probability; the label is resolved from i18n
 * (`pipeline.stages.<id>`), never stored, so the tree stays translatable.
 */
export interface PipelineStage {
  id: PipelineStageId;
  order: number;
  /** Default win probability for the stage, 0–100 (BR-020). */
  winProbability: number;
}

/* ------------------------------------------------------------------ *
 * Lost reasons (BR-011) — reason code drives pipeline tuning
 * ------------------------------------------------------------------ */

export type LostReason =
  | "budget"
  | "timing"
  | "competitor"
  | "no_response"
  | "scope_mismatch"
  | "internal_decision"
  | "other";

export const LOST_REASONS: LostReason[] = [
  "budget",
  "timing",
  "competitor",
  "no_response",
  "scope_mismatch",
  "internal_decision",
  "other",
];

/* ------------------------------------------------------------------ *
 * Core entity
 * ------------------------------------------------------------------ */

export interface Opportunity {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  ownerId: string;
  ownerName: string;
  /** Deal value in cents (EUR). FINANCIAL — null without finance access (BR-008). */
  valueCents: number | null;
  /** Current win probability 0–100 (BR-020) — starts from the stage default. */
  probability: number;
  /** Active buyer-progress stage. Meaningful while `outcome` is null. */
  stageId: PipelineStageId;
  /** null while open; set once the deal reaches a terminal outcome. */
  outcome: OpportunityOutcome | null;
  /** Próxima ação (BR-010) — mandatory for every open opportunity. */
  nextAction: string | null;
  /** ISO date (yyyy-mm-dd) the próxima ação is due, or null. */
  nextActionAt: string | null;
  /** Whether `proposal_sent` was ever reached (soft-warning on skipped-to-won). */
  proposalSentReached: boolean;
  /** Loss metadata (BR-011) — populated only when `outcome === "lost"`. */
  lostReason: LostReason | null;
  lostReasonNote: string | null;
  /** ISO date the opportunity was marked lost. */
  lostAt: string | null;
  /** ISO date the opportunity was marked won. */
  wonAt: string | null;
  /** Whether a won opportunity has been converted to a project (#31). */
  converted: boolean;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Derived helpers the UI reads without recomputing. */
export function isOpen(o: Opportunity): boolean {
  return o.outcome === null;
}

/** Whether the próxima ação is overdue (due date strictly before today). */
export function isNextActionOverdue(o: Opportunity, today: Date = new Date()): boolean {
  if (!o.nextActionAt) return false;
  const due = new Date(`${o.nextActionAt}T23:59:59`);
  return due.getTime() < today.getTime();
}

/* ------------------------------------------------------------------ *
 * Mutation inputs
 * ------------------------------------------------------------------ */

/** Move to another active stage — requires/updates the próxima ação (BR-010). */
export interface MoveOpportunityInput {
  toStageId: PipelineStageId;
  nextAction: string;
  nextActionAt: string | null;
}

/** Mark lost — reason is mandatory (BR-011); note optional. */
export interface LoseOpportunityInput {
  reason: LostReason;
  note: string | null;
}

/** Reopen a lost opportunity into an active stage (WORKFLOW_SPEC §1.1). */
export interface ReopenOpportunityInput {
  toStageId: PipelineStageId;
  note: string;
}

/** Quick-create form (PRD §31, progressive). */
export interface CreateOpportunityInput {
  title: string;
  companyId: string;
  /** Display name of the chosen company (resolved from the combobox label). */
  companyName: string;
  ownerId: string;
  /** Value in cents, or null when not yet known. */
  valueCents: number | null;
  stageId: PipelineStageId;
  nextAction: string;
  nextActionAt: string | null;
}

/** Result of a win — the UI reacts to whether the company was activated (BR-038). */
export interface WinOpportunityResult {
  opportunity: Opportunity;
  /** Whether the linked company was flipped to "cliente ativo" (BR-038). */
  companyActivated: boolean;
  companyId: string;
  companyName: string;
}

/* ------------------------------------------------------------------ *
 * Access + errors
 * ------------------------------------------------------------------ */

export type OpportunityErrorCode =
  | "not_found"
  | "forbidden"
  | "next_action_required"
  | "lost_reason_required"
  | "invalid_transition";

/**
 * Typed error thrown by the opportunities client. `code` maps to an i18n key
 * under `pipeline.errors`.
 */
export class OpportunityError extends Error {
  readonly code: OpportunityErrorCode;
  constructor(code: OpportunityErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OpportunityError";
    this.code = code;
  }
}

/**
 * Whether a role may access the pipeline / opportunities at all. Membro is
 * blocked entirely (BR-002) — the route renders not-found for them.
 */
export function canAccessPipeline(role: Role): boolean {
  return role === "admin" || role === "gestor";
}
