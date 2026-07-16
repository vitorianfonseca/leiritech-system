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
  CrmError,
  isScopedCrm,
  type ArchiveBlocker,
  type CompanyDetail,
  type CompanyInput,
  type CompanySummary,
  type Contact,
  type FileRef,
  type Interaction,
  type InteractionInput,
  type MeetingRef,
  type OpportunityRef,
  type PaymentRef,
  type ProjectRef,
  type ProposalRef,
} from "./crm-types";

const MOCK_LATENCY_MS = 380;

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

function toSummary(r: CompanyRecord, canFinance: boolean): CompanySummary {
  return {
    id: r.id,
    name: r.name,
    logoUrl: r.logoUrl,
    status: r.status,
    sector: r.sector,
    website: r.website,
    email: r.email,
    phone: r.phone,
    address: r.address,
    ownerId: r.ownerId,
    ownerName: ownerName(r.ownerId),
    source: r.source,
    lastInteractionAt: r.lastInteractionAt,
    nextAction: r.nextAction,
    nextActionAt: r.nextActionAt,
    clienteAtivo: deriveClienteAtivo(r),
    openOpportunities: r.opportunities.filter((o) => o.open).length,
    activeProjects: r.projects.filter((p) => p.live).length,
    totalContractedCents: canFinance ? r.totalContractedCents : null,
    notesCount: r.files.length ? r.files.length : 0,
    attachmentsCount: r.files.length,
    archivedAt: r.archivedAt,
  };
}

function stripFinancialRefs<T extends { valueCents: number | null }>(
  refs: T[],
  canFinance: boolean
): T[] {
  return canFinance ? refs : refs.map((r) => ({ ...r, valueCents: null }));
}

/** Whether `record` is visible to `role`/`userId` (BR-002). */
function canView(record: CompanyRecord, role: Role, userId: string): boolean {
  if (!isScopedCrm(role)) return true;
  return record.memberIds.includes(userId);
}

/** Archive blockers for a company (BR-062/H6). */
function archiveBlockers(r: CompanyRecord): ArchiveBlocker[] {
  const blockers: ArchiveBlocker[] = [];
  for (const p of r.projects) {
    if (p.live) blockers.push({ kind: "liveProject", label: p.name });
  }
  for (const o of r.opportunities) {
    if (o.open) blockers.push({ kind: "openOpportunity", label: o.title });
    else if (o.wonUnconverted)
      blockers.push({ kind: "wonUnconvertedOpportunity", label: o.title });
  }
  return blockers;
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
  listInteractions(companyId: string): Promise<Interaction[]>;
  createInteraction(input: InteractionInput): Promise<Interaction>;
}

export const crmApi: CrmApi = {
  async listCompanies({ role, userId, paymentsGrant, includeArchived = false }) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const canFinance = canAccessFinance(role, paymentsGrant);
    return [...companies.values()]
      .filter((r) => canView(r, role, userId))
      .filter((r) => (includeArchived ? true : r.archivedAt === null))
      .map((r) => toSummary(r, canFinance))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
  },

  async getCompany(id, role, userId, paymentsGrant) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const r = companies.get(id);
    if (!r || !canView(r, role, userId)) throw new CrmError("not_found");
    const canFinance = canAccessFinance(role, paymentsGrant);
    return {
      ...toSummary(r, canFinance),
      description: r.description,
      contacts: r.contacts.filter((c) => c.archivedAt === null),
      opportunities: stripFinancialRefs(r.opportunities, canFinance),
      proposals: stripFinancialRefs(r.proposals, canFinance),
      projects: [...r.projects],
      meetings: [...r.meetings],
      files: [...r.files],
      payments: canFinance ? [...r.payments] : [],
      canSeeFinancials: canFinance,
    };
  },

  async createCompany(input) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const id = uid("c");
    const record: CompanyRecord = {
      id,
      name: input.name,
      logoUrl: null,
      status: input.status,
      sector: input.sector,
      website: input.website,
      email: input.email,
      phone: input.phone,
      address: input.address,
      ownerId: input.ownerId,
      source: input.source,
      description: input.description,
      lastInteractionAt: null,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
      totalContractedCents: 0,
      archivedAt: null,
      memberIds: [input.ownerId],
      contacts: [],
      opportunities: [],
      proposals: [],
      projects: [],
      meetings: [],
      files: [],
      payments: [],
    };
    companies.set(id, record);
    return toSummary(record, true);
  },

  async updateCompany(id, input) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const r = companies.get(id);
    if (!r) throw new CrmError("not_found");
    if (r.archivedAt) throw new CrmError("forbidden"); // BR-061 read-only
    Object.assign(r, {
      name: input.name,
      status: input.status,
      sector: input.sector,
      website: input.website,
      email: input.email,
      phone: input.phone,
      address: input.address,
      ownerId: input.ownerId,
      source: input.source,
      description: input.description,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
    });
    return toSummary(r, true);
  },

  async archiveCompany(id) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const r = companies.get(id);
    if (!r) throw new CrmError("not_found");
    const blockers = archiveBlockers(r);
    if (blockers.length > 0) throw new CrmError("archive_blocked", blockers);
    r.archivedAt = isoDate(0);
    r.status = "arquivada";
  },

  async restoreCompany(id) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const r = companies.get(id);
    if (!r) throw new CrmError("not_found");
    r.archivedAt = null;
    if (r.status === "arquivada") r.status = deriveClienteAtivo(r) ? "ativo" : "potencial";
  },

  async listContacts({ role, userId }) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const out: Contact[] = [];
    for (const r of companies.values()) {
      if (!canView(r, role, userId)) continue;
      if (r.archivedAt) continue;
      for (const c of r.contacts) if (c.archivedAt === null) out.push(c);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
  },

  async getContact(id, role, userId) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    for (const r of companies.values()) {
      const c = r.contacts.find((x) => x.id === id);
      if (c) {
        if (!canView(r, role, userId)) throw new CrmError("not_found");
        return {
          contact: c,
          interactions: interactions
            .filter((i) => i.contactId === id)
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        };
      }
    }
    throw new CrmError("not_found");
  },

  async listInteractions(companyId) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    return interactions
      .filter((i) => i.companyId === companyId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  },

  async createInteraction(input) {
    seedCompanies();
    await delay(MOCK_LATENCY_MS);
    const r = companies.get(input.companyId);
    const c = input.contactId
      ? r?.contacts.find((x) => x.id === input.contactId) ?? null
      : null;
    const opp = input.opportunityId
      ? r?.opportunities.find((x) => x.id === input.opportunityId) ?? null
      : null;
    const proj = input.projectId
      ? r?.projects.find((x) => x.id === input.projectId) ?? null
      : null;
    const created: Interaction = {
      id: uid("in"),
      companyId: input.companyId,
      contactId: input.contactId,
      contactName: c?.name ?? null,
      opportunityId: input.opportunityId,
      opportunityTitle: opp?.title ?? null,
      projectId: input.projectId,
      projectName: proj?.name ?? null,
      type: input.type,
      subject: input.subject,
      body: input.body,
      occurredAt: input.occurredAt,
      authorId: input.authorId,
      authorName: ownerName(input.authorId),
    };
    interactions.push(created);
    if (r) r.lastInteractionAt = created.occurredAt.slice(0, 10);
    return created;
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
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@aurea.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@aurea.pt", avatarUrl: null },
  "dev-membro": { id: "dev-membro", name: "Carla Nunes", email: "carla@aurea.pt", avatarUrl: null },
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
