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
  type CreateProjectInput,
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
 * Public API
 * ------------------------------------------------------------------ */

export interface ProjectsApi {
  listProjects(role: Role, userId: string, paymentsGrant: boolean): Promise<ProjectListItem[]>;
  getProject(id: string, role: Role, userId: string, paymentsGrant: boolean): Promise<Project>;
  createProject(input: CreateProjectInput, actorId: string, canFinance: boolean): Promise<Project>;
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
    seed();
    await delay(MOCK_LATENCY_MS);
    const canFinance = canAccessFinance(role, paymentsGrant);
    return [...projects.values()]
      .filter((p) => visibleTo(p, role, userId))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"))
      .map((p) => presentList(p, canFinance));
  },

  async getProject(id, role, userId, paymentsGrant) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    // Membro not on the project is 404'd, never 403 (BR-002 — no existence leak).
    if (!visibleTo(rec, role, userId)) throw new ProjectError("not_found");
    return present(rec, canAccessFinance(role, paymentsGrant));
  },

  async createProject(input, actorId, canFinance) {
    seed();
    await delay(MOCK_LATENCY_MS);
    if (!input.name.trim()) throw new ProjectError("guard_failed", "nameRequired");
    const id = uid("p");
    const rec: Project = {
      id,
      name: input.name.trim(),
      clientId: input.clientId,
      clientName: input.clientName || input.clientId,
      managerId: input.managerId,
      managerName: userName(input.managerId),
      teamCount: 1,
      state: "planning",
      suggestedHealth: "healthy",
      publishedHealth: null,
      healthReason: null,
      healthUpdatedAt: null,
      healthUpdatedBy: null,
      progress: 0,
      startDate: input.startDate,
      dueDate: input.dueDate,
      contractedValueCents: canFinance ? input.contractedValueCents : null,
      hoursBudget: input.hoursBudget,
      hoursUsed: 0,
      nextDeliveryAt: null,
      description: input.description.trim(),
      team: [member(input.managerId, "Gestor de projeto")],
      phases: [],
      deliveryMilestones: [],
      attentionTasks: [],
      risks: [],
      pauseReason: null,
      cancelReason: null,
      paymentMilestonesConfirmed: false,
      opportunityId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projects.set(id, rec);
    pushActivity(id, actorId, "created");
    return present(rec, canFinance);
  },

  async transition(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    applyLifecycle(rec, input, actorId);
    return present(rec, true);
  },

  async restoreState(id, state, actorId) {
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
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    if (!isLiveState(rec.state))
      throw new ProjectError("invalid_transition", "healthNotLive");
    const differs = input.health !== rec.suggestedHealth;
    if (differs && !input.reason?.trim()) throw new ProjectError("reason_required");
    const before = effectiveHealth(rec);
    rec.publishedHealth = input.health;
    rec.healthReason = differs ? input.reason!.trim() : null;
    rec.healthUpdatedAt = new Date().toISOString();
    rec.healthUpdatedBy = actorId;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", {
      field: "health",
      before,
      after: input.health,
    });
    return present(rec, true);
  },

  async addPhase(id, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    if (!input.name.trim()) throw new ProjectError("guard_failed", "phaseNameRequired");
    const order = rec.phases.length + 1;
    rec.phases.push({
      id: uid(`${id}-ph`),
      projectId: id,
      name: input.name.trim(),
      order,
      state: "not_started",
      tasksTotal: 0,
      tasksDone: 0,
      dueDate: input.dueDate,
      blockerReason: null,
    });
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "updated", { field: "phase", after: input.name.trim() });
    return present(rec, true);
  },

  async updatePhase(id, phaseId, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    const ph = rec.phases.find((p) => p.id === phaseId);
    if (!ph) throw new ProjectError("not_found");
    if (!input.name.trim()) throw new ProjectError("guard_failed", "phaseNameRequired");
    ph.name = input.name.trim();
    ph.dueDate = input.dueDate;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "updated", { field: "phase", after: ph.name });
    return present(rec, true);
  },

  async removePhase(id, phaseId, actorId) {
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
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    const byId = new Map(rec.phases.map((p) => [p.id, p]));
    const next: ProjectPhase[] = [];
    orderedPhaseIds.forEach((pid, i) => {
      const ph = byId.get(pid);
      if (ph) next.push({ ...ph, order: i + 1 });
    });
    // Preserve any phase not in the ordered list (defensive).
    for (const ph of rec.phases) if (!orderedPhaseIds.includes(ph.id)) next.push(ph);
    rec.phases = next;
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "updated", { field: "phaseOrder" });
    return present(rec, true);
  },

  async transitionPhase(id, phaseId, input, actorId) {
    seed();
    await delay(MOCK_LATENCY_MS);
    const rec = requireProject(id);
    const ph = rec.phases.find((p) => p.id === phaseId);
    if (!ph) throw new ProjectError("not_found");
    applyPhaseTransition(ph, rec, input);
    rec.updatedAt = new Date().toISOString();
    pushActivity(id, actorId, "status_changed", {
      field: "phaseState",
      after: ph.state,
    });
    return present(rec, true);
  },

  async getProjectFinance(id, role, paymentsGrant) {
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
