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
  ProposalError,
  canAccessProposals,
  type CreateProposalInput,
  type Proposal,
  type ProposalState,
  type RejectProposalInput,
  type ResendProposalInput,
  type UploadPdfInput,
} from "./proposals-types";

/** Max upload size accepted by the mock (10 MB), mirroring the planned backend. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;



function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
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
/** Seeded proposal activity, keyed by proposal id (merged with live entries). */
const activityByProposal: Map<string, ActivityLog[]> = new Map();

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
 * Serialization (finance gating — BR-008)
 * ------------------------------------------------------------------ */


function assertAccess(role: Role): void {
  if (!canAccessProposals(role)) throw new ProposalError("forbidden");
}


/* ------------------------------------------------------------------ *
 * Backend wiring (F6). The state machine (send/view/accept/reject/expire/
 * resend/archive) lives server-side; the frontend `state` == backend `status`
 * (same enum keys). Financial gating (BR-008) is applied client-side on read to
 * mirror the mock. PDF storage has NO backend yet (issue #46), so upload/remove
 * stay stubbed and the resolved `file` is always null on read.
 * ------------------------------------------------------------------ */

interface BackendProposal {
  id: string;
  reference: string;
  opportunityId: string | null;
  companyId: string | null;
  contactId: string | null;
  value: number | null;
  createdDate: string | null;
  sentDate: string | null;
  validUntil: string | null;
  pdfAttachmentId: string | null;
  notes: string | null;
  status: ProposalState;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapProposal(be: BackendProposal, canFinance: boolean): Proposal {
  return {
    id: be.id,
    reference: be.reference,
    opportunityId: be.opportunityId ?? "",
    // INTEGRATION-GAP: opportunityTitle — not returned by the proposals endpoint
    opportunityTitle: "",
    // INTEGRATION-GAP: opportunityLost — not returned by the proposals endpoint
    opportunityLost: false,
    companyId: be.companyId ?? "",
    // INTEGRATION-GAP: companyName — not returned by the proposals endpoint
    companyName: "",
    contactId: be.contactId ?? null,
    // INTEGRATION-GAP: contactName — not returned by the proposals endpoint
    contactName: null,
    valueCents: canFinance ? be.value ?? null : null,
    state: be.status,
    // INTEGRATION-GAP: file — no storage backend (#46); pdf_attachment_id is not
    // resolvable to a downloadable file yet.
    file: null,
    createdAt: be.createdDate ?? be.createdAt,
    sentAt: be.sentDate ?? null,
    validUntil: be.validUntil ?? null,
    // INTEGRATION-GAP: viewedAt — backend has no viewed_at column
    viewedAt: null,
    // INTEGRATION-GAP: decidedAt — backend has no decided_at column
    decidedAt: null,
    notes: be.notes ?? null,
    // INTEGRATION-GAP: rejectionNote — not returned by the proposals endpoint
    rejectionNote: null,
    archivedAt: be.archivedAt ?? null,
    updatedAt: be.updatedAt,
  };
}

function translateProposalError(err: unknown): ProposalError {
  if (err instanceof ProposalError) return err;
  if (err instanceof HttpError) {
    if (err.status === 404) return new ProposalError("not_found");
    if (err.status === 403) return new ProposalError("forbidden");
    return new ProposalError("invalid_transition", err.message);
  }
  return new ProposalError("invalid_transition");
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
  // WIRED → GET /proposals. Access scoped server-side; the proposals gate
  // (BR-002) is kept client-side so a Membro never issues the call.
  async listProposals({ role, userId, paymentsGrant, includeArchived = false }) {
    assertAccess(role);
    void userId;
    try {
      const canFinance = canAccessFinance(role, paymentsGrant);
      const page = await http.get<{ items: BackendProposal[] }>("/proposals", {
        query: { include_archived: includeArchived, page_size: 100 },
      });
      return page.items
        .map((p) => mapProposal(p, canFinance))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → GET /proposals/{id}
  async getProposal(id, role, userId, paymentsGrant) {
    assertAccess(role);
    void userId;
    try {
      const be = await http.get<BackendProposal>(`/proposals/${id}`);
      return mapProposal(be, canAccessFinance(role, paymentsGrant));
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals. Backend requires a `reference`; the frontend create
  // form does not collect one, so we generate it client-side.
  async createProposal(input, actorId, canFinance) {
    void actorId;
    try {
      const year = new Date().getFullYear();
      const be = await http.post<BackendProposal>("/proposals", {
        // NOTE: client-generated reference — backend field is required and the
        // create form omits it. Ideally the backend would auto-number these.
        reference: `PROP-${year}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        opportunityId: input.opportunityId,
        contactId: input.contactId,
        value: input.valueCents,
        validUntil: input.validUntil,
        notes: input.notes,
      });
      return mapProposal(be, canFinance);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // LEFT-ON-STUB: no storage backend (#46). We fetch the real proposal so the id
  // resolves, then synthesize (non-persisted) file metadata for the optimistic
  // UI; a subsequent read returns `file: null` until R2 wiring lands.
  async uploadPdf(id, input, actorId) {
    void actorId;
    try {
      const be = await http.get<BackendProposal>(`/proposals/${id}`);
      if (be.status !== "draft") throw new ProposalError("invalid_transition");
      const p = mapProposal(be, false);
      return {
        ...p,
        file: {
          name: input.name,
          sizeBytes: input.sizeBytes,
          uploadedAt: new Date().toISOString(),
          url: mockSignedUrl(id, input.name),
        },
      };
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // LEFT-ON-STUB: no storage backend (#46). Returns the live proposal (file is
  // already null on read).
  async removePdf(id, actorId) {
    void actorId;
    try {
      const be = await http.get<BackendProposal>(`/proposals/${id}`);
      if (be.status !== "draft") throw new ProposalError("invalid_transition");
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/send (BR-025 enforced server-side)
  async sendProposal(id, actorId) {
    void actorId;
    try {
      const be = await http.post<BackendProposal>(`/proposals/${id}/send`, {});
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/view
  async markViewed(id, actorId) {
    void actorId;
    try {
      const be = await http.post<BackendProposal>(`/proposals/${id}/view`, {});
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/accept (BR-026 terminal, enforced server-side)
  async acceptProposal(id, actorId) {
    void actorId;
    try {
      const be = await http.post<BackendProposal>(`/proposals/${id}/accept`, {});
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/reject. Note required (guarded client side to
  // preserve the typed error code).
  async rejectProposal(id, input, actorId) {
    void actorId;
    if (!input.note.trim()) throw new ProposalError("reject_note_required");
    try {
      const be = await http.post<BackendProposal>(`/proposals/${id}/reject`, {
        note: input.note.trim(),
      });
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/expire
  async expireProposal(id, actorId) {
    void actorId;
    try {
      const be = await http.post<BackendProposal>(`/proposals/${id}/expire`, {});
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/resend. New validity required (guarded client
  // side to preserve the typed error code).
  async resendProposal(id, input, actorId) {
    void actorId;
    if (!input.validUntil) throw new ProposalError("resend_validity_required");
    try {
      const be = await http.post<BackendProposal>(`/proposals/${id}/resend`, {
        validUntil: input.validUntil,
      });
      return mapProposal(be, false);
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/archive (BR-028 enforced server-side)
  async archiveProposal(id, actorId) {
    void actorId;
    try {
      await http.post<BackendProposal>(`/proposals/${id}/archive`, {});
    } catch (err) {
      throw translateProposalError(err);
    }
  },

  // WIRED → POST /proposals/{id}/restore
  async restoreProposal(id, actorId) {
    void actorId;
    try {
      await http.post<BackendProposal>(`/proposals/${id}/restore`, {});
    } catch (err) {
      throw translateProposalError(err);
    }
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
