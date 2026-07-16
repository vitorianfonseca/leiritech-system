/**
 * Commercial pipeline API client — MOCK implementation (F5).
 *
 * Backend is not wired yet. This module exports a typed `opportunitiesApi`
 * whose methods return promises exactly as the real HTTP client will. The
 * integration agent replaces the bodies with real `fetch` calls WITHOUT
 * changing the signatures; UI code (via TanStack Query) depends only on the
 * `OpportunitiesApi` interface.
 *
 * The client enforces access (BR-002 — Membro has no pipeline access),
 * financial gating (BR-008 — value stripped without finance access) and the
 * opportunity state machine (WORKFLOW_SPEC §1.1): moves require a próxima ação
 * (BR-010), lost requires a reason (BR-011), won is terminal (BR-013),
 * probability is admin-tunable and never a gate (BR-020). Every mutation writes
 * an activity-log entry so the opportunity detail feed reflects reality.
 */

import { subDays } from "date-fns";
import type { Role } from "@/lib/session";
import { canAccessFinance } from "@/lib/api/finance-types";
import {
  collaborationApi,
  type CollaborationApi,
} from "@/lib/api/collaboration";
import type {
  ActivityLog,
  Comment,
  CreateCommentInput,
  DirectoryUser,
  UpdateCommentInput,
} from "@/lib/api/collaboration-types";
import {
  OpportunityError,
  PIPELINE_STAGE_IDS,
  canAccessPipeline,
  type CreateOpportunityInput,
  type LoseOpportunityInput,
  type MoveOpportunityInput,
  type Opportunity,
  type PipelineStage,
  type PipelineStageId,
  type ReopenOpportunityInput,
  type WinOpportunityResult,
} from "./opportunities-types";

const MOCK_LATENCY_MS = 340;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const pipelineRoutes = {
  board: () => "/crm/pipeline",
  opportunity: (id: string) => `/crm/opportunities/${id}`,
  /** Conversion flow (#31) — may not exist yet; callers guard the link. */
  convert: (id: string) => `/crm/opportunities/${id}/convert`,
} as const;

/* ------------------------------------------------------------------ *
 * Owners + actors (aligned with the CRM + session dev users)
 * ------------------------------------------------------------------ */

const OWNERS: Record<string, string> = {
  "dev-admin": "Rita Andrade",
  "dev-gestor": "Bruno Salgado",
  "u-diogo": "Diogo Ferreira",
  "u-sofia": "Sofia Marques",
};
function ownerName(id: string): string {
  return OWNERS[id] ?? id;
}

export const PIPELINE_OWNERS: { id: string; name: string }[] = Object.entries(
  OWNERS
).map(([id, name]) => ({ id, name }));

const ACTORS: Record<string, DirectoryUser> = {
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@aurea.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@aurea.pt", avatarUrl: null },
  "u-diogo": { id: "u-diogo", name: "Diogo Ferreira", email: "diogo@aurea.pt", avatarUrl: null },
  "u-sofia": { id: "u-sofia", name: "Sofia Marques", email: "sofia@aurea.pt", avatarUrl: null },
};
function actor(id: string): DirectoryUser {
  return ACTORS[id] ?? { id, name: ownerName(id), email: "", avatarUrl: null };
}

/* ------------------------------------------------------------------ *
 * Stage config (admin-configurable rows — BR-012; win probability — BR-020)
 * ------------------------------------------------------------------ */

const STAGE_PROBABILITY: Record<PipelineStageId, number> = {
  new_contact: 10,
  qualification: 25,
  meeting_scheduled: 40,
  proposal_drafting: 55,
  proposal_sent: 70,
  negotiation: 85,
};

const STAGES: PipelineStage[] = PIPELINE_STAGE_IDS.map((id, i) => ({
  id,
  order: i + 1,
  winProbability: STAGE_PROBABILITY[id],
}));

function stageOrder(id: PipelineStageId): number {
  return STAGES.findIndex((s) => s.id === id);
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

type OpportunityRecord = Opportunity;

const opportunities: Map<string, OpportunityRecord> = new Map();
/** Live activity log, keyed by opportunity id (newest pushed last). */
const activityByOpp: Map<string, ActivityLog[]> = new Map();

function isoDate(offsetDays: number): string {
  return subDays(new Date(), -offsetDays).toISOString().slice(0, 10);
}

function pushActivity(
  oppId: string,
  actorId: string,
  action: ActivityLog["action"],
  extra: Partial<ActivityLog> = {}
): void {
  const list = activityByOpp.get(oppId) ?? [];
  list.push({
    id: uid("oa"),
    entityType: "opportunity",
    entityId: oppId,
    actor: actor(actorId),
    action,
    before: null,
    after: null,
    createdAt: new Date().toISOString(),
    ...extra,
  });
  activityByOpp.set(oppId, list);
}

function seed(): void {
  if (opportunities.size > 0) return;

  const now = new Date();
  const rows: Array<
    Pick<
      Opportunity,
      | "id"
      | "title"
      | "companyId"
      | "companyName"
      | "ownerId"
      | "valueCents"
      | "stageId"
      | "outcome"
      | "nextAction"
      | "nextActionAt"
      | "proposalSentReached"
    > &
      Partial<Opportunity>
  > = [
    {
      id: "o-1",
      title: "Rebranding + Manual de marca",
      companyId: "c-1",
      companyName: "Adega Vale",
      ownerId: "dev-gestor",
      valueCents: 34_000_00,
      stageId: "proposal_sent",
      outcome: null,
      nextAction: "Follow-up à proposta enviada",
      nextActionAt: isoDate(2),
      proposalSentReached: true,
    },
    {
      id: "o-2",
      title: "App Fidelização — Lumina",
      companyId: "c-2",
      companyName: "Lumina Retail",
      ownerId: "u-sofia",
      valueCents: 48_000_00,
      stageId: "proposal_drafting",
      outcome: null,
      nextAction: "Enviar proposta até sexta",
      nextActionAt: isoDate(4),
      proposalSentReached: false,
    },
    {
      id: "o-3",
      title: "Portal Interno — Lumina",
      companyId: "c-2",
      companyName: "Lumina Retail",
      ownerId: "dev-gestor",
      valueCents: 62_000_00,
      stageId: "negotiation",
      outcome: null,
      nextAction: "Agendar reunião de fecho",
      nextActionAt: isoDate(1),
      proposalSentReached: true,
    },
    {
      id: "o-4",
      title: "Portal B2B — Metalúrgica Norte",
      companyId: "c-3",
      companyName: "Metalúrgica Norte",
      ownerId: "u-diogo",
      valueCents: 71_000_00,
      stageId: "qualification",
      outcome: null,
      nextAction: "Qualificar orçamento e decisor",
      nextActionAt: isoDate(3),
      proposalSentReached: false,
    },
    {
      id: "o-5",
      title: "Website + Reservas — Solar do Douro",
      companyId: "c-4",
      companyName: "Solar do Douro",
      ownerId: "u-sofia",
      valueCents: 21_000_00,
      stageId: "meeting_scheduled",
      outcome: null,
      nextAction: "Preparar guião da reunião",
      nextActionAt: isoDate(-1), // overdue — exercises the alarm treatment
      proposalSentReached: false,
    },
    {
      id: "o-6",
      title: "Identidade visual — Estúdio Aurora",
      companyId: "c-5",
      companyName: "Estúdio Aurora",
      ownerId: "dev-gestor",
      valueCents: 12_000_00,
      stageId: "new_contact",
      outcome: null,
      nextAction: "Enviar email de primeiro contacto",
      nextActionAt: isoDate(0),
      proposalSentReached: false,
    },
    {
      id: "o-7",
      title: "Plataforma de reservas — Clínica Sévora",
      companyId: "c-6",
      companyName: "Clínica Sévora",
      ownerId: "u-diogo",
      valueCents: 39_000_00,
      stageId: "new_contact",
      outcome: null,
      // Intentionally missing próxima ação → highlighted on the board (BR-010).
      nextAction: null,
      nextActionAt: null,
      proposalSentReached: false,
    },
    {
      id: "o-8",
      title: "Loja online — Verdejar Bio",
      companyId: "c-7",
      companyName: "Verdejar Bio",
      ownerId: "dev-gestor",
      valueCents: 27_000_00,
      stageId: "negotiation",
      outcome: "won",
      nextAction: null,
      nextActionAt: null,
      proposalSentReached: true,
      wonAt: isoDate(-6),
      converted: false,
    },
    {
      id: "o-9",
      title: "Microsite institucional — Câmara de Alvorada",
      companyId: "c-8",
      companyName: "Câmara de Alvorada",
      ownerId: "u-sofia",
      valueCents: 18_000_00,
      stageId: "proposal_sent",
      outcome: "lost",
      nextAction: null,
      nextActionAt: null,
      proposalSentReached: true,
      lostReason: "budget",
      lostReasonNote: "Orçamento público adiado para o próximo ano fiscal.",
      lostAt: isoDate(-10),
    },
  ];

  for (const row of rows) {
    const rec: OpportunityRecord = {
      ownerName: ownerName(row.ownerId),
      probability: STAGE_PROBABILITY[row.stageId],
      lostReason: null,
      lostReasonNote: null,
      lostAt: null,
      wonAt: null,
      converted: false,
      projectId: null,
      createdAt: subDays(now, 20).toISOString(),
      updatedAt: subDays(now, 2).toISOString(),
      ...row,
    };
    opportunities.set(rec.id, rec);
    activityByOpp.set(rec.id, [
      {
        id: `${rec.id}-a1`,
        entityType: "opportunity",
        entityId: rec.id,
        actor: actor(rec.ownerId),
        action: "created",
        createdAt: subDays(now, 20).toISOString(),
      },
    ]);
  }
}

/* ------------------------------------------------------------------ *
 * Serialization (finance gating — BR-008)
 * ------------------------------------------------------------------ */

function present(rec: OpportunityRecord, canFinance: boolean): Opportunity {
  return {
    ...rec,
    ownerName: ownerName(rec.ownerId),
    valueCents: canFinance ? rec.valueCents : null,
  };
}

function assertAccess(role: Role): void {
  if (!canAccessPipeline(role)) throw new OpportunityError("forbidden");
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface OpportunitiesApi {
  getPipelineStages(): Promise<PipelineStage[]>;
  listOpportunities(
    role: Role,
    userId: string,
    paymentsGrant: boolean
  ): Promise<Opportunity[]>;
  getOpportunity(
    id: string,
    role: Role,
    userId: string,
    paymentsGrant: boolean
  ): Promise<Opportunity>;
  moveOpportunity(
    id: string,
    input: MoveOpportunityInput,
    actorId: string
  ): Promise<Opportunity>;
  winOpportunity(id: string, actorId: string): Promise<WinOpportunityResult>;
  loseOpportunity(
    id: string,
    input: LoseOpportunityInput,
    actorId: string
  ): Promise<Opportunity>;
  reopenOpportunity(
    id: string,
    input: ReopenOpportunityInput,
    actorId: string
  ): Promise<Opportunity>;
  createOpportunity(
    input: CreateOpportunityInput,
    actorId: string,
    canFinance: boolean
  ): Promise<Opportunity>;
  /** Admin-tunable probability (BR-020) — never a gate. */
  updateProbability(
    id: string,
    probability: number,
    actorId: string
  ): Promise<Opportunity>;
}

export const opportunitiesApi: OpportunitiesApi = {
  async getPipelineStages() {
    await delay(MOCK_LATENCY_MS);
    return STAGES.map((s) => ({ ...s }));
  },

  async listOpportunities(role, _userId, paymentsGrant) {
    seed();
    await delay(MOCK_LATENCY_MS);
    assertAccess(role);
    const canFinance = canAccessFinance(role, paymentsGrant);
    return [...opportunities.values()].map((r) => present(r, canFinance));
  },

  async getOpportunity(id, role, _userId, paymentsGrant) {
    seed();
    await delay(MOCK_LATENCY_MS);
    assertAccess(role);
    const rec = opportunities.get(id);
    if (!rec) throw new OpportunityError("not_found");
    return present(rec, canAccessFinance(role, paymentsGrant));
  },

  async moveOpportunity(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = opportunities.get(id);
    if (!rec) throw new OpportunityError("not_found");
    if (rec.outcome !== null) throw new OpportunityError("invalid_transition");
    if (!input.nextAction.trim()) throw new OpportunityError("next_action_required");

    const fromStage = rec.stageId;
    if (fromStage !== input.toStageId) {
      pushActivity(id, actorId, "status_changed", {
        field: "stage",
        before: fromStage,
        after: input.toStageId,
      });
    }
    rec.stageId = input.toStageId;
    rec.nextAction = input.nextAction.trim();
    rec.nextActionAt = input.nextActionAt;
    if (stageOrder(input.toStageId) >= stageOrder("proposal_sent")) {
      rec.proposalSentReached = true;
    }
    rec.updatedAt = new Date().toISOString();
    return present(rec, true);
  },

  async winOpportunity(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = opportunities.get(id);
    if (!rec) throw new OpportunityError("not_found");
    if (rec.outcome === "won") throw new OpportunityError("invalid_transition");
    if (rec.outcome === "lost") throw new OpportunityError("invalid_transition");

    rec.outcome = "won";
    rec.wonAt = new Date().toISOString().slice(0, 10);
    rec.nextAction = null;
    rec.nextActionAt = null;
    rec.probability = 100;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "outcome", after: "won" });

    // "Cliente ativo" is a DERIVED flag (BR-038) — a won deal makes the company
    // active by definition. The CRM read recomputes it; nothing is persisted here.
    return {
      opportunity: present(rec, true),
      companyActivated: true,
      companyId: rec.companyId,
      companyName: rec.companyName,
    };
  },

  async loseOpportunity(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = opportunities.get(id);
    if (!rec) throw new OpportunityError("not_found");
    if (rec.outcome === "won") throw new OpportunityError("invalid_transition");
    if (!input.reason) throw new OpportunityError("lost_reason_required");

    rec.outcome = "lost";
    rec.lostReason = input.reason;
    rec.lostReasonNote = input.note?.trim() ? input.note.trim() : null;
    rec.lostAt = new Date().toISOString().slice(0, 10);
    rec.nextAction = null;
    rec.nextActionAt = null;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "outcome", after: "lost" });
    return present(rec, true);
  },

  async reopenOpportunity(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = opportunities.get(id);
    if (!rec) throw new OpportunityError("not_found");
    if (rec.outcome !== "lost") throw new OpportunityError("invalid_transition");

    rec.outcome = null;
    rec.stageId = input.toStageId;
    rec.lostReason = null;
    rec.lostReasonNote = null;
    rec.lostAt = null;
    rec.nextAction = input.note.trim() || rec.nextAction;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "restored", { field: "outcome", before: "lost" });
    return present(rec, true);
  },

  async createOpportunity(input, actorId, canFinance) {
    seed();
    await delay(MOCK_LATENCY_MS);
    if (!input.nextAction.trim()) throw new OpportunityError("next_action_required");

    const id = uid("o");
    const rec: OpportunityRecord = {
      id,
      title: input.title.trim(),
      companyId: input.companyId,
      companyName: input.companyName || input.companyId,
      ownerId: input.ownerId,
      ownerName: ownerName(input.ownerId),
      valueCents: input.valueCents,
      probability: STAGE_PROBABILITY[input.stageId],
      stageId: input.stageId,
      outcome: null,
      nextAction: input.nextAction.trim(),
      nextActionAt: input.nextActionAt,
      proposalSentReached:
        stageOrder(input.stageId) >= stageOrder("proposal_sent"),
      lostReason: null,
      lostReasonNote: null,
      lostAt: null,
      wonAt: null,
      converted: false,
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    opportunities.set(id, rec);
    pushActivity(id, actorId, "created");
    return present(rec, canFinance);
  },

  async updateProbability(id, probability, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = opportunities.get(id);
    if (!rec) throw new OpportunityError("not_found");
    const clamped = Math.max(0, Math.min(100, Math.round(probability)));
    const before = rec.probability;
    rec.probability = clamped;
    rec.updatedAt = new Date().toISOString();
    if (before !== clamped) {
      pushActivity(id, actorId, "updated", {
        field: "probability",
        before: String(before),
        after: String(clamped),
      });
    }
    return present(rec, true);
  },
};

/* ------------------------------------------------------------------ *
 * Collaboration API for the opportunity detail feed (#40). Delegates comments
 * to the shared collaboration store and merges in the live opportunity activity
 * so moves / wins / losses appear in the timeline.
 * ------------------------------------------------------------------ */

export const opportunityCollaborationApi: CollaborationApi = {
  listDirectory: () => collaborationApi.listDirectory(),
  listComments: (t, id) => collaborationApi.listComments(t, id),
  createComment: (input: CreateCommentInput) => collaborationApi.createComment(input),
  updateComment: (input: UpdateCommentInput) => collaborationApi.updateComment(input),
  deleteComment: (id, requesterId) => collaborationApi.deleteComment(id, requesterId),
  restoreComment: (comment: Comment) => collaborationApi.restoreComment(comment),
  async listActivity(entityType, entityId) {
    const live = await collaborationApi.listActivity(entityType, entityId);
    if (entityType !== "opportunity") return live;
    seed();
    const seeded = activityByOpp.get(entityId) ?? [];
    return [...seeded, ...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
