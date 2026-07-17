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
import { http, HttpError } from "@/lib/api/http";
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
  type LostReason,
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
    {
      // Verbal close (BR-035 fallback) — won WITHOUT an accepted proposal, so the
      // conversion wizard must require the contracted value to be entered by hand.
      id: "o-10",
      title: "Manutenção anual — Metalúrgica Norte",
      companyId: "c-3",
      companyName: "Metalúrgica Norte",
      ownerId: "dev-gestor",
      valueCents: null,
      stageId: "negotiation",
      outcome: "won",
      nextAction: null,
      nextActionAt: null,
      proposalSentReached: false,
      wonAt: isoDate(-2),
      converted: false,
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

/**
 * Write methods return the record with financial fields stripped (BR-008): the
 * caller can't safely re-gate a response, and every write is followed by a gated
 * read (invalidate/refetch) that restores the value for authorised users. This
 * closes the latent typed-contract hazard of a write emitting ungated financials.
 */
function presentAfterWrite(rec: OpportunityRecord): Opportunity {
  return present(rec, false);
}

function assertAccess(role: Role): void {
  if (!canAccessPipeline(role)) throw new OpportunityError("forbidden");
}

/* ------------------------------------------------------------------ *
 * Backend wiring (integration issue #57)
 *
 * The backend is the single source of truth. A deal's stage is a
 * pipeline_stages FK (uuid); the frontend `Opportunity.stageId` is the stage
 * CODE (PipelineStageId). We load /pipeline-stages once and resolve uuid→code on
 * read and code→uuid on write, so the board (which renders /pipeline-stages
 * dynamically) and every opportunity read/write agree on the same taxonomy.
 * ------------------------------------------------------------------ */

interface BackendPipelineStage {
  id: string;
  name: string;
  code: string;
  color: string | null;
  orderIndex: number;
  winProbability: number | null;
}

interface BackendOpportunity {
  id: string;
  title: string;
  companyId: string | null;
  primaryContactId: string | null;
  ownerId: string | null;
  stageId: string | null;
  estimatedValue: number | null;
  probability: number | null;
  expectedCloseDate: string | null;
  source: string | null;
  description: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  outcome: "open" | "won" | "lost";
  lostReason: string | null;
  lostAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StageMaps {
  byId: Map<string, PipelineStageId>;
  byCode: Map<PipelineStageId, string>;
}

let stageMapsCache: StageMaps | null = null;

function buildStageMaps(rows: BackendPipelineStage[]): StageMaps {
  const byId = new Map<string, PipelineStageId>();
  const byCode = new Map<PipelineStageId, string>();
  for (const r of rows) {
    byId.set(r.id, r.code as PipelineStageId);
    byCode.set(r.code as PipelineStageId, r.id);
  }
  return { byId, byCode };
}

/** Load + cache the #57 stage uuid↔code maps for the module lifetime. */
async function loadStageMaps(): Promise<StageMaps> {
  if (stageMapsCache) return stageMapsCache;
  const rows = await http.get<BackendPipelineStage[]>("/pipeline-stages");
  stageMapsCache = buildStageMaps(rows);
  return stageMapsCache;
}

const PROPOSAL_SENT_INDEX = PIPELINE_STAGE_IDS.indexOf("proposal_sent");

function mapOpportunity(
  be: BackendOpportunity,
  byId: Map<string, PipelineStageId>,
  canFinance: boolean
): Opportunity {
  const stageCode: PipelineStageId =
    (be.stageId ? byId.get(be.stageId) : undefined) ?? "new_contact";
  return {
    id: be.id,
    title: be.title,
    companyId: be.companyId ?? "",
    // INTEGRATION-GAP: companyName — not returned by the opportunities endpoint
    companyName: "",
    ownerId: be.ownerId ?? "",
    // INTEGRATION-GAP: ownerName — not returned by the opportunities endpoint
    ownerName: "",
    valueCents: canFinance ? be.estimatedValue ?? null : null,
    probability: be.probability ?? 0,
    // #57: resolve dynamic stage uuid → frontend PipelineStageId code.
    stageId: stageCode,
    // Backend outcome "open" → frontend null; won/lost pass through.
    outcome: be.outcome === "open" ? null : be.outcome,
    nextAction: be.nextAction ?? null,
    nextActionAt: be.nextActionDue ?? null,
    // INTEGRATION-GAP: proposalSentReached — not persisted by backend; derived
    // from the current stage's order relative to `proposal_sent`.
    proposalSentReached:
      PIPELINE_STAGE_IDS.indexOf(stageCode) >= PROPOSAL_SENT_INDEX,
    lostReason: (be.lostReason as LostReason | null) ?? null,
    // INTEGRATION-GAP: lostReasonNote — backend stores a single lost_reason field
    lostReasonNote: null,
    lostAt: be.lostAt ? be.lostAt.slice(0, 10) : null,
    // INTEGRATION-GAP: wonAt — backend has no won_at column
    wonAt: null,
    // INTEGRATION-GAP: converted/projectId — not exposed by the opportunities
    // endpoint; the link is created server-side by POST /projects/from-opportunity
    converted: false,
    projectId: null,
    createdAt: be.createdAt,
    updatedAt: be.updatedAt,
  };
}

function translateOpportunityError(err: unknown): OpportunityError {
  if (err instanceof OpportunityError) return err;
  if (err instanceof HttpError) {
    if (err.status === 404) return new OpportunityError("not_found");
    if (err.status === 403) return new OpportunityError("forbidden");
    return new OpportunityError("invalid_transition", err.message);
  }
  return new OpportunityError("invalid_transition");
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
  /**
   * Link a won opportunity to the project it was converted into (#31, BR-036).
   * Idempotent-ish: throws if the opportunity is not won or already converted so
   * the wizard can guard the entry point.
   */
  markConverted(id: string, projectId: string, actorId: string): Promise<Opportunity>;
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
  // WIRED → GET /pipeline-stages. The board renders these dynamically; we also
  // warm the #57 stage uuid↔code cache from the same payload.
  async getPipelineStages() {
    const rows = await http.get<BackendPipelineStage[]>("/pipeline-stages");
    stageMapsCache = buildStageMaps(rows);
    return [...rows]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((r) => ({
        id: r.code as PipelineStageId,
        order: r.orderIndex,
        winProbability: r.winProbability ?? 0,
      }));
  },

  // WIRED → GET /opportunities. Access is scoped server-side; the client-side
  // pipeline gate (BR-002) is preserved so a Membro never issues the call.
  async listOpportunities(role, _userId, paymentsGrant) {
    assertAccess(role);
    try {
      const [maps, page] = await Promise.all([
        loadStageMaps(),
        http.get<{ items: BackendOpportunity[] }>("/opportunities", {
          query: { page_size: 100 },
        }),
      ]);
      const canFinance = canAccessFinance(role, paymentsGrant);
      return page.items.map((o) => mapOpportunity(o, maps.byId, canFinance));
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // WIRED → GET /opportunities/{id}
  async getOpportunity(id, role, _userId, paymentsGrant) {
    assertAccess(role);
    try {
      const [maps, be] = await Promise.all([
        loadStageMaps(),
        http.get<BackendOpportunity>(`/opportunities/${id}`),
      ]);
      return mapOpportunity(be, maps.byId, canAccessFinance(role, paymentsGrant));
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // WIRED → POST /opportunities/{id}/move. próxima-ação (BR-010) guarded client
  // side to preserve the typed error code; stage code → uuid for the payload.
  async moveOpportunity(id, input, actorId) {
    void actorId;
    if (!input.nextAction.trim()) throw new OpportunityError("next_action_required");
    try {
      const maps = await loadStageMaps();
      const stageUuid = maps.byCode.get(input.toStageId);
      if (!stageUuid) throw new OpportunityError("invalid_transition");
      const be = await http.post<BackendOpportunity>(`/opportunities/${id}/move`, {
        stageId: stageUuid,
        nextAction: input.nextAction.trim(),
        nextActionDue: input.nextActionAt,
      });
      // BR-008: write responses are finance-stripped; a gated refetch restores value.
      return mapOpportunity(be, maps.byId, false);
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // WIRED → POST /opportunities/{id}/win
  async winOpportunity(id, actorId) {
    void actorId;
    try {
      const maps = await loadStageMaps();
      const be = await http.post<BackendOpportunity>(`/opportunities/${id}/win`, {});
      const opportunity = mapOpportunity(be, maps.byId, false);
      return {
        opportunity,
        // INTEGRATION-GAP: companyActivated — backend does not report it; a win
        // activates the company by definition (BR-038).
        companyActivated: true,
        companyId: opportunity.companyId,
        // INTEGRATION-GAP: companyName — not returned by the opportunities endpoint
        companyName: opportunity.companyName,
      };
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // INTEGRATION-GAP: no dedicated backend endpoint to persist the opportunity→
  // project link — the real link is created server-side by POST
  // /projects/from-opportunity. We validate against the live opportunity and
  // reflect the link locally so the conversion wizard guard behaves.
  async markConverted(id, projectId, actorId) {
    void actorId;
    try {
      const maps = await loadStageMaps();
      const be = await http.get<BackendOpportunity>(`/opportunities/${id}`);
      const opp = mapOpportunity(be, maps.byId, false);
      if (opp.outcome !== "won") throw new OpportunityError("invalid_transition");
      return { ...opp, converted: true, projectId };
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // WIRED → POST /opportunities/{id}/lose. lost-reason (BR-011) guarded client
  // side to preserve the typed error code.
  async loseOpportunity(id, input, actorId) {
    void actorId;
    if (!input.reason) throw new OpportunityError("lost_reason_required");
    try {
      const maps = await loadStageMaps();
      // INTEGRATION-GAP: input.note is dropped — backend accepts a single
      // lost_reason string with no separate note field.
      const be = await http.post<BackendOpportunity>(`/opportunities/${id}/lose`, {
        lostReason: input.reason,
      });
      return mapOpportunity(be, maps.byId, false);
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // LEFT-ON-MOCK: no backend endpoint — win/lose are terminal (BR-013) and no
  // reopen route exists. Body unchanged.
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
    return presentAfterWrite(rec);
  },

  // WIRED → POST /opportunities. Stage code → uuid; probability defaults server
  // side from the stage. próxima-ação (BR-010) guarded client side.
  async createOpportunity(input, actorId, canFinance) {
    void actorId;
    if (!input.nextAction.trim()) throw new OpportunityError("next_action_required");
    try {
      const maps = await loadStageMaps();
      const stageUuid = maps.byCode.get(input.stageId);
      const be = await http.post<BackendOpportunity>("/opportunities", {
        title: input.title.trim(),
        companyId: input.companyId,
        ownerId: input.ownerId,
        stageId: stageUuid,
        estimatedValue: input.valueCents,
        nextAction: input.nextAction.trim(),
        nextActionDue: input.nextActionAt,
      });
      return mapOpportunity(be, maps.byId, canFinance);
    } catch (err) {
      throw translateOpportunityError(err);
    }
  },

  // WIRED → PATCH /opportunities/{id}. Probability is admin-tunable (BR-020).
  async updateProbability(id, probability, actorId) {
    void actorId;
    try {
      const maps = await loadStageMaps();
      const clamped = Math.max(0, Math.min(100, Math.round(probability)));
      const be = await http.patch<BackendOpportunity>(`/opportunities/${id}`, {
        probability: clamped,
      });
      return mapOpportunity(be, maps.byId, false);
    } catch (err) {
      throw translateOpportunityError(err);
    }
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
