/**
 * Proposals API client — MOCK implementation (F6).
 *
 * Backend is not wired yet. This module exports a typed `proposalsApi` whose
 * methods return promises exactly as the real HTTP client will. The integration
 * agent replaces the bodies with real `fetch` calls (and real R2 signed URLs for
 * uploads) WITHOUT changing the signatures; UI code (via TanStack Query) depends
 * only on the `ProposalsApi` interface.
 *
 * The client enforces access (BR-002 — Membro has no proposals access), finance
 * gating (BR-008 — value stripped without finance access) and the proposal state
 * machine (WORKFLOW_SPEC §1.2): send requires PDF + value + validity (BR-025);
 * accepted/rejected are terminal (BR-026); past-validity live proposals
 * auto-expire on read (BR-027); accepted proposals cannot be archived (BR-028).
 * Every mutation writes an activity-log entry so the detail feed reflects reality.
 */

import { addDays, format, startOfDay, subDays } from "date-fns";
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
  ProposalError,
  canAccessProposals,
  isPastValidity,
  meetsSendRequirements,
  type CreateProposalInput,
  type Proposal,
  type ProposalState,
  type RejectProposalInput,
  type ResendProposalInput,
  type UploadPdfInput,
} from "./proposals-types";

const MOCK_LATENCY_MS = 360;
/** Max upload size accepted by the mock (10 MB), mirroring the planned backend. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
}

function today(): string {
  return format(startOfDay(new Date()), "yyyy-MM-dd");
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const proposalRoutes = {
  list: () => "/crm/proposals",
  detail: (id: string) => `/crm/proposals/${id}`,
} as const;

/* ------------------------------------------------------------------ *
 * Actors (aligned with the CRM + pipeline dev users)
 * ------------------------------------------------------------------ */

const ACTORS: Record<string, DirectoryUser> = {
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@aurea.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@aurea.pt", avatarUrl: null },
  "u-diogo": { id: "u-diogo", name: "Diogo Ferreira", email: "diogo@aurea.pt", avatarUrl: null },
  "u-sofia": { id: "u-sofia", name: "Sofia Marques", email: "sofia@aurea.pt", avatarUrl: null },
};
function actor(id: string): DirectoryUser {
  return ACTORS[id] ?? { id, name: id, email: "", avatarUrl: null };
}

/** Mock signed download URL for an attachment (real R2 signing is integration). */
function mockSignedUrl(proposalId: string, fileName: string): string {
  const sig = Math.random().toString(36).slice(2, 10);
  return `https://mock.r2.aurea.pt/proposals/${proposalId}/${encodeURIComponent(
    fileName
  )}?sig=${sig}`;
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

type ProposalRecord = Proposal;

const proposals: Map<string, ProposalRecord> = new Map();
/** Live activity log, keyed by proposal id (newest pushed last). */
const activityByProposal: Map<string, ActivityLog[]> = new Map();

function pushActivity(
  proposalId: string,
  actorId: string,
  action: ActivityLog["action"],
  extra: Partial<ActivityLog> = {}
): void {
  const list = activityByProposal.get(proposalId) ?? [];
  list.push({
    id: uid("pa"),
    entityType: "proposal",
    entityId: proposalId,
    actor: actor(actorId),
    action,
    before: null,
    after: null,
    createdAt: new Date().toISOString(),
    ...extra,
  });
  activityByProposal.set(proposalId, list);
}

function seed(): void {
  if (proposals.size > 0) return;

  const rows: Array<
    Pick<
      Proposal,
      | "id"
      | "reference"
      | "opportunityId"
      | "opportunityTitle"
      | "companyId"
      | "companyName"
      | "state"
      | "valueCents"
    > &
      Partial<Proposal>
  > = [
    {
      id: "p-1",
      reference: "PROP-2026-001",
      opportunityId: "o-1",
      opportunityTitle: "Rebranding + Manual de marca",
      companyId: "c-1",
      companyName: "Adega Vale",
      contactId: "ct-1",
      contactName: "Helena Vaz",
      state: "sent",
      valueCents: 34_000_00,
      sentAt: isoDate(-4),
      validUntil: isoDate(10),
      file: {
        name: "proposta-adega-vale-rebranding.pdf",
        sizeBytes: 842_140,
        uploadedAt: subDays(new Date(), 4).toISOString(),
        url: mockSignedUrl("p-1", "proposta-adega-vale-rebranding.pdf"),
      },
      notes: "Enviada após reunião de apresentação. Aguardar feedback do sócio-gerente.",
    },
    {
      id: "p-2",
      reference: "PROP-2026-002",
      opportunityId: "o-3",
      opportunityTitle: "Portal Interno — Lumina",
      companyId: "c-2",
      companyName: "Lumina Retail",
      contactId: "ct-2",
      contactName: "Rui Sampaio",
      state: "viewed",
      valueCents: 62_000_00,
      sentAt: isoDate(-8),
      validUntil: isoDate(6),
      viewedAt: isoDate(-6),
      file: {
        name: "proposta-lumina-portal-interno.pdf",
        sizeBytes: 1_284_552,
        uploadedAt: subDays(new Date(), 8).toISOString(),
        url: mockSignedUrl("p-2", "proposta-lumina-portal-interno.pdf"),
      },
      notes: "Cliente abriu duas vezes. Negociação de fecho agendada.",
    },
    {
      id: "p-3",
      reference: "PROP-2026-003",
      opportunityId: "o-2",
      opportunityTitle: "App Fidelização — Lumina",
      companyId: "c-2",
      companyName: "Lumina Retail",
      contactId: "ct-2",
      contactName: "Rui Sampaio",
      state: "draft",
      valueCents: 48_000_00,
      validUntil: isoDate(21),
      // Draft with value + validity but NO PDF yet → send is blocked (BR-025),
      // exercises the "requirements missing" guard on the detail page.
      file: null,
      notes: "A finalizar o PDF com o roadmap de fidelização.",
    },
    {
      id: "p-4",
      reference: "PROP-2026-004",
      opportunityId: "o-8",
      opportunityTitle: "Loja online — Verdejar Bio",
      companyId: "c-7",
      companyName: "Verdejar Bio",
      contactId: null,
      contactName: null,
      state: "accepted",
      valueCents: 27_000_00,
      sentAt: isoDate(-20),
      validUntil: isoDate(-6),
      viewedAt: isoDate(-18),
      decidedAt: isoDate(-12),
      file: {
        name: "proposta-verdejar-loja-online.pdf",
        sizeBytes: 968_004,
        uploadedAt: subDays(new Date(), 20).toISOString(),
        url: mockSignedUrl("p-4", "proposta-verdejar-loja-online.pdf"),
      },
      notes: "Aceite — deu origem ao projeto da loja online.",
    },
    {
      id: "p-5",
      reference: "PROP-2026-005",
      opportunityId: "o-9",
      opportunityTitle: "Microsite institucional — Câmara de Alvorada",
      companyId: "c-8",
      companyName: "Câmara de Alvorada",
      contactId: null,
      contactName: null,
      state: "rejected",
      valueCents: 18_000_00,
      sentAt: isoDate(-25),
      validUntil: isoDate(-10),
      viewedAt: isoDate(-24),
      decidedAt: isoDate(-15),
      rejectionNote: "Orçamento público adiado para o próximo ano fiscal.",
      file: {
        name: "proposta-camara-alvorada-microsite.pdf",
        sizeBytes: 512_880,
        uploadedAt: subDays(new Date(), 25).toISOString(),
        url: mockSignedUrl("p-5", "proposta-camara-alvorada-microsite.pdf"),
      },
    },
    {
      id: "p-6",
      reference: "PROP-2026-006",
      opportunityId: "o-4",
      opportunityTitle: "Portal B2B — Metalúrgica Norte",
      companyId: "c-3",
      companyName: "Metalúrgica Norte",
      contactId: null,
      contactName: null,
      // Seeded as `sent` with a validity ALREADY in the past → auto-expires to
      // `expired` on first read (BR-027 / AUTO-04), exercising the reissue flow.
      state: "sent",
      valueCents: 71_000_00,
      sentAt: isoDate(-40),
      validUntil: isoDate(-2),
      file: {
        name: "proposta-metalurgica-norte-b2b.pdf",
        sizeBytes: 1_640_220,
        uploadedAt: subDays(new Date(), 40).toISOString(),
        url: mockSignedUrl("p-6", "proposta-metalurgica-norte-b2b.pdf"),
      },
      notes: "Sem resposta dentro da validade. Considerar reenviar com nova data.",
    },
  ];

  for (const row of rows) {
    const rec: ProposalRecord = {
      opportunityLost: row.opportunityId === "o-9", // o-9 is a lost opportunity
      contactId: null,
      contactName: null,
      file: null,
      sentAt: null,
      validUntil: null,
      viewedAt: null,
      decidedAt: null,
      notes: null,
      rejectionNote: null,
      archivedAt: null,
      createdAt: subDays(new Date(), 30).toISOString(),
      updatedAt: subDays(new Date(), 5).toISOString(),
      ...row,
    };
    proposals.set(rec.id, rec);
    activityByProposal.set(rec.id, [
      {
        id: `${rec.id}-a1`,
        entityType: "proposal",
        entityId: rec.id,
        actor: actor("dev-gestor"),
        action: "created",
        createdAt: rec.createdAt,
      },
    ]);
  }
}

/* ------------------------------------------------------------------ *
 * Auto-expire on read (BR-027 / AUTO-04). The real backend runs this as a cron;
 * here we lazily transition live proposals whose validity has passed whenever
 * they are read, so the UI never shows an over-validity "sent" proposal.
 * ------------------------------------------------------------------ */

function applyAutoExpire(rec: ProposalRecord): void {
  if ((rec.state === "sent" || rec.state === "viewed") && isPastValidity(rec)) {
    rec.state = "expired";
    rec.updatedAt = new Date().toISOString();
    pushActivity(rec.id, "system", "status_changed", {
      field: "state",
      after: "expired",
    });
  }
}

/* ------------------------------------------------------------------ *
 * Serialization (finance gating — BR-008)
 * ------------------------------------------------------------------ */

function present(rec: ProposalRecord, canFinance: boolean): Proposal {
  return { ...rec, valueCents: canFinance ? rec.valueCents : null };
}

function assertAccess(role: Role): void {
  if (!canAccessProposals(role)) throw new ProposalError("forbidden");
}

function get(id: string): ProposalRecord {
  const rec = proposals.get(id);
  if (!rec) throw new ProposalError("not_found");
  return rec;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface ListProposalsParams {
  role: Role;
  userId: string;
  paymentsGrant: boolean;
  /** Include archived proposals (default false — BR-060). */
  includeArchived?: boolean;
}

export interface ProposalsApi {
  listProposals(params: ListProposalsParams): Promise<Proposal[]>;
  getProposal(
    id: string,
    role: Role,
    userId: string,
    paymentsGrant: boolean
  ): Promise<Proposal>;
  createProposal(
    input: CreateProposalInput,
    actorId: string,
    canFinance: boolean
  ): Promise<Proposal>;
  /** Attach / replace the PDF (draft only). */
  uploadPdf(id: string, input: UploadPdfInput, actorId: string): Promise<Proposal>;
  /** Remove the attached PDF (draft only). */
  removePdf(id: string, actorId: string): Promise<Proposal>;
  /** draft → sent (BR-025 guard). */
  sendProposal(id: string, actorId: string): Promise<Proposal>;
  /** sent → viewed (manual "marcar como visualizada"). */
  markViewed(id: string, actorId: string): Promise<Proposal>;
  /** sent/viewed → accepted (BR-026 terminal). */
  acceptProposal(id: string, actorId: string): Promise<Proposal>;
  /** sent/viewed → rejected (note required, BR-026 terminal). */
  rejectProposal(
    id: string,
    input: RejectProposalInput,
    actorId: string
  ): Promise<Proposal>;
  /** sent/viewed → expired (manual). */
  expireProposal(id: string, actorId: string): Promise<Proposal>;
  /** expired → sent (new validity, §1.2 reissue). */
  resendProposal(
    id: string,
    input: ResendProposalInput,
    actorId: string
  ): Promise<Proposal>;
  /** Archive a non-accepted proposal (BR-028). */
  archiveProposal(id: string, actorId: string): Promise<void>;
  restoreProposal(id: string, actorId: string): Promise<void>;
}

export const proposalsApi: ProposalsApi = {
  async listProposals({ role, userId, paymentsGrant, includeArchived = false }) {
    seed();
    await delay(MOCK_LATENCY_MS);
    assertAccess(role);
    void userId;
    const canFinance = canAccessFinance(role, paymentsGrant);
    return [...proposals.values()]
      .map((rec) => {
        applyAutoExpire(rec);
        return rec;
      })
      .filter((rec) => (includeArchived ? true : rec.archivedAt === null))
      .map((rec) => present(rec, canFinance))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getProposal(id, role, userId, paymentsGrant) {
    seed();
    await delay(MOCK_LATENCY_MS);
    assertAccess(role);
    void userId;
    const rec = get(id);
    applyAutoExpire(rec);
    return present(rec, canAccessFinance(role, paymentsGrant));
  },

  async createProposal(input, actorId, canFinance) {
    seed();
    await delay(MOCK_LATENCY_MS);

    // Resolve the linked opportunity's display + company from the seeded set so
    // the proposal carries denormalized labels (the real backend joins these).
    const linked = [...proposals.values()].find(
      (p) => p.opportunityId === input.opportunityId
    );
    const id = uid("p");
    const year = new Date().getFullYear();
    const seq = String(proposals.size + 1).padStart(3, "0");
    const rec: ProposalRecord = {
      id,
      reference: `PROP-${year}-${seq}`,
      opportunityId: input.opportunityId,
      opportunityTitle: linked?.opportunityTitle ?? input.opportunityId,
      opportunityLost: linked?.opportunityLost ?? false,
      companyId: linked?.companyId ?? "",
      companyName: linked?.companyName ?? "",
      contactId: input.contactId,
      contactName: null,
      valueCents: input.valueCents,
      state: "draft",
      file: null,
      createdAt: new Date().toISOString(),
      sentAt: null,
      validUntil: input.validUntil,
      viewedAt: null,
      decidedAt: null,
      notes: input.notes,
      rejectionNote: null,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    };
    proposals.set(id, rec);
    activityByProposal.set(id, []);
    pushActivity(id, actorId, "created");
    return present(rec, canFinance);
  },

  async uploadPdf(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state !== "draft") throw new ProposalError("invalid_transition");
    rec.file = {
      name: input.name,
      sizeBytes: input.sizeBytes,
      uploadedAt: new Date().toISOString(),
      url: mockSignedUrl(id, input.name),
    };
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "attached", { field: "file", after: input.name });
    return present(rec, true);
  },

  async removePdf(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state !== "draft") throw new ProposalError("invalid_transition");
    const previous = rec.file?.name ?? null;
    rec.file = null;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "updated", { field: "file", before: previous });
    return present(rec, true);
  },

  async sendProposal(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state === "accepted") throw new ProposalError("accepted_locked");
    if (rec.state !== "draft" && rec.state !== "expired") {
      throw new ProposalError("invalid_transition");
    }
    // Reissuing an expired proposal uses `resendProposal` (needs a new validity);
    // a plain send is only valid from draft.
    if (rec.state === "expired") throw new ProposalError("not_expired");
    if (!meetsSendRequirements(rec)) {
      throw new ProposalError("send_requirements_missing");
    }
    rec.state = "sent";
    rec.sentAt = today();
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "state", after: "sent" });
    return present(rec, true);
  },

  async markViewed(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state === "draft") throw new ProposalError("draft_not_decidable");
    if (rec.state !== "sent") throw new ProposalError("invalid_transition");
    rec.state = "viewed";
    rec.viewedAt = today();
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "state", after: "viewed" });
    return present(rec, true);
  },

  async acceptProposal(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state === "draft") throw new ProposalError("draft_not_decidable");
    if (rec.state === "accepted") throw new ProposalError("accepted_locked");
    if (rec.state === "rejected") throw new ProposalError("rejected_not_acceptable");
    if (rec.state !== "sent" && rec.state !== "viewed") {
      throw new ProposalError("invalid_transition");
    }
    if (rec.opportunityLost) throw new ProposalError("opportunity_lost");
    rec.state = "accepted";
    rec.decidedAt = today();
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "state", after: "accepted" });
    return present(rec, true);
  },

  async rejectProposal(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state === "draft") throw new ProposalError("draft_not_decidable");
    if (rec.state === "accepted") throw new ProposalError("accepted_locked");
    if (rec.state !== "sent" && rec.state !== "viewed") {
      throw new ProposalError("invalid_transition");
    }
    if (!input.note.trim()) throw new ProposalError("reject_note_required");
    rec.state = "rejected";
    rec.rejectionNote = input.note.trim();
    rec.decidedAt = today();
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "state", after: "rejected" });
    return present(rec, true);
  },

  async expireProposal(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state !== "sent" && rec.state !== "viewed") {
      throw new ProposalError("invalid_transition");
    }
    rec.state = "expired";
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "state", after: "expired" });
    return present(rec, true);
  },

  async resendProposal(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state !== "expired") throw new ProposalError("not_expired");
    if (!input.validUntil) throw new ProposalError("resend_validity_required");
    rec.state = "sent";
    rec.validUntil = input.validUntil;
    rec.sentAt = today();
    rec.viewedAt = null;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", { field: "state", after: "sent" });
    return present(rec, true);
  },

  async archiveProposal(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    if (rec.state === "accepted") throw new ProposalError("accepted_not_archivable");
    if (rec.state === "sent" || rec.state === "viewed") {
      // Live documents stay in the funnel — only draft/rejected/expired archive (BR-028).
      throw new ProposalError("invalid_transition");
    }
    rec.archivedAt = today();
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "archived");
  },

  async restoreProposal(id, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = get(id);
    rec.archivedAt = null;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "restored");
  },
};

/** State ids exposed for filter option construction in the list view. */
export function proposalStateOptions(): ProposalState[] {
  return ["draft", "sent", "viewed", "accepted", "rejected", "expired"];
}

/* ------------------------------------------------------------------ *
 * Collaboration API for the proposal detail feed (#40). Delegates comments to
 * the shared collaboration store and merges in the live proposal activity so
 * sends / decisions / expiries appear in the timeline.
 * ------------------------------------------------------------------ */

export const proposalCollaborationApi: CollaborationApi = {
  listDirectory: () => collaborationApi.listDirectory(),
  listComments: (t, id) => collaborationApi.listComments(t, id),
  createComment: (input: CreateCommentInput) => collaborationApi.createComment(input),
  updateComment: (input: UpdateCommentInput) => collaborationApi.updateComment(input),
  deleteComment: (id, requesterId) => collaborationApi.deleteComment(id, requesterId),
  restoreComment: (comment: Comment) => collaborationApi.restoreComment(comment),
  async listActivity(entityType, entityId) {
    const live = await collaborationApi.listActivity(entityType, entityId);
    if (entityType !== "proposal") return live;
    seed();
    const seeded = activityByProposal.get(entityId) ?? [];
    return [...seeded, ...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
