/**
 * CRM API client — MOCK implementation (F4).
 *
 * Backend is not wired yet. This module exports a typed `crmApi` whose methods
 * return promises exactly as the real HTTP client will. The integration agent
 * replaces the bodies with real `fetch` calls WITHOUT changing the signatures;
 * UI code (via TanStack Query) depends only on the `CrmApi` interface.
 *
 * The client enforces role scoping (BR-002 — Membro sees only companies tied to
 * their projects) and financial gating (BR-008 — no contracted value / payment
 * milestones / opportunity values for users without finance access), mirroring
 * the backend so the UI never surfaces disallowed data. "Cliente ativo" is
 * derived on read (BR-038). Archive is soft-only (BR-060) and blocked while a
 * live project / open opp / unconverted won opp exists (BR-062/H6).
 */

import { addDays, format, startOfDay, subDays } from "date-fns";
import type { Role } from "@/lib/session";
import { http, HttpError } from "@/lib/api/http";
import { canAccessFinance } from "@/lib/api/finance-types";
import {
  companyStatusFromBackend,
  companyStatusToBackend,
  contactStatusFromBackend,
  crmOpportunityStage,
  interactionTypeFromBackend,
  interactionTypeToBackend,
  isOpenOutcome,
} from "@/lib/api/taxonomy";
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
  COMPANY_SOURCES,
  CrmError,
  type ArchiveBlocker,
  type CompanyDetail,
  type CompanyInput,
  type CompanySource,
  type CompanyStatus,
  type CompanySummary,
  type Contact,
  type ContactInput,
  type ContactStatus,
  type FileRef,
  type Interaction,
  type InteractionInput,
  type MeetingRef,
  type OpportunityRef,
  type PaymentRef,
  type ProjectHealth,
  type ProjectRef,
  type ProjectRefStatus,
  type ProposalRef,
  type ProposalStatus,
} from "./crm-types";

function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
}
function isoDateTime(offsetDays: number, hour = 10): string {
  const d = addDays(startOfDay(new Date()), offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/* ------------------------------------------------------------------ *
 * Canonical routes. Cross-feature destinations reuse the dashboard's
 * `recordRoutes` (issue #26) so the whole app links consistently.
 * ------------------------------------------------------------------ */

export const crmRoutes = {
  company: (id: string) => `/crm/companies/${id}`,
  contact: (id: string) => `/crm/contacts/${id}`,
} as const;

/* ------------------------------------------------------------------ *
 * Owners (align ids with the dev session users where relevant)
 * ------------------------------------------------------------------ */

const OWNERS: Record<string, string> = {
  "dev-admin": "Rita Andrade",
  "dev-gestor": "Bruno Salgado",
  "dev-membro": "Carla Nunes",
  "u-diogo": "Diogo Ferreira",
  "u-sofia": "Sofia Marques",
};
function ownerName(id: string): string {
  return OWNERS[id] ?? id;
}

/** Internal-owner directory (responsável interno) for form selects. */
export const CRM_OWNERS: { id: string; name: string }[] = Object.entries(OWNERS).map(
  ([id, name]) => ({ id, name })
);

/* ------------------------------------------------------------------ *
 * Internal seed shape (superset of the public models). Financial fields are
 * stored raw here and stripped per-caller on read.
 * ------------------------------------------------------------------ */

interface CompanyRecord {
  id: string;
  name: string;
  logoUrl: string | null;
  status: CompanySummary["status"];
  sector: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ownerId: string;
  source: CompanySummary["source"];
  description: string | null;
  lastInteractionAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  totalContractedCents: number;
  archivedAt: string | null;
  /** Project members with access (BR-002). */
  memberIds: string[];
  contacts: Contact[];
  opportunities: OpportunityRef[];
  proposals: ProposalRef[];
  projects: ProjectRef[];
  meetings: MeetingRef[];
  files: FileRef[];
  payments: PaymentRef[];
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

function contact(
  id: string,
  companyId: string,
  companyName: string,
  name: string,
  role: string,
  ownerId: string,
  opts: Partial<Contact> = {}
): Contact {
  return {
    id,
    name,
    photoUrl: null,
    role,
    email: `${name.split(" ")[0].toLowerCase()}@${companyName
      .split(" ")[0]
      .toLowerCase()
      .replace(/[^a-z]/g, "")}.pt`,
    phone: "+351 210 000 000",
    website: null,
    companyId,
    companyName,
    ownerId,
    ownerName: ownerName(ownerId),
    notes: null,
    lastInteractionAt: null,
    nextAction: null,
    nextActionAt: null,
    status: "active",
    archivedAt: null,
    ...opts,
  };
}

const companies: Map<string, CompanyRecord> = new Map();
const interactions: Interaction[] = [];

function seedCompanies(): void {
  if (companies.size > 0) return;

  const records: CompanyRecord[] = [
    {
      id: "c-1",
      name: "Adega Vale",
      logoUrl: null,
      status: "ativo",
      sector: "Vinhos e Bebidas",
      website: "https://adegavale.pt",
      email: "geral@adegavale.pt",
      phone: "+351 232 400 100",
      address: "Rua das Vinhas 12, Viseu",
      ownerId: "dev-gestor",
      source: "referral",
      description:
        "Produtor de vinhos do Dão em processo de rebranding e presença digital.",
      lastInteractionAt: isoDate(-2),
      nextAction: "Enviar mockups do manual de marca",
      nextActionAt: isoDate(3),
      totalContractedCents: 34_000_00,
      archivedAt: null,
      memberIds: ["dev-gestor", "dev-membro", "u-diogo"],
      contacts: [
        contact("ct-1", "c-1", "Adega Vale", "Helena Matos", "Diretora de Marketing", "dev-gestor", {
          website: "https://adegavale.pt",
          lastInteractionAt: isoDate(-2),
          nextAction: "Confirmar paleta final",
          nextActionAt: isoDate(3),
        }),
        contact("ct-2", "c-1", "Adega Vale", "Rui Camposinhos", "Sócio-gerente", "dev-gestor", {
          website: "https://adegavale.pt",
        }),
      ],
      opportunities: [
        {
          id: "o-adega-1",
          title: "Rebranding — Adega Vale",
          stage: "won",
          open: false,
          wonUnconverted: false,
          valueCents: 34_000_00,
          nextAction: null,
        },
      ],
      proposals: [
        {
          id: "pr-adega-1",
          title: "Rebranding + Manual de marca",
          status: "accepted",
          valueCents: 34_000_00,
          validUntil: isoDate(-30),
        },
      ],
      projects: [
        {
          id: "p-1",
          name: "Rebranding — Adega Vale",
          status: "active",
          health: "attention",
          progress: 55,
          live: true,
        },
      ],
      meetings: [
        {
          id: "mt-1",
          title: "Apresentação de conceito",
          scheduledAt: isoDateTime(4, 15),
          attendees: ["Helena Matos", "Bruno Salgado", "Carla Nunes"],
          location: "Videochamada",
        },
      ],
      files: [
        {
          id: "f-1",
          name: "briefing-adega-vale.pdf",
          sizeBytes: 182_400,
          mimeType: "application/pdf",
          uploadedAt: isoDate(-20),
          uploadedByName: "Bruno Salgado",
        },
        {
          id: "f-2",
          name: "moodboard-v2.png",
          sizeBytes: 2_450_000,
          mimeType: "image/png",
          uploadedAt: isoDate(-6),
          uploadedByName: "Carla Nunes",
        },
      ],
      payments: [
        {
          id: "pm-1",
          description: "Adjudicação (30%)",
          projectName: "Rebranding — Adega Vale",
          amountCents: 10_200_00,
          receivedAmountCents: 10_200_00,
          status: "paid",
          expectedDate: isoDate(-25),
        },
        {
          id: "pm-3",
          description: "Manual de marca (40%)",
          projectName: "Rebranding — Adega Vale",
          amountCents: 13_600_00,
          receivedAmountCents: 0,
          status: "overdue",
          expectedDate: isoDate(-5),
        },
      ],
    },
    {
      id: "c-2",
      name: "Lumina Retail",
      logoUrl: null,
      status: "potencial",
      sector: "Retalho",
      website: "https://lumina.pt",
      email: "hello@lumina.pt",
      phone: "+351 210 500 200",
      address: "Av. da Liberdade 220, Lisboa",
      ownerId: "dev-gestor",
      source: "inbound",
      description:
        "Cadeia de retalho a avaliar uma app de fidelização e portal interno.",
      lastInteractionAt: isoDate(-1),
      nextAction: "Preparar proposta da app de fidelização",
      nextActionAt: isoDate(2),
      totalContractedCents: 0,
      archivedAt: null,
      memberIds: ["dev-gestor", "u-sofia"],
      contacts: [
        contact("ct-3", "c-2", "Lumina Retail", "André Pinto", "CTO", "dev-gestor", {
          lastInteractionAt: isoDate(-1),
        }),
      ],
      opportunities: [
        {
          id: "o-1",
          title: "App Fidelização — Lumina",
          stage: "proposal",
          open: true,
          wonUnconverted: false,
          valueCents: 48_000_00,
          nextAction: null,
        },
        {
          id: "o-3",
          title: "Portal Interno — Lumina",
          stage: "negotiation",
          open: true,
          wonUnconverted: false,
          valueCents: 62_000_00,
          nextAction: "Agendar reunião de fecho",
        },
      ],
      proposals: [
        {
          id: "pr-1",
          title: "Portal Interno — Lumina",
          status: "sent",
          valueCents: 62_000_00,
          validUntil: isoDate(1),
        },
      ],
      projects: [],
      meetings: [
        {
          id: "mt-2",
          title: "Descoberta técnica",
          scheduledAt: isoDateTime(-3, 11),
          attendees: ["André Pinto", "Bruno Salgado"],
          location: "Escritório Lumina",
        },
      ],
      files: [],
      payments: [],
    },
    {
      id: "c-3",
      name: "Metalúrgica Norte",
      logoUrl: null,
      status: "potencial",
      sector: "Indústria",
      website: "https://metalnorte.pt",
      email: "comercial@metalnorte.pt",
      phone: "+351 220 700 300",
      address: "Zona Industrial da Maia, Lote 8",
      ownerId: "u-diogo",
      source: "outbound",
      description: "Fabricante industrial a explorar um portal B2B de encomendas.",
      lastInteractionAt: isoDate(-16),
      nextAction: null,
      nextActionAt: null,
      totalContractedCents: 0,
      archivedAt: null,
      memberIds: ["u-diogo", "dev-gestor"],
      contacts: [
        contact("ct-4", "c-3", "Metalúrgica Norte", "Paula Freitas", "Diretora Comercial", "u-diogo"),
      ],
      opportunities: [
        {
          id: "o-2",
          title: "Portal B2B — Metalúrgica Norte",
          stage: "discovery",
          open: true,
          wonUnconverted: false,
          valueCents: 71_000_00,
          nextAction: null,
        },
      ],
      proposals: [],
      projects: [],
      meetings: [],
      files: [],
      payments: [],
    },
    {
      id: "c-4",
      name: "Solar do Douro",
      logoUrl: null,
      status: "ativo",
      sector: "Turismo",
      website: "https://solardodouro.pt",
      email: "reservas@solardodouro.pt",
      phone: "+351 254 900 400",
      address: "Quinta do Douro, Peso da Régua",
      ownerId: "dev-gestor",
      source: "event",
      description: "Unidade de turismo rural com novo website e motor de reservas.",
      lastInteractionAt: isoDate(-4),
      nextAction: "Rever conteúdos da homepage",
      nextActionAt: isoDate(1),
      totalContractedCents: 21_000_00,
      archivedAt: null,
      memberIds: ["dev-gestor", "dev-membro"],
      contacts: [
        contact("ct-5", "c-4", "Solar do Douro", "Miguel Torres", "Proprietário", "dev-gestor"),
      ],
      opportunities: [],
      proposals: [
        {
          id: "pr-2",
          title: "Website + Reservas",
          status: "accepted",
          valueCents: 21_000_00,
          validUntil: isoDate(-45),
        },
      ],
      projects: [
        {
          id: "p-2",
          name: "Website — Solar do Douro",
          status: "active",
          health: "at_risk",
          progress: 40,
          live: true,
        },
      ],
      meetings: [],
      files: [
        {
          id: "f-3",
          name: "conteudos-homepage.docx",
          sizeBytes: 96_500,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          uploadedAt: isoDate(-8),
          uploadedByName: "Carla Nunes",
        },
      ],
      payments: [
        {
          id: "pm-4",
          description: "Adjudicação (50%)",
          projectName: "Website — Solar do Douro",
          amountCents: 10_500_00,
          receivedAmountCents: 10_500_00,
          status: "paid",
          expectedDate: isoDate(-30),
        },
        {
          id: "pm-5",
          description: "Entrega final (50%)",
          projectName: "Website — Solar do Douro",
          amountCents: 10_500_00,
          receivedAmountCents: 0,
          status: "planned",
          expectedDate: isoDate(12),
        },
      ],
    },
    {
      id: "c-5",
      name: "Estúdio Aurora",
      logoUrl: null,
      status: "parceiro",
      sector: "Design e Media",
      website: "https://estudioaurora.pt",
      email: "ola@estudioaurora.pt",
      phone: "+351 213 300 500",
      address: "Rua do Ouro 55, Porto",
      ownerId: "dev-admin",
      source: "partner",
      description:
        "Estúdio criativo parceiro para produção de conteúdos e ilustração.",
      lastInteractionAt: isoDate(-9),
      nextAction: "Alinhar disponibilidade Q3",
      nextActionAt: isoDate(6),
      totalContractedCents: 8_500_00,
      archivedAt: null,
      memberIds: ["dev-admin", "dev-gestor"],
      contacts: [
        contact("ct-6", "c-5", "Estúdio Aurora", "Inês Barreto", "Diretora Criativa", "dev-admin"),
      ],
      opportunities: [],
      proposals: [],
      projects: [
        {
          id: "p-4",
          name: "Conteúdos — campanha Verão",
          status: "completed",
          health: "healthy",
          progress: 100,
          live: false,
        },
      ],
      meetings: [],
      files: [],
      payments: [],
    },
    {
      id: "c-6",
      name: "Clínica Sévora",
      logoUrl: null,
      status: "inativo",
      sector: "Saúde",
      website: null,
      email: "geral@sevora.pt",
      phone: "+351 266 100 600",
      address: "Praça 1º de Maio, Évora",
      ownerId: "dev-admin",
      source: "referral",
      description: "Cliente inativo desde a conclusão do site institucional em 2024.",
      lastInteractionAt: isoDate(-140),
      nextAction: null,
      nextActionAt: null,
      totalContractedCents: 6_000_00,
      archivedAt: null,
      memberIds: ["dev-admin"],
      contacts: [],
      opportunities: [],
      proposals: [],
      projects: [],
      meetings: [],
      files: [],
      payments: [],
    },
    {
      id: "c-7",
      name: "Verdejar Bio",
      logoUrl: null,
      status: "potencial",
      sector: "Agroalimentar",
      website: "https://verdejar.bio",
      email: "info@verdejar.bio",
      phone: "+351 231 200 700",
      address: "Rua do Campo 3, Aveiro",
      ownerId: "u-sofia",
      source: "inbound",
      description:
        "Marca de produtos biológicos a preparar loja online e identidade.",
      lastInteractionAt: isoDate(-30),
      nextAction: "Follow-up após feira",
      nextActionAt: isoDate(-2),
      totalContractedCents: 0,
      archivedAt: null,
      memberIds: ["u-sofia"],
      contacts: [
        contact("ct-7", "c-7", "Verdejar Bio", "Tiago Lima", "Fundador", "u-sofia"),
      ],
      opportunities: [
        {
          id: "o-4",
          title: "Loja online — Verdejar",
          stage: "won",
          open: false,
          wonUnconverted: true,
          valueCents: 27_000_00,
          nextAction: "Converter em projeto",
        },
      ],
      proposals: [],
      projects: [],
      meetings: [],
      files: [],
      payments: [],
    },
    {
      id: "c-8",
      name: "Câmara de Alvorada",
      logoUrl: null,
      status: "arquivada",
      sector: "Setor Público",
      website: "https://cm-alvorada.pt",
      email: "geral@cm-alvorada.pt",
      phone: "+351 262 800 800",
      address: "Praça do Município, Alvorada",
      ownerId: "dev-admin",
      source: "outbound",
      description: "Concurso público não adjudicado — relação arquivada.",
      lastInteractionAt: isoDate(-210),
      nextAction: null,
      nextActionAt: null,
      totalContractedCents: 0,
      archivedAt: isoDate(-60),
      memberIds: ["dev-admin"],
      contacts: [],
      opportunities: [],
      proposals: [],
      projects: [],
      meetings: [],
      files: [],
      payments: [],
    },
  ];

  for (const r of records) companies.set(r.id, r);

  interactions.push(
    {
      id: "in-1",
      companyId: "c-1",
      contactId: "ct-1",
      contactName: "Helena Matos",
      opportunityId: null,
      opportunityTitle: null,
      projectId: "p-1",
      projectName: "Rebranding — Adega Vale",
      type: "meeting",
      subject: "Kickoff do rebranding",
      body: "Alinhámos objetivos, tom de marca e calendário. Cliente quer um registo elegante e sóbrio.",
      occurredAt: isoDateTime(-20, 15),
      authorId: "dev-gestor",
      authorName: "Bruno Salgado",
    },
    {
      id: "in-2",
      companyId: "c-1",
      contactId: "ct-1",
      contactName: "Helena Matos",
      opportunityId: null,
      opportunityTitle: null,
      projectId: null,
      projectName: null,
      type: "call",
      subject: "Feedback sobre o moodboard",
      body: "Preferem a direção 2 (paleta terra + dourado). Pediram para reforçar o símbolo.",
      occurredAt: isoDateTime(-6, 11),
      authorId: "dev-membro",
      authorName: "Carla Nunes",
    },
    {
      id: "in-3",
      companyId: "c-1",
      contactId: null,
      contactName: null,
      opportunityId: null,
      opportunityTitle: null,
      projectId: null,
      projectName: null,
      type: "email",
      subject: "Envio dos assets preliminares",
      body: null,
      occurredAt: isoDateTime(-2, 9),
      authorId: "dev-gestor",
      authorName: "Bruno Salgado",
    },
    {
      id: "in-4",
      companyId: "c-2",
      contactId: "ct-3",
      contactName: "André Pinto",
      opportunityId: "o-1",
      opportunityTitle: "App Fidelização — Lumina",
      projectId: null,
      projectName: null,
      type: "meeting",
      subject: "Descoberta técnica",
      body: "Levantámos requisitos de integração com o ERP e o programa de pontos.",
      occurredAt: isoDateTime(-3, 11),
      authorId: "dev-gestor",
      authorName: "Bruno Salgado",
    },
    {
      id: "in-5",
      companyId: "c-2",
      contactId: "ct-3",
      contactName: "André Pinto",
      opportunityId: "o-3",
      opportunityTitle: "Portal Interno — Lumina",
      projectId: null,
      projectName: null,
      type: "follow_up",
      subject: "Follow-up da proposta do portal",
      body: "Aguarda aprovação interna. Retomar contacto na próxima semana.",
      occurredAt: isoDateTime(-1, 16),
      authorId: "dev-gestor",
      authorName: "Bruno Salgado",
    },
    {
      id: "in-6",
      companyId: "c-4",
      contactId: "ct-5",
      contactName: "Miguel Torres",
      opportunityId: null,
      opportunityTitle: null,
      projectId: "p-2",
      projectName: "Website — Solar do Douro",
      type: "note",
      subject: "Conteúdos em atraso",
      body: "Cliente ainda não enviou os textos finais — a atrasar o arranque da homepage.",
      occurredAt: isoDateTime(-4, 14),
      authorId: "dev-gestor",
      authorName: "Bruno Salgado",
    }
  );
}

/* ------------------------------------------------------------------ *
 * Derivations + gating
 * ------------------------------------------------------------------ */

/** "Cliente ativo" (BR-038): ≥1 active/won relationship. */
function deriveClienteAtivo(r: CompanyRecord): boolean {
  const wonOpp = r.opportunities.some((o) => o.stage === "won");
  const liveOrDoneProject = r.projects.some(
    (p) => p.status === "active" || p.status === "completed" || p.status === "on_hold"
  );
  const acceptedProposal = r.proposals.some((p) => p.status === "accepted");
  return wonOpp || liveOrDoneProject || acceptedProposal;
}

/* ------------------------------------------------------------------ *
 * Real backend wiring (issue #14 CRM API).
 *
 * The shared `http` client prepends `/api/v1`, attaches+refreshes the JWT and
 * deep case-maps snake_case⇄camelCase, so everything below is camelCase. Backend
 * permission scoping (BR-002) + financial gating happen server-side via the JWT;
 * the `role`/`userId`/`paymentsGrant` params are kept in the signatures but the
 * backend is authoritative. We still compute `canAccessFinance` locally to drive
 * the UI's `canSeeFinancials` flag and to null out financial fields defensively.
 * ------------------------------------------------------------------ */

interface BackendPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface BackendCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  sector: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  source: string | null;
  ownerId: string | null;
  status: string;
  isActiveClient: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendContact {
  id: string;
  name: string;
  companyId: string | null;
  photoUrl: string | null;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  ownerId: string | null;
  status: string;
  archivedAt: string | null;
}

interface BackendOpportunity {
  id: string;
  title: string;
  companyId: string | null;
  ownerId: string | null;
  stageId: string | null;
  estimatedValue: number | null;
  nextAction: string | null;
  outcome: string;
  archivedAt: string | null;
}

interface BackendProposal {
  id: string;
  reference: string;
  companyId: string | null;
  value: number | null;
  validUntil: string | null;
  status: string;
}

interface BackendProject {
  id: string;
  name: string;
  companyId: string | null;
  status: string;
  publishedHealth: string | null;
  contractedValue: number | null;
}

interface BackendMilestone {
  id: string;
  projectId: string;
  companyId: string | null;
  description: string | null;
  amount: number;
  receivedAmount: number;
  expectedDate: string | null;
  status: string;
}

interface BackendInteraction {
  id: string;
  type: string;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  projectId: string | null;
  body: string | null;
  occurredAt: string;
  userId: string | null;
}

interface BackendStage {
  id: string;
  code: string;
}

/** Map an `HttpError` to the CRM domain error, preserving the mock's codes. */
function toCrmError(err: unknown): CrmError {
  if (err instanceof HttpError) {
    if (err.status === 404) return new CrmError("not_found");
    if (err.status === 403) return new CrmError("forbidden");
    if (err.status === 0 || err.code === "NETWORK") return new CrmError("network");
    if (err.status === 409 && err.code === "COMPANY_ARCHIVE_BLOCKED") {
      return new CrmError("archive_blocked", archiveBlockersFromDetails(err.details));
    }
  }
  return new CrmError("network");
}

/**
 * Translate the backend 409 archive-block payload
 * `{ blockers: { active_projects, open_opportunities, won_unconverted_opportunities: id[] } }`
 * into typed {@link ArchiveBlocker}s. NB: the error envelope is NOT case-mapped
 * so keys stay snake_case. INTEGRATION-GAP: backend returns entity ids only —
 * no human labels — so the id is used as the label.
 */
function archiveBlockersFromDetails(details: unknown): ArchiveBlocker[] {
  const out: ArchiveBlocker[] = [];
  const blockers =
    details && typeof details === "object" && "blockers" in details
      ? (details as { blockers?: Record<string, unknown> }).blockers
      : undefined;
  if (!blockers || typeof blockers !== "object") return out;
  const b = blockers as Record<string, unknown>;
  const collect = (key: string, kind: ArchiveBlocker["kind"]) => {
    const ids = b[key];
    if (Array.isArray(ids)) for (const id of ids) out.push({ kind, label: String(id) });
  };
  collect("active_projects", "liveProject");
  collect("open_opportunities", "openOpportunity");
  collect("won_unconverted_opportunities", "wonUnconvertedOpportunity");
  return out;
}

function mapSource(source: string | null): CompanySource {
  return (COMPANY_SOURCES as string[]).includes(source ?? "")
    ? (source as CompanySource)
    : "other";
}

const LIVE_PROJECT_STATUSES = new Set(["planning", "active", "on_hold"]);

function mapProposalStatus(status: string): ProposalStatus {
  // Backend adds "viewed" (not in the frontend union) — treat it as "sent".
  if (status === "viewed") return "sent";
  const known: ProposalStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];
  return known.includes(status as ProposalStatus) ? (status as ProposalStatus) : "draft";
}

/**
 * Map a backend company to the frontend summary. Many summary fields are NOT
 * carried on `CompanyResponse`; they are defaulted here (see INTEGRATION-GAPs).
 * For a single-company detail read some of these are enriched afterwards from
 * the relationship sub-queries.
 */
function mapCompanySummary(c: BackendCompany, canFinance: boolean): CompanySummary {
  // canFinance is part of the caller contract but the financial summary fields
  // are defaulted here regardless (see INTEGRATION-GAPs below).
  void canFinance;
  return {
    id: c.id,
    name: c.name,
    logoUrl: c.logoUrl,
    status: companyStatusFromBackend(c.status, c.archivedAt),
    sector: c.sector ?? "",
    website: c.website,
    email: c.email,
    phone: c.phone,
    address: c.address,
    ownerId: c.ownerId ?? "",
    // INTEGRATION-GAP: ownerName — backend returns owner_id only, no display name
    ownerName: "",
    source: mapSource(c.source),
    // INTEGRATION-GAP: lastInteractionAt — not on CompanyResponse
    lastInteractionAt: null,
    // INTEGRATION-GAP: nextAction/nextActionAt — company has no next-action field
    nextAction: null,
    nextActionAt: null,
    clienteAtivo: c.isActiveClient,
    // INTEGRATION-GAP: counts — not on CompanyResponse (enriched per-detail only)
    openOpportunities: 0,
    activeProjects: 0,
    // INTEGRATION-GAP: totalContractedCents — not on CompanyResponse
    totalContractedCents: null,
    // INTEGRATION-GAP: notesCount/attachmentsCount — no backend counters
    notesCount: 0,
    attachmentsCount: 0,
    archivedAt: c.archivedAt,
  };
}

function mapContact(c: BackendContact, companyName: string | null): Contact {
  return {
    id: c.id,
    name: c.name,
    photoUrl: c.photoUrl,
    role: c.roleTitle,
    email: c.email,
    phone: c.phone,
    // INTEGRATION-GAP: website — contact has no website field on the backend
    website: null,
    companyId: c.companyId ?? "",
    // INTEGRATION-GAP: companyName — not embedded on ContactResponse (resolved
    // from the parent company on a detail read, otherwise empty)
    companyName: companyName ?? "",
    ownerId: c.ownerId ?? "",
    // INTEGRATION-GAP: ownerName — backend returns owner_id only
    ownerName: "",
    notes: c.notes,
    // INTEGRATION-GAP: lastInteractionAt/nextAction/nextActionAt — not on ContactResponse
    lastInteractionAt: null,
    nextAction: null,
    nextActionAt: null,
    status: contactStatusFromBackend(c.status) as ContactStatus,
    archivedAt: c.archivedAt,
  };
}

function mapOpportunityRef(
  o: BackendOpportunity,
  stageCodes: Map<string, string>,
  canFinance: boolean
): OpportunityRef {
  return {
    id: o.id,
    title: o.title,
    stage: crmOpportunityStage(o.outcome, o.stageId ? stageCodes.get(o.stageId) ?? null : null),
    open: isOpenOutcome(o.outcome),
    // INTEGRATION-GAP: wonUnconverted — OpportunityResponse carries no
    // "converted to project" flag (the backend computes it only for archive
    // blocking). Defaulted false.
    wonUnconverted: false,
    valueCents: canFinance ? o.estimatedValue : null,
    nextAction: o.nextAction,
  };
}

function mapProposalRef(p: BackendProposal, canFinance: boolean): ProposalRef {
  return {
    id: p.id,
    // Backend proposal has no title; `reference` is the human-facing label.
    title: p.reference,
    status: mapProposalStatus(p.status),
    valueCents: canFinance ? p.value : null,
    validUntil: p.validUntil,
  };
}

function mapProjectRef(p: BackendProject): ProjectRef {
  return {
    id: p.id,
    name: p.name,
    status: p.status as ProjectRefStatus,
    health: (p.publishedHealth as ProjectHealth | null) ?? "healthy",
    // INTEGRATION-GAP: progress — ProjectResponse exposes no completion percentage
    progress: 0,
    live: LIVE_PROJECT_STATUSES.has(p.status),
  };
}

function mapPaymentRef(m: BackendMilestone): PaymentRef {
  return {
    id: m.id,
    description: m.description ?? "",
    // INTEGRATION-GAP: projectName — milestone response carries project_id only
    projectName: "",
    amountCents: m.amount,
    receivedAmountCents: m.receivedAmount,
    status: m.status as PaymentRef["status"],
    expectedDate: m.expectedDate ?? "",
  };
}

function mapInteraction(i: BackendInteraction): Interaction {
  return {
    id: i.id,
    companyId: i.companyId ?? "",
    contactId: i.contactId,
    // INTEGRATION-GAP: contactName/opportunityTitle/projectName — backend returns
    // ids only, no embedded display names
    contactName: null,
    opportunityId: i.opportunityId,
    opportunityTitle: null,
    projectId: i.projectId,
    projectName: null,
    type: interactionTypeFromBackend(i.type),
    // INTEGRATION-GAP: subject — InteractionResponse has no subject field (body only)
    subject: "",
    body: i.body,
    occurredAt: i.occurredAt,
    authorId: i.userId ?? "",
    // INTEGRATION-GAP: authorName — backend returns user_id only
    authorName: "",
  };
}

/** Cached pipeline-stage id→code map (drives opportunity stage bucketing). */
let stageCodeCache: Map<string, string> | null = null;
async function stageCodeMap(): Promise<Map<string, string>> {
  if (stageCodeCache) return stageCodeCache;
  const stages = await http.get<BackendStage[]>("/pipeline-stages");
  stageCodeCache = new Map(stages.map((s) => [s.id, s.code]));
  return stageCodeCache;
}

/** Build the backend company create/update body from the frontend input. */
function toCompanyBody(input: CompanyInput): Record<string, unknown> {
  // INTEGRATION-GAP: nextAction/nextActionAt — no company field on the backend;
  // dropped on write.
  return {
    name: input.name,
    status: companyStatusToBackend(input.status as CompanyStatus),
    sector: input.sector,
    website: input.website,
    email: input.email,
    phone: input.phone,
    address: input.address,
    ownerId: input.ownerId,
    source: input.source,
    description: input.description,
  };
}

/** Build the backend contact create/update body from the frontend input. */
function toContactBody(input: ContactInput): Record<string, unknown> {
  return {
    name: input.name,
    companyId: input.companyId,
    roleTitle: input.role,
    email: input.email,
    phone: input.phone,
    notes: input.notes,
    ownerId: input.ownerId,
    status: input.status,
  };
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface ListCompaniesParams {
  role: Role;
  userId: string;
  paymentsGrant: boolean;
  /** Include archived companies (default false — BR-061). */
  includeArchived?: boolean;
}

export interface CrmApi {
  listCompanies(params: ListCompaniesParams): Promise<CompanySummary[]>;
  getCompany(
    id: string,
    role: Role,
    userId: string,
    paymentsGrant: boolean
  ): Promise<CompanyDetail>;
  createCompany(input: CompanyInput, actorId: string): Promise<CompanySummary>;
  updateCompany(
    id: string,
    input: CompanyInput,
    actorId: string
  ): Promise<CompanySummary>;
  /** Soft-archive (BR-060). Throws `archive_blocked` with blockers (BR-062). */
  archiveCompany(id: string, actorId: string): Promise<void>;
  restoreCompany(id: string, actorId: string): Promise<void>;
  listContacts(params: ListCompaniesParams): Promise<Contact[]>;
  getContact(
    id: string,
    role: Role,
    userId: string
  ): Promise<{ contact: Contact; interactions: Interaction[] }>;
  createContact(input: ContactInput, actorId: string): Promise<Contact>;
  updateContact(id: string, input: ContactInput, actorId: string): Promise<Contact>;
  /** Soft-archive (BR-060). Contacts have no archive-blocker rule. */
  archiveContact(id: string, actorId: string): Promise<void>;
  restoreContact(id: string, actorId: string): Promise<void>;
  listInteractions(companyId: string): Promise<Interaction[]>;
  createInteraction(input: InteractionInput): Promise<Interaction>;
}

const PAGE_SIZE = 100;

export const crmApi: CrmApi = {
  // GET /companies. Backend scopes by JWT (role/userId ignored here).
  async listCompanies({ role, paymentsGrant, includeArchived = false }) {
    const canFinance = canAccessFinance(role, paymentsGrant);
    try {
      const page = await http.get<BackendPage<BackendCompany>>("/companies", {
        query: { include_archived: includeArchived, page_size: PAGE_SIZE },
      });
      return page.items
        .map((c) => mapCompanySummary(c, canFinance))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // GET /companies/{id} + relationship sub-queries for the detail tabs.
  async getCompany(id, role, _userId, paymentsGrant) {
    const canFinance = canAccessFinance(role, paymentsGrant);
    try {
      const [company, stageCodes, contactsPage, oppsPage, propsPage, projsPage] =
        await Promise.all([
          http.get<BackendCompany>(`/companies/${id}`),
          stageCodeMap(),
          http.get<BackendPage<BackendContact>>("/contacts", {
            query: { company_id: id, page_size: PAGE_SIZE },
          }),
          http.get<BackendPage<BackendOpportunity>>("/opportunities", {
            query: { company_id: id, page_size: PAGE_SIZE },
          }),
          http.get<BackendPage<BackendProposal>>("/proposals", {
            query: { company_id: id, page_size: PAGE_SIZE },
          }),
          http.get<BackendPage<BackendProject>>("/projects", {
            query: { company_id: id, page_size: PAGE_SIZE },
          }),
        ]);

      const opportunities = oppsPage.items.map((o) =>
        mapOpportunityRef(o, stageCodes, canFinance)
      );
      const projects = projsPage.items.map(mapProjectRef);
      const contacts = contactsPage.items
        .filter((c) => c.archivedAt === null)
        .map((c) => mapContact(c, company.name));

      // Financial gating (BR-008): milestones only for finance-capable callers.
      let payments: PaymentRef[] = [];
      if (canFinance) {
        const milestonesPage = await http.get<BackendPage<BackendMilestone>>(
          "/finance/payment-milestones",
          { query: { company_id: id, page_size: PAGE_SIZE } }
        );
        payments = milestonesPage.items.map(mapPaymentRef);
      }

      const summary = mapCompanySummary(company, canFinance);
      return {
        ...summary,
        // Enriched from the relationship sub-queries (cheap: already fetched).
        openOpportunities: opportunities.filter((o) => o.open).length,
        activeProjects: projects.filter((p) => p.live).length,
        totalContractedCents: canFinance
          ? projsPage.items.reduce((sum, p) => sum + (p.contractedValue ?? 0), 0)
          : null,
        description: company.description,
        contacts,
        opportunities,
        proposals: propsPage.items.map((p) => mapProposalRef(p, canFinance)),
        projects,
        // INTEGRATION-GAP: meetings — no meetings/calendar backend endpoint
        meetings: [] as MeetingRef[],
        // INTEGRATION-GAP: files — no attachments backend endpoint
        files: [] as FileRef[],
        payments,
        canSeeFinancials: canFinance,
      };
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /companies. Financial fields are stripped from the write response
  // (BR-008); callers refetch via the gated reads.
  async createCompany(input) {
    try {
      const created = await http.post<BackendCompany>("/companies", toCompanyBody(input));
      return mapCompanySummary(created, false);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // PATCH /companies/{id}.
  async updateCompany(id, input) {
    try {
      const updated = await http.patch<BackendCompany>(
        `/companies/${id}`,
        toCompanyBody(input)
      );
      return mapCompanySummary(updated, false);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /companies/{id}/archive — 409 COMPANY_ARCHIVE_BLOCKED → archive_blocked.
  async archiveCompany(id) {
    try {
      await http.post<BackendCompany>(`/companies/${id}/archive`);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /companies/{id}/restore.
  async restoreCompany(id) {
    try {
      await http.post<BackendCompany>(`/companies/${id}/restore`);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // GET /contacts. Backend scopes by JWT.
  async listContacts({ includeArchived = false }) {
    try {
      const page = await http.get<BackendPage<BackendContact>>("/contacts", {
        query: { include_archived: includeArchived, page_size: PAGE_SIZE },
      });
      return page.items
        .filter((c) => includeArchived || c.archivedAt === null)
        // INTEGRATION-GAP: companyName — not embedded on ContactResponse
        .map((c) => mapContact(c, null))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // GET /contacts/{id} + its interactions.
  async getContact(id) {
    try {
      const [contact, interactionsPage] = await Promise.all([
        http.get<BackendContact>(`/contacts/${id}`),
        http.get<BackendPage<BackendInteraction>>("/interactions", {
          query: { contact_id: id, page_size: PAGE_SIZE },
        }),
      ]);
      return {
        // INTEGRATION-GAP: companyName — not embedded on ContactResponse
        contact: mapContact(contact, null),
        interactions: interactionsPage.items
          .map(mapInteraction)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      };
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /contacts (H9 fix). Gestor+ only (RequireGestor on the route).
  async createContact(input) {
    try {
      const created = await http.post<BackendContact>("/contacts", toContactBody(input));
      return mapContact(created, null);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // PATCH /contacts/{id} (H9 fix).
  async updateContact(id, input) {
    try {
      const updated = await http.patch<BackendContact>(
        `/contacts/${id}`,
        toContactBody(input)
      );
      return mapContact(updated, null);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /contacts/{id}/archive (H9 fix). No archive-blocker rule for contacts.
  async archiveContact(id) {
    try {
      await http.post<BackendContact>(`/contacts/${id}/archive`);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /contacts/{id}/restore (H9 fix).
  async restoreContact(id) {
    try {
      await http.post<BackendContact>(`/contacts/${id}/restore`);
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // GET /interactions?company_id=.
  async listInteractions(companyId) {
    try {
      const page = await http.get<BackendPage<BackendInteraction>>("/interactions", {
        query: { company_id: companyId, page_size: PAGE_SIZE },
      });
      return page.items
        .map(mapInteraction)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    } catch (err) {
      throw toCrmError(err);
    }
  },

  // POST /interactions. INTEGRATION-GAP: `subject` is dropped (no backend field);
  // `authorId` comes from the JWT server-side.
  async createInteraction(input) {
    try {
      const created = await http.post<BackendInteraction>("/interactions", {
        type: interactionTypeToBackend(input.type),
        companyId: input.companyId,
        contactId: input.contactId,
        opportunityId: input.opportunityId,
        projectId: input.projectId,
        body: input.body,
        occurredAt: input.occurredAt,
      });
      return mapInteraction(created);
    } catch (err) {
      throw toCrmError(err);
    }
  },
};

/* ------------------------------------------------------------------ *
 * CRM-seeded collaboration client.
 *
 * The Notas + Linha temporal tabs reuse the #40 CommentThread / ActivityFeed
 * components. Those accept an injectable `api` (defaulting to the mock
 * collaboration client). We pass this wrapper so a company opens with a
 * populated, coherent timeline while delegating all comment persistence to the
 * real collaboration client (so posting/editing/deleting notes keeps working
 * and shows up in the timeline).
 * ------------------------------------------------------------------ */

const CRM_ACTORS: Record<string, DirectoryUser> = {
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@leiritech.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@leiritech.pt", avatarUrl: null },
  "dev-membro": { id: "dev-membro", name: "Carla Nunes", email: "carla@leiritech.pt", avatarUrl: null },
};

function seededCompanyActivity(companyId: string): ActivityLog[] {
  seedCompanies();
  const r = companies.get(companyId);
  if (!r) return [];
  const rita = CRM_ACTORS["dev-admin"];
  const bruno = CRM_ACTORS["dev-gestor"];
  const carla = CRM_ACTORS["dev-membro"];
  const base: ActivityLog[] = [
    {
      id: `${companyId}-a1`,
      entityType: "company",
      entityId: companyId,
      actor: bruno,
      action: "created",
      before: null,
      after: null,
      createdAt: subDays(new Date(), 24).toISOString(),
    },
  ];
  if (r.ownerId) {
    base.push({
      id: `${companyId}-a2`,
      entityType: "company",
      entityId: companyId,
      actor: bruno,
      action: "assigned",
      field: "owner",
      before: null,
      after: ownerName(r.ownerId),
      createdAt: subDays(new Date(), 18).toISOString(),
    });
  }
  if (deriveClienteAtivo(r)) {
    base.push({
      id: `${companyId}-a3`,
      entityType: "company",
      entityId: companyId,
      actor: rita,
      action: "status_changed",
      field: "status",
      before: "Potencial",
      after: "Cliente ativo",
      createdAt: subDays(new Date(), 12).toISOString(),
    });
  }
  const lastInteraction = interactions
    .filter((i) => i.companyId === companyId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (lastInteraction) {
    base.push({
      id: `${companyId}-a4`,
      entityType: "company",
      entityId: companyId,
      actor: carla,
      action: "commented",
      before: null,
      after: null,
      createdAt: lastInteraction.occurredAt,
    });
  }
  return base;
}

// INTEGRATION-GAP: no backend endpoint for CRM comments/@mentions/attachments or
// a company activity feed — this wrapper is left on the mock collaboration
// client. The seeded activity keys off the mock company ids, so against real
// backend companies `seededCompanyActivity` returns [] and only live
// collaboration entries surface (graceful degradation).
export const crmCollaborationApi: CollaborationApi = {
  listDirectory: () => collaborationApi.listDirectory(),
  listComments: (t, id) => collaborationApi.listComments(t, id),
  createComment: (input: CreateCommentInput) => collaborationApi.createComment(input),
  updateComment: (input: UpdateCommentInput) => collaborationApi.updateComment(input),
  deleteComment: (id, requesterId) => collaborationApi.deleteComment(id, requesterId),
  restoreComment: (comment: Comment) => collaborationApi.restoreComment(comment),
  async listActivity(entityType, entityId) {
    const live = await collaborationApi.listActivity(entityType, entityId);
    if (entityType !== "company") return live;
    const merged = [...seededCompanyActivity(entityId), ...live];
    return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
