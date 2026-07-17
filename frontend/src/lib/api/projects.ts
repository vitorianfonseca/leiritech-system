/**
 * Projects API client — MOCK implementation (F8).
 *
 * Backend is not wired yet. This module exports a typed `projectsApi` whose
 * methods return promises exactly as the real HTTP client will; the integration
 * agent replaces the bodies with real `fetch` calls WITHOUT changing the
 * signatures. UI code (via TanStack Query) depends only on the `ProjectsApi`
 * interface and the models in `./projects-types`.
 *
 * The client enforces:
 * - access + row scoping (BR-002 — Membro sees only member projects),
 * - financial gating (BR-008 — contracted value stripped without finance access;
 *   Financeiro payload refused),
 * - the project state machine (§1.3), health rules (§1.4, BR-030/031) and phase
 *   state machine (§1.5, BR-050/051).
 *
 * It references CRM companies (cliente) and the shared finance client (payment
 * milestones + costs + live margin, BR-065) so the Financeiro tab reuses a
 * single financial source of truth.
 */

import { addDays, subDays } from "date-fns";
import { http, HttpError } from "@/lib/api/http";
import type { Role } from "@/lib/session";
import {
  canAccessFinance,
  type FinancialSummary,
  type PaymentMilestone,
  type ProjectCost,
} from "@/lib/api/finance-types";
import { financeApi } from "@/lib/api/finance";
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
  ProjectError,
  effectiveHealth,
  isLiveState,
  type ConvertToProjectInput,
  type CreateProjectInput,
  type DeliveryMilestone,
  type DeliveryMilestoneStatus,
  type PhaseInput,
  type PhaseState,
  type PhaseTransitionInput,
  type Project,
  type ProjectFinance,
  type ProjectHealth,
  type ProjectListItem,
  type ProjectMember,
  type ProjectPhase,
  type ProjectState,
  type PublishHealthInput,
  type TransitionInput,
} from "./projects-types";

const MOCK_LATENCY_MS = 340;
/** Blended internal cost rate for the mock margin (BR-065). €45,00 / h. */
const INTERNAL_RATE_CENTS_PER_HOUR = 4500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function isoDate(offsetDays: number): string {
  return addDays(new Date(), offsetDays).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const projectRoutes = {
  list: () => "/projects",
  new: () => "/projects/new",
  detail: (id: string) => `/projects/${id}`,
} as const;

/* ------------------------------------------------------------------ *
 * Directory (aligned with the CRM + finance + session dev users)
 * ------------------------------------------------------------------ */

const DIRECTORY: Record<string, DirectoryUser> = {
  "dev-admin": { id: "dev-admin", name: "Rita Andrade", email: "rita@aurea.pt", avatarUrl: null },
  "dev-gestor": { id: "dev-gestor", name: "Bruno Salgado", email: "bruno@aurea.pt", avatarUrl: null },
  "dev-membro": { id: "dev-membro", name: "Carla Nunes", email: "carla@aurea.pt", avatarUrl: null },
  "u-sofia": { id: "u-sofia", name: "Sofia Marques", email: "sofia@aurea.pt", avatarUrl: null },
  "u-diogo": { id: "u-diogo", name: "Diogo Ferreira", email: "diogo@aurea.pt", avatarUrl: null },
  "u-tiago": { id: "u-tiago", name: "Tiago Lopes", email: "tiago@aurea.pt", avatarUrl: null },
  "u-ines": { id: "u-ines", name: "Inês Duarte", email: "ines@aurea.pt", avatarUrl: null },
};

function actor(id: string): DirectoryUser {
  return DIRECTORY[id] ?? { id, name: id, email: "", avatarUrl: null };
}
function userName(id: string): string {
  return actor(id).name;
}

/** Managers selectable in the create form. */
export const PROJECT_MANAGERS: { id: string; name: string }[] = [
  DIRECTORY["dev-admin"],
  DIRECTORY["dev-gestor"],
  DIRECTORY["u-sofia"],
  DIRECTORY["u-diogo"],
].map((u) => ({ id: u.id, name: u.name }));

function member(userId: string, roleLabel: string): ProjectMember {
  const u = actor(userId);
  return { userId, name: u.name, roleLabel, avatarUrl: u.avatarUrl };
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

const projects = new Map<string, Project>();
const activityByProject = new Map<string, ActivityLog[]>();

function pushActivity(
  projectId: string,
  actorId: string,
  action: ActivityLog["action"],
  extra: Partial<ActivityLog> = {}
): void {
  const list = activityByProject.get(projectId) ?? [];
  list.push({
    id: uid("pa"),
    entityType: "project",
    entityId: projectId,
    actor: actor(actorId),
    action,
    before: null,
    after: null,
    createdAt: new Date().toISOString(),
    ...extra,
  });
  activityByProject.set(projectId, list);
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

function phase(
  projectId: string,
  order: number,
  name: string,
  state: PhaseState,
  tasksTotal: number,
  tasksDone: number,
  dueDate: string | null,
  blockerReason: string | null = null
): ProjectPhase {
  return {
    id: `${projectId}-ph${order}`,
    projectId,
    name,
    order,
    state,
    tasksTotal,
    tasksDone,
    dueDate,
    blockerReason,
  };
}

function seed(): void {
  if (projects.size > 0) return;

  const nowIso = new Date().toISOString();

  const defs: Array<
    Omit<Project, "progress" | "teamCount" | "contractedValueCents"> & {
      contractedValueCents: number | null;
    }
  > = [
    {
      id: "p-1",
      name: "Rebranding + Manual de marca",
      clientId: "c-1",
      clientName: "Adega Vale",
      managerId: "dev-gestor",
      managerName: "Bruno Salgado",
      state: "active",
      suggestedHealth: "healthy",
      publishedHealth: "healthy",
      healthReason: null,
      healthUpdatedAt: subDays(new Date(), 4).toISOString(),
      healthUpdatedBy: "dev-gestor",
      startDate: isoDate(-30),
      dueDate: isoDate(35),
      hoursBudget: 320,
      hoursUsed: 168,
      contractedValueCents: 34_000_00,
      nextDeliveryAt: isoDate(9),
      description:
        "Renovação completa da identidade da Adega Vale: logótipo, sistema visual e manual de marca aplicado a rótulos e comunicação.",
      team: [
        member("dev-gestor", "Gestor de projeto"),
        member("dev-membro", "Designer"),
        member("u-tiago", "Diretor de arte"),
      ],
      phases: [
        phase("p-1", 1, "Descoberta e estratégia", "completed", 5, 5, isoDate(-18)),
        phase("p-1", 2, "Conceito visual", "in_progress", 4, 2, isoDate(8)),
        phase("p-1", 3, "Manual de marca", "not_started", 3, 0, isoDate(28)),
      ],
      deliveryMilestones: [
        { id: "p-1-dm1", projectId: "p-1", name: "Apresentação de conceito", dueDate: isoDate(9), status: "due_soon" },
        { id: "p-1-dm2", projectId: "p-1", name: "Entrega do manual", dueDate: isoDate(30), status: "upcoming" },
      ],
      attentionTasks: [
        {
          id: "p-1-t1",
          title: "Rever paleta cromática com cliente",
          phaseName: "Conceito visual",
          assigneeName: "Carla Nunes",
          dueDate: isoDate(-2),
          flag: "overdue",
        },
      ],
      risks: [
        { id: "p-1-r1", kind: "risk", text: "Cliente pode pedir uma segunda ronda de conceitos, comprimindo o prazo.", loggedAt: isoDate(-6) },
        { id: "p-1-r2", kind: "decision", text: "Optámos por serifa editorial para reforçar posicionamento premium.", loggedAt: isoDate(-10) },
        { id: "p-1-r3", kind: "next_step", text: "Agendar sessão de validação do conceito para a próxima semana.", loggedAt: isoDate(-1) },
      ],
      pauseReason: null,
      cancelReason: null,
      paymentMilestonesConfirmed: true,
      opportunityId: null,
      createdAt: subDays(new Date(), 34).toISOString(),
      updatedAt: nowIso,
    },
    {
      id: "p-2",
      name: "App Fidelização — Lumina",
      clientId: "c-2",
      clientName: "Lumina Retail",
      managerId: "dev-gestor",
      managerName: "Bruno Salgado",
      state: "active",
      suggestedHealth: "attention",
      publishedHealth: null, // no published health yet → suggested hint shown
      healthReason: null,
      healthUpdatedAt: null,
      healthUpdatedBy: null,
      startDate: isoDate(-22),
      dueDate: isoDate(48),
      hoursBudget: 540,
      hoursUsed: 214,
      contractedValueCents: 48_000_00,
      nextDeliveryAt: isoDate(4),
      description:
        "Aplicação móvel de fidelização com carteira de pontos, campanhas e integração com o retalho da Lumina.",
      team: [
        member("dev-gestor", "Gestor de projeto"),
        member("dev-membro", "Frontend"),
        member("u-ines", "Backend"),
        member("u-sofia", "UX"),
      ],
      phases: [
        // All non-archived tasks done but phase still in_progress → completion suggestion (BR-051).
        phase("p-2", 1, "Descoberta de produto", "in_progress", 6, 6, isoDate(-3)),
        phase("p-2", 2, "Design de interface", "in_progress", 8, 3, isoDate(10)),
        phase("p-2", 3, "Desenvolvimento", "not_started", 12, 0, isoDate(40)),
        phase("p-2", 4, "Lançamento", "not_started", 4, 0, isoDate(46)),
      ],
      deliveryMilestones: [
        { id: "p-2-dm1", projectId: "p-2", name: "Protótipo navegável", dueDate: isoDate(4), status: "due_soon" },
        { id: "p-2-dm2", projectId: "p-2", name: "Beta fechada", dueDate: isoDate(38), status: "upcoming" },
      ],
      attentionTasks: [
        {
          id: "p-2-t1",
          title: "Definir modelo de pontos",
          phaseName: "Design de interface",
          assigneeName: "Sofia Marques",
          dueDate: isoDate(-1),
          flag: "overdue",
        },
        {
          id: "p-2-t2",
          title: "Integração com API de retalho",
          phaseName: "Design de interface",
          assigneeName: "Inês Duarte",
          dueDate: isoDate(6),
          flag: "blocked",
        },
      ],
      risks: [
        { id: "p-2-r1", kind: "risk", text: "Dependência da API de retalho da Lumina ainda sem ambiente de testes.", loggedAt: isoDate(-4) },
        { id: "p-2-r2", kind: "next_step", text: "Confirmar acesso ao ambiente de integração com a equipa da Lumina.", loggedAt: isoDate(-2) },
      ],
      pauseReason: null,
      cancelReason: null,
      paymentMilestonesConfirmed: true,
      opportunityId: "o-2",
      createdAt: subDays(new Date(), 26).toISOString(),
      updatedAt: nowIso,
    },
    {
      id: "p-3",
      name: "Portal Interno — Lumina",
      clientId: "c-2",
      clientName: "Lumina Retail",
      managerId: "u-sofia",
      managerName: "Sofia Marques",
      state: "on_hold",
      suggestedHealth: "at_risk",
      publishedHealth: "attention", // override: human downgraded from red → amber with reason
      healthReason:
        "Bloqueio contratual em resolução com o cliente; risco mitigado enquanto aguardamos assinatura.",
      healthUpdatedAt: subDays(new Date(), 2).toISOString(),
      healthUpdatedBy: "u-sofia",
      startDate: isoDate(-40),
      dueDate: isoDate(20),
      hoursBudget: 400,
      hoursUsed: 322,
      contractedValueCents: 62_000_00,
      nextDeliveryAt: isoDate(-3),
      description:
        "Portal interno de gestão de equipas e processos para a Lumina Retail. Em pausa a aguardar validação contratual.",
      team: [
        member("u-sofia", "Gestora de projeto"),
        member("u-diogo", "Fullstack"),
        member("u-tiago", "QA"),
      ],
      phases: [
        phase("p-3", 1, "Levantamento de requisitos", "completed", 7, 7, isoDate(-30)),
        phase("p-3", 2, "Arquitetura", "completed", 5, 5, isoDate(-14)),
        phase("p-3", 3, "Desenvolvimento", "blocked", 15, 9, isoDate(-3), "A aguardar validação contratual do cliente."),
      ],
      deliveryMilestones: [
        { id: "p-3-dm1", projectId: "p-3", name: "Entrega do módulo de equipas", dueDate: isoDate(-3), status: "overdue" },
      ],
      attentionTasks: [
        {
          id: "p-3-t1",
          title: "Módulo de permissões",
          phaseName: "Desenvolvimento",
          assigneeName: "Diogo Ferreira",
          dueDate: isoDate(-5),
          flag: "blocked",
        },
      ],
      risks: [
        { id: "p-3-r1", kind: "risk", text: "Projeto acima de 80% do orçamento de horas com desenvolvimento por concluir.", loggedAt: isoDate(-3) },
        { id: "p-3-r2", kind: "decision", text: "Colocado em pausa até resolução contratual (decisão da gestão).", loggedAt: isoDate(-2) },
      ],
      pauseReason: "A aguardar validação contratual do cliente.",
      cancelReason: null,
      paymentMilestonesConfirmed: true,
      opportunityId: "o-3",
      createdAt: subDays(new Date(), 44).toISOString(),
      updatedAt: nowIso,
    },
    {
      id: "p-4",
      name: "Website + Reservas — Solar do Douro",
      clientId: "c-4",
      clientName: "Solar do Douro",
      managerId: "dev-gestor",
      managerName: "Bruno Salgado",
      state: "planning",
      suggestedHealth: "healthy",
      publishedHealth: null,
      healthReason: null,
      healthUpdatedAt: null,
      healthUpdatedBy: null,
      startDate: isoDate(2),
      dueDate: isoDate(70),
      hoursBudget: 260,
      hoursUsed: 0,
      contractedValueCents: 21_000_00,
      nextDeliveryAt: null,
      description:
        "Novo website institucional com sistema de reservas para o Solar do Douro. Em planeamento — a aguardar arranque.",
      team: [member("dev-gestor", "Gestor de projeto"), member("dev-membro", "Frontend")],
      phases: [
        phase("p-4", 1, "Planeamento", "not_started", 3, 0, isoDate(10)),
        phase("p-4", 2, "Design", "not_started", 5, 0, isoDate(30)),
      ],
      deliveryMilestones: [],
      attentionTasks: [],
      risks: [
        { id: "p-4-r1", kind: "next_step", text: "Confirmar marcos de pagamento antes de iniciar o projeto.", loggedAt: isoDate(-1) },
      ],
      pauseReason: null,
      cancelReason: null,
      paymentMilestonesConfirmed: false, // start guard exercises BR-037
      opportunityId: "o-5",
      createdAt: subDays(new Date(), 3).toISOString(),
      updatedAt: nowIso,
    },
    {
      id: "p-5",
      name: "Loja online — Verdejar Bio",
      clientId: "c-7",
      clientName: "Verdejar Bio",
      managerId: "dev-gestor",
      managerName: "Bruno Salgado",
      state: "completed",
      suggestedHealth: "healthy",
      publishedHealth: "healthy",
      healthReason: null,
      healthUpdatedAt: subDays(new Date(), 20).toISOString(),
      healthUpdatedBy: "dev-gestor",
      startDate: isoDate(-120),
      dueDate: isoDate(-15),
      hoursBudget: 300,
      hoursUsed: 288,
      contractedValueCents: 27_000_00,
      nextDeliveryAt: null,
      description:
        "Loja online de produtos biológicos, concluída e entregue. Projeto fechado.",
      team: [member("dev-gestor", "Gestor de projeto"), member("u-ines", "Backend")],
      phases: [
        phase("p-5", 1, "Descoberta", "completed", 4, 4, isoDate(-100)),
        phase("p-5", 2, "Desenvolvimento", "completed", 10, 10, isoDate(-40)),
        phase("p-5", 3, "Lançamento", "completed", 3, 3, isoDate(-16)),
      ],
      deliveryMilestones: [],
      attentionTasks: [],
      risks: [],
      pauseReason: null,
      cancelReason: null,
      paymentMilestonesConfirmed: true,
      opportunityId: "o-8",
      createdAt: subDays(new Date(), 124).toISOString(),
      updatedAt: subDays(new Date(), 15).toISOString(),
    },
    {
      id: "p-6",
      name: "Microsite institucional — Câmara de Alvorada",
      clientId: "c-8",
      clientName: "Câmara de Alvorada",
      managerId: "u-diogo",
      managerName: "Diogo Ferreira",
      state: "cancelled",
      suggestedHealth: "at_risk",
      publishedHealth: "at_risk",
      healthReason: null,
      healthUpdatedAt: subDays(new Date(), 30).toISOString(),
      healthUpdatedBy: "u-diogo",
      startDate: isoDate(-60),
      dueDate: isoDate(-20),
      hoursBudget: 120,
      hoursUsed: 40,
      contractedValueCents: 18_000_00,
      nextDeliveryAt: null,
      description:
        "Microsite institucional cancelado por adiamento do orçamento público do cliente.",
      team: [member("u-diogo", "Gestor de projeto")],
      phases: [phase("p-6", 1, "Planeamento", "in_progress", 3, 1, isoDate(-40))],
      deliveryMilestones: [],
      attentionTasks: [],
      risks: [
        { id: "p-6-r1", kind: "decision", text: "Projeto cancelado — orçamento público adiado para o próximo ano fiscal.", loggedAt: isoDate(-30) },
      ],
      pauseReason: null,
      cancelReason: "Orçamento público do cliente adiado para o próximo ano fiscal.",
      paymentMilestonesConfirmed: true,
      opportunityId: "o-9",
      createdAt: subDays(new Date(), 64).toISOString(),
      updatedAt: subDays(new Date(), 30).toISOString(),
    },
  ];

  for (const def of defs) {
    const full: Project = {
      ...def,
      teamCount: def.team.length,
      progress: 0, // recomputed by present()
    };
    projects.set(full.id, full);
    activityByProject.set(full.id, [
      {
        id: `${full.id}-a1`,
        entityType: "project",
        entityId: full.id,
        actor: actor(full.managerId),
        action: "created",
        createdAt: full.createdAt,
      },
    ]);
  }
}

/* ------------------------------------------------------------------ *
 * Derivations
 * ------------------------------------------------------------------ */

/** Overall progress from non-archived phase tasks (BR-050). */
function deriveProgress(phases: ProjectPhase[]): number {
  const total = phases.reduce((s, p) => s + p.tasksTotal, 0);
  if (total === 0) return 0;
  const done = phases.reduce((s, p) => s + p.tasksDone, 0);
  return Math.round((done / total) * 100);
}

/** A phase whose non-archived tasks are all done but is not yet completed (BR-051). */
export function phaseCompletable(p: ProjectPhase): boolean {
  return (
    (p.state === "in_progress" || p.state === "blocked") &&
    p.tasksTotal > 0 &&
    p.tasksDone >= p.tasksTotal
  );
}

function isMember(p: Project, userId: string): boolean {
  return p.managerId === userId || p.team.some((m) => m.userId === userId);
}

/** Membro is row-scoped (BR-002). */
function visibleTo(p: Project, role: Role, userId: string): boolean {
  if (role === "admin" || role === "gestor") return true;
  return isMember(p, userId);
}

function presentList(p: Project, canFinance: boolean): ProjectListItem {
  return {
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    clientName: p.clientName,
    managerId: p.managerId,
    managerName: p.managerName,
    teamCount: p.team.length,
    state: p.state,
    suggestedHealth: p.suggestedHealth,
    publishedHealth: p.publishedHealth,
    progress: deriveProgress(p.phases),
    startDate: p.startDate,
    dueDate: p.dueDate,
    contractedValueCents: canFinance ? p.contractedValueCents : null,
    hoursBudget: p.hoursBudget,
    hoursUsed: p.hoursUsed,
    nextDeliveryAt: p.nextDeliveryAt,
  };
}

function present(p: Project, canFinance: boolean): Project {
  return {
    ...p,
    teamCount: p.team.length,
    progress: deriveProgress(p.phases),
    contractedValueCents: canFinance ? p.contractedValueCents : null,
    // Deep-ish copy so callers cannot mutate the store.
    team: p.team.map((m) => ({ ...m })),
    phases: p.phases.map((ph) => ({ ...ph })),
    deliveryMilestones: p.deliveryMilestones.map((d) => ({ ...d })),
    attentionTasks: p.attentionTasks.map((t) => ({ ...t })),
    risks: p.risks.map((r) => ({ ...r })),
  };
}

/* ------------------------------------------------------------------ *
 * Transition guards (§1.3)
 * ------------------------------------------------------------------ */

function applyLifecycle(p: Project, input: TransitionInput, actorId: string): void {
  const { action, reason } = input;
  switch (action) {
    case "start": {
      if (p.state !== "planning")
        throw new ProjectError("invalid_transition", "startNotPlanning");
      if (p.phases.length < 1 || p.team.length < 1)
        throw new ProjectError("guard_failed", "startNeedsPhaseAndMember");
      if (!p.paymentMilestonesConfirmed)
        throw new ProjectError("guard_failed", "startNeedsMilestones");
      p.state = "active";
      break;
    }
    case "pause": {
      if (p.state !== "active")
        throw new ProjectError("invalid_transition", "pauseNotActive");
      if (!reason?.trim()) throw new ProjectError("reason_required");
      p.state = "on_hold";
      p.pauseReason = reason.trim();
      break;
    }
    case "resume": {
      if (p.state !== "on_hold")
        throw new ProjectError("invalid_transition", "resumeNotOnHold");
      p.state = "active";
      p.pauseReason = null;
      break;
    }
    case "complete": {
      if (p.state !== "active" && p.state !== "on_hold")
        throw new ProjectError("invalid_transition", "completeNotActive");
      const openPhases = p.phases.filter((ph) => ph.state !== "completed");
      if (openPhases.length > 0)
        throw new ProjectError("guard_failed", "completeOpenPhases");
      p.state = "completed";
      break;
    }
    case "cancel": {
      if (!isLiveState(p.state))
        throw new ProjectError("invalid_transition", "cancelNotLive");
      if (!reason?.trim()) throw new ProjectError("reason_required");
      p.state = "cancelled";
      p.cancelReason = reason.trim();
      break;
    }
    case "archive": {
      if (p.state !== "completed" && p.state !== "cancelled")
        throw new ProjectError("invalid_transition", "archiveNotClosed");
      p.state = "archived";
      break;
    }
    default:
      throw new ProjectError("invalid_transition");
  }
  p.updatedAt = new Date().toISOString();
  pushActivity(p.id, actorId, "status_changed", { field: "state", after: p.state });
}

function applyPhaseTransition(
  ph: ProjectPhase,
  project: Project,
  input: PhaseTransitionInput
): void {
  const { transition, reason } = input;
  switch (transition) {
    case "start": {
      if (ph.state !== "not_started")
        throw new ProjectError("invalid_transition", "phaseStartInvalid");
      if (project.state !== "active")
        throw new ProjectError("guard_failed", "phaseNeedsActiveProject");
      ph.state = "in_progress";
      break;
    }
    case "block": {
      if (ph.state !== "in_progress")
        throw new ProjectError("invalid_transition", "phaseBlockInvalid");
      if (!reason?.trim()) throw new ProjectError("reason_required");
      ph.state = "blocked";
      ph.blockerReason = reason.trim();
      break;
    }
    case "unblock": {
      if (ph.state !== "blocked")
        throw new ProjectError("invalid_transition", "phaseUnblockInvalid");
      ph.state = "in_progress";
      ph.blockerReason = null;
      break;
    }
    case "complete": {
      if (ph.state !== "in_progress" && ph.state !== "blocked")
        throw new ProjectError("invalid_transition", "phaseCompleteInvalid");
      if (ph.tasksTotal > 0 && ph.tasksDone < ph.tasksTotal)
        throw new ProjectError("guard_failed", "phaseOpenTasks");
      ph.state = "completed";
      ph.blockerReason = null;
      break;
    }
    case "reopen": {
      if (ph.state !== "completed")
        throw new ProjectError("invalid_transition", "phaseReopenInvalid");
      if (project.state === "completed")
        throw new ProjectError("guard_failed", "phaseReopenProjectClosed");
      ph.state = "in_progress";
      break;
    }
    default:
      throw new ProjectError("invalid_transition");
  }
}

/* ------------------------------------------------------------------ *
 * Backend integration (F8/F10 real HTTP wiring)
 *
 * The shared `http` client deep-converts snake_case↔camelCase, so the shapes
 * below are the camelCase mirror of the FastAPI Pydantic responses.
 * ------------------------------------------------------------------ */

interface ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiProject {
  id: string;
  name: string;
  companyId: string | null;
  opportunityId: string | null;
  acceptedProposalId: string | null;
  managerId: string | null;
  description: string | null;
  startDate: string | null;
  deadline: string | null;
  contractedValue: number | null;
  hoursBudget: number | null;
  internalCostRate: number | null;
  status: string;
  suggestedHealth: string | null;
  publishedHealth: string | null;
  healthReason: string | null;
  healthPublishedAt: string | null;
  healthPublishedBy: string | null;
  statusReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiPhase {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  startDate: string | null;
  deadline: string | null;
  orderIndex: number;
  progress: number;
  finalMilestoneId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiMember {
  id: string;
  projectId: string;
  userId: string;
  roleInProject: string | null;
}

interface ApiMilestone {
  id: string;
  projectId: string;
  phaseId: string | null;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Translate the shared HttpError envelope into the file's typed ProjectError. */
function mapProjectError(err: unknown): ProjectError {
  if (err instanceof ProjectError) return err;
  if (err instanceof HttpError) {
    if (err.status === 404) return new ProjectError("not_found");
    if (err.status === 403) return new ProjectError("forbidden");
    if (err.status === 409) return new ProjectError("invalid_transition");
    if (err.status === 400 || err.status === 422)
      return new ProjectError("guard_failed");
    if (err.status === 0 || err.code === "NETWORK")
      return new ProjectError("network");
  }
  return new ProjectError("network");
}

function asHealth(v: string | null | undefined): ProjectHealth {
  return v === "attention" || v === "at_risk" ? v : "healthy";
}

/** Map a backend phase to the frontend ProjectPhase shape. */
function mapPhase(ph: ApiPhase): ProjectPhase {
  return {
    id: ph.id,
    projectId: ph.projectId,
    name: ph.name,
    order: ph.orderIndex + 1,
    state: ph.status as PhaseState,
    // INTEGRATION-GAP: tasksTotal/tasksDone — backend exposes a phase progress
    // percentage (mapped into project.progress) but no per-task counts (#34).
    tasksTotal: 0,
    tasksDone: 0,
    dueDate: ph.deadline,
    // INTEGRATION-GAP: blockerReason — not returned by the phase endpoint.
    blockerReason: null,
  };
}

const DELIVERY_STATUS_BY_MILESTONE: Record<string, DeliveryMilestoneStatus> = {
  pending: "upcoming",
  achieved: "met",
  missed: "overdue",
  cancelled: "upcoming",
};

/** Map a backend milestone to the frontend DeliveryMilestone shape. */
function mapDeliveryMilestone(m: ApiMilestone): DeliveryMilestone {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    dueDate: m.dueDate ?? "",
    status: DELIVERY_STATUS_BY_MILESTONE[m.status] ?? "upcoming",
  };
}

function mapMember(m: ApiMember): ProjectMember {
  return {
    userId: m.userId,
    // INTEGRATION-GAP: name/avatarUrl — members endpoint returns only user_id.
    name: m.userId,
    roleLabel: m.roleInProject ?? "",
    avatarUrl: null,
  };
}

/** Base list projection — the shared fields available from a bare project row. */
function mapListItem(p: ApiProject, teamCount: number, progress: number): ProjectListItem {
  return {
    id: p.id,
    // INTEGRATION-GAP: clientId/clientName — backend returns company_id only; the
    // company display name is not joined into the project payload.
    clientId: p.companyId ?? "",
    clientName: "",
    name: p.name,
    managerId: p.managerId ?? "",
    // INTEGRATION-GAP: managerName — backend returns manager_id only (no join).
    managerName: "",
    teamCount,
    state: p.status as ProjectState,
    suggestedHealth: asHealth(p.suggestedHealth),
    publishedHealth: p.publishedHealth ? asHealth(p.publishedHealth) : null,
    progress,
    startDate: p.startDate ?? "",
    dueDate: p.deadline ?? "",
    // Backend may already null contracted_value for a non-finance caller (BR-008).
    contractedValueCents: p.contractedValue,
    hoursBudget: p.hoursBudget ?? 0,
    // INTEGRATION-GAP: hoursUsed — time tracking (#34) not aggregated by backend.
    hoursUsed: 0,
    nextDeliveryAt: null,
  };
}

/** Average of real per-phase progress (BR-050 rollup the backend doesn't compute). */
function progressFromPhases(phases: ApiPhase[]): number {
  if (phases.length === 0) return 0;
  const sum = phases.reduce((s, ph) => s + (ph.progress ?? 0), 0);
  return Math.round(sum / phases.length);
}

/** Earliest still-open delivery milestone date, or null. */
function nextDelivery(milestones: DeliveryMilestone[]): string | null {
  const open = milestones
    .filter((m) => m.status !== "met" && m.dueDate)
    .map((m) => m.dueDate)
    .sort((a, b) => a.localeCompare(b));
  return open[0] ?? null;
}

function mapProject(
  p: ApiProject,
  members: ApiMember[],
  phases: ApiPhase[],
  milestones: ApiMilestone[]
): Project {
  const deliveryMilestones = milestones.map(mapDeliveryMilestone);
  const base = mapListItem(p, members.length, progressFromPhases(phases));
  base.nextDeliveryAt = nextDelivery(deliveryMilestones);
  return {
    ...base,
    description: p.description ?? "",
    team: members.map(mapMember),
    phases: phases
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(mapPhase),
    deliveryMilestones,
    // INTEGRATION-GAP: attentionTasks — real tasks (#34) not exposed here.
    attentionTasks: [],
    // INTEGRATION-GAP: risks — no risk/decision log backend endpoint.
    risks: [],
    healthReason: p.healthReason,
    healthUpdatedAt: p.healthPublishedAt,
    healthUpdatedBy: p.healthPublishedBy,
    pauseReason: p.status === "on_hold" ? p.statusReason : null,
    cancelReason: p.status === "cancelled" ? p.statusReason : null,
    // INTEGRATION-GAP: paymentMilestonesConfirmed — not tracked on the project row.
    paymentMilestonesConfirmed: false,
    opportunityId: p.opportunityId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Fetch a project plus its members / phases / milestones and project it. */
async function fetchFullProject(id: string): Promise<Project> {
  const [p, members, phases, milestones] = await Promise.all([
    http.get<ApiProject>(`/projects/${id}`),
    http.get<ApiMember[]>(`/projects/${id}/members`).catch(() => [] as ApiMember[]),
    http.get<ApiPhase[]>(`/phases`, { query: { project_id: id } }).catch(() => [] as ApiPhase[]),
    http
      .get<ApiMilestone[]>(`/milestones`, { query: { project_id: id } })
      .catch(() => [] as ApiMilestone[]),
  ]);
  return mapProject(p, members, phases, milestones);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface ProjectsApi {
  listProjects(role: Role, userId: string, paymentsGrant: boolean): Promise<ProjectListItem[]>;
  getProject(id: string, role: Role, userId: string, paymentsGrant: boolean): Promise<Project>;
  createProject(input: CreateProjectInput, actorId: string, canFinance: boolean): Promise<Project>;
  /**
   * Won → project conversion (#31, BR-035). Instantiates the project from a
   * template with team + phases, links the source opportunity/proposal (BR-036)
   * and records payment-milestone confirmation (BR-037). The confirmed payment
   * milestones themselves are seeded by the caller via the finance API.
   */
  convertOpportunity(
    input: ConvertToProjectInput,
    actorId: string,
    canFinance: boolean
  ): Promise<Project>;
  transition(id: string, input: TransitionInput, actorId: string): Promise<Project>;
  /** Undo-only: revert a project to a prior lifecycle state (bypasses guards). */
  restoreState(id: string, state: ProjectState, actorId: string): Promise<Project>;
  publishHealth(id: string, input: PublishHealthInput, actorId: string): Promise<Project>;
  addPhase(id: string, input: PhaseInput, actorId: string): Promise<Project>;
  updatePhase(id: string, phaseId: string, input: PhaseInput, actorId: string): Promise<Project>;
  removePhase(id: string, phaseId: string, actorId: string): Promise<Project>;
  reorderPhases(id: string, orderedPhaseIds: string[], actorId: string): Promise<Project>;
  transitionPhase(id: string, phaseId: string, input: PhaseTransitionInput, actorId: string): Promise<Project>;
  /** Financeiro tab payload — refused without finance access (BR-008). */
  getProjectFinance(id: string, role: Role, paymentsGrant: boolean): Promise<ProjectFinance>;
}

function requireProject(id: string): Project {
  const rec = projects.get(id);
  if (!rec) throw new ProjectError("not_found");
  return rec;
}

export const projectsApi: ProjectsApi = {
  async listProjects(role, userId, paymentsGrant) {
    // Backend scopes rows (BR-002) and nulls finance fields (BR-008) via the JWT.
    void role;
    void userId;
    void paymentsGrant;
    try {
      const page = await http.get<ApiPage<ApiProject>>("/projects", {
        query: { page_size: 100, include_archived: true },
      });
      // INTEGRATION-GAP: teamCount/progress — the list endpoint returns bare
      // project rows; members + phase rollups would cost one call per project,
      // so both default to 0 here (enriched on the detail fetch).
      return page.items.map((p) => mapListItem(p, 0, 0));
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async getProject(id, role, userId, paymentsGrant) {
    // Membro not on the project is 404'd server-side (BR-002 — no existence leak).
    void role;
    void userId;
    void paymentsGrant;
    try {
      return await fetchFullProject(id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async createProject(input, actorId, canFinance) {
    void actorId;
    if (!input.name.trim()) throw new ProjectError("guard_failed", "nameRequired");
    try {
      const created = await http.post<ApiProject>("/projects", {
        name: input.name.trim(),
        companyId: input.clientId || null,
        managerId: input.managerId || null,
        description: input.description.trim() || null,
        startDate: input.startDate || null,
        deadline: input.dueDate || null,
        // Finance gate (BR-008): a non-finance creator never sends a value.
        contractedValue: canFinance ? input.contractedValueCents : null,
        hoursBudget: input.hoursBudget,
      });
      return await fetchFullProject(created.id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async convertOpportunity(input, actorId, canFinance) {
    void actorId;
    if (!input.name.trim()) throw new ProjectError("guard_failed", "nameRequired");
    try {
      const created = await http.post<ApiProject>("/projects/from-opportunity", {
        opportunityId: input.opportunityId,
        name: input.name.trim(),
        managerId: input.managerId || null,
        startDate: input.startDate || null,
        deadline: input.dueDate || null,
        contractedValue: canFinance ? input.contractedValueCents : null,
      });
      // Extra members beyond the manager the service auto-adds (best effort).
      for (const memberId of input.teamMemberIds) {
        if (memberId && memberId !== input.managerId) {
          await http
            .post(`/projects/${created.id}/members`, {
              userId: memberId,
              roleInProject: "contributor",
            })
            .catch(() => undefined);
        }
      }
      // Template-instantiated phases: /from-opportunity does not accept an inline
      // phase list, so create each explicitly (order preserved).
      let order = 0;
      for (const ph of input.phases) {
        await http
          .post(`/phases`, {
            projectId: created.id,
            name: ph.name.trim(),
            deadline: ph.dueDate,
            orderIndex: order,
          })
          .catch(() => undefined);
        order += 1;
      }
      // INTEGRATION-GAP: proposalId / paymentMilestonesConfirmed (BR-037) — the
      // from-opportunity endpoint does not accept or persist these.
      return await fetchFullProject(created.id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async transition(id, input, actorId) {
    void actorId;
    // Preserve the mock's typed reason guard (§1.3) for a crisp UI message.
    if (
      (input.action === "pause" || input.action === "cancel") &&
      !input.reason?.trim()
    )
      throw new ProjectError("reason_required");
    try {
      await http.post<ApiProject>(
        `/projects/${id}/${input.action}`,
        input.reason ? { reason: input.reason.trim() } : {}
      );
      return await fetchFullProject(id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async restoreState(id, state, actorId) {
    // INTEGRATION-GAP: no backend endpoint — arbitrary guard-bypassing state
    // revert (undo) is not exposed; left on the in-memory mock.
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    rec.state = state;
    if (state !== "cancelled") rec.cancelReason = null;
    if (state === "active") rec.pauseReason = null;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "restored", { field: "state", after: state });
    return present(rec, true);
  },

  async publishHealth(id, input, actorId) {
    void actorId;
    try {
      await http.post<ApiProject>(`/projects/${id}/health`, {
        health: input.health,
        reason: input.reason?.trim() || null,
      });
      return await fetchFullProject(id);
    } catch (err) {
      // The dominant 422 on this route is a missing override reason (BR-031).
      if (err instanceof HttpError && err.status === 422)
        throw new ProjectError("reason_required");
      throw mapProjectError(err);
    }
  },

  async addPhase(id, input, actorId) {
    void actorId;
    if (!input.name.trim())
      throw new ProjectError("guard_failed", "phaseNameRequired");
    try {
      const existing = await http
        .get<ApiPhase[]>(`/phases`, { query: { project_id: id } })
        .catch(() => [] as ApiPhase[]);
      await http.post<ApiPhase>(`/phases`, {
        projectId: id,
        name: input.name.trim(),
        deadline: input.dueDate,
        orderIndex: existing.length,
      });
      return await fetchFullProject(id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async updatePhase(id, phaseId, input, actorId) {
    void actorId;
    if (!input.name.trim())
      throw new ProjectError("guard_failed", "phaseNameRequired");
    try {
      await http.patch<ApiPhase>(`/phases/${phaseId}`, {
        name: input.name.trim(),
        deadline: input.dueDate,
      });
      return await fetchFullProject(id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async removePhase(id, phaseId, actorId) {
    // INTEGRATION-GAP: no backend endpoint — DELETE /phases/{id} does not exist;
    // phase removal is left on the in-memory mock.
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    rec.phases = rec.phases
      .filter((p) => p.id !== phaseId)
      .map((p, i) => ({ ...p, order: i + 1 }));
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "updated", { field: "phase" });
    return present(rec, true);
  },

  async reorderPhases(id, orderedPhaseIds, actorId) {
    void actorId;
    try {
      // No bulk reorder endpoint — persist each new order_index via PATCH.
      await Promise.all(
        orderedPhaseIds.map((pid, i) =>
          http
            .patch<ApiPhase>(`/phases/${pid}`, { orderIndex: i })
            .catch(() => undefined)
        )
      );
      return await fetchFullProject(id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async transitionPhase(id, phaseId, input, actorId) {
    void actorId;
    if (input.transition === "block" && !input.reason?.trim())
      throw new ProjectError("reason_required");
    try {
      if (input.transition === "complete") {
        // Completion enforces the "all tasks done" guard server-side (BR-051).
        await http.post<ApiPhase>(`/phases/${phaseId}/complete`, {});
      } else {
        // start / unblock / reopen all target in_progress; block → blocked.
        // INTEGRATION-GAP: blockerReason — the transition endpoint accepts only a
        // target status, so the block reason is not persisted.
        const status = input.transition === "block" ? "blocked" : "in_progress";
        await http.post<ApiPhase>(`/phases/${phaseId}/transition`, { status });
      }
      return await fetchFullProject(id);
    } catch (err) {
      throw mapProjectError(err);
    }
  },

  async getProjectFinance(id, role, paymentsGrant) {
    // INTEGRATION-GAP: no backend endpoint — there is no per-project finance
    // rollup route; the Financeiro tab reuses the (separate) finance client and
    // the live-margin computation below (BR-065), left on the mock source.
    seed();
    if (!canAccessFinance(role, paymentsGrant)) throw new ProjectError("forbidden");
    const rec = requireProject(id);
    // Reuse the single finance source (BR-065 live margin), scoped to this project.
    const overview = await financeApi.getOverview(role, paymentsGrant);
    const milestones = overview.milestones.filter((m) => m.projectId === id);
    const costs = overview.costs.filter((c) => c.projectId === id);
    const summary = computeProjectSummary(rec, milestones, costs);
    return { projectId: id, summary, milestones, costs };
  },
};

/** Live per-project margin (BR-065): contracted − costs − time cost. */
function computeProjectSummary(
  p: Project,
  milestones: PaymentMilestone[],
  costs: ProjectCost[]
): FinancialSummary {
  const contractedCents = milestones
    .filter((m) => m.status !== "cancelled")
    .reduce((s, m) => s + m.amountCents, 0);
  const receivedCents = milestones.reduce((s, m) => s + m.receivedAmountCents, 0);
  const pendingCents = Math.max(0, contractedCents - receivedCents);
  const costsCents = costs.reduce((s, c) => s + c.amountCents, 0);
  const timeCostCents = p.hoursUsed * INTERNAL_RATE_CENTS_PER_HOUR;
  const marginCents = contractedCents - costsCents - timeCostCents;
  const marginRatio = contractedCents > 0 ? marginCents / contractedCents : 0;
  return {
    contractedCents,
    receivedCents,
    pendingCents,
    costsCents,
    timeCostCents,
    marginCents,
    marginRatio,
  };
}

/* ------------------------------------------------------------------ *
 * Collaboration API for the project Atividade tab (#40). Merges the live
 * project activity (lifecycle/health/phase changes) with the shared
 * collaboration store, exactly like the opportunity feed.
 * ------------------------------------------------------------------ */

export const projectCollaborationApi: CollaborationApi = {
  listDirectory: () => collaborationApi.listDirectory(),
  listComments: (t, id) => collaborationApi.listComments(t, id),
  createComment: (input: CreateCommentInput) => collaborationApi.createComment(input),
  updateComment: (input: UpdateCommentInput) => collaborationApi.updateComment(input),
  deleteComment: (id, requesterId) => collaborationApi.deleteComment(id, requesterId),
  restoreComment: (comment: Comment) => collaborationApi.restoreComment(comment),
  async listActivity(entityType, entityId) {
    const live = await collaborationApi.listActivity(entityType, entityId);
    if (entityType !== "project") return live;
    seed();
    const seeded = activityByProject.get(entityId) ?? [];
    return [...seeded, ...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

/** Re-export for convenience so views import health helper from one place. */
export type { ProjectHealth };
