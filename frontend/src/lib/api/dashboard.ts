/**
 * Dashboard API client — MOCK implementation (F2).
 *
 * Backend is not wired yet. This module exports a typed `dashboardApi` whose
 * `getDashboard` returns a promise exactly as the real HTTP client will. The
 * integration agent replaces the body with a real `fetch` to FastAPI WITHOUT
 * changing the signature. UI code (via TanStack Query) depends only on the
 * `DashboardApi` interface below.
 *
 * The client itself enforces role scoping (BR-002/008): a Membro receives a
 * scoped payload (own tasks/projects, no financial metrics/charts/attention),
 * and financial surfaces are stripped for any user without finance access —
 * mirroring the backend contract so the UI never surfaces disallowed data.
 *
 * Attention items are the client-side rendering of the fixed automations
 * (WORKFLOW_SPEC §6.1). Data is relative to "today" so overdue / due-soon read
 * meaningfully whenever the app runs.
 */

import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import type { Role } from "@/lib/session";
import { canAccessFinance } from "@/lib/api/finance-types";
import {
  DashboardError,
  isScopedDashboard,
  type AttentionGroup,
  type DashboardCharts,
  type DashboardData,
  type DashboardMetric,
} from "./dashboard-types";

const MOCK_LATENCY_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDate(offsetDays: number): string {
  return format(addDays(startOfDay(new Date()), offsetDays), "yyyy-MM-dd");
}

/** Whole days until an ISO date from today (negative = past). */
function daysFromToday(iso: string): number {
  return differenceInCalendarDays(parseISO(iso), startOfDay(new Date()));
}

/* ------------------------------------------------------------------ *
 * Canonical record routes (the panel opens the source record).
 * These match the app's route map (nav-config.ts). Some destinations are
 * built by sibling issues; the dashboard links to the canonical URL regardless.
 * ------------------------------------------------------------------ */

export const recordRoutes = {
  task: (id: string) => `/tasks?task=${id}`,
  project: (id: string) => `/projects/${id}`,
  opportunity: (id: string) => `/crm/pipeline?opportunity=${id}`,
  proposal: (id: string) => `/crm/proposals?proposal=${id}`,
  member: (id: string) => `/team?member=${id}`,
  payment: (id: string) => `/finance?milestone=${id}`,
} as const;

/* ------------------------------------------------------------------ *
 * Seed fixtures (names reused from finance/my-work mocks for coherence)
 * ------------------------------------------------------------------ */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul"];

const PIPELINE = [42_000_00, 55_000_00, 48_000_00, 71_000_00, 66_000_00, 89_000_00, 104_000_00];

const CONTRACTED = [18_000_00, 22_000_00, 26_000_00, 24_000_00, 31_000_00, 28_000_00, 33_000_00];
const RECEIVED = [16_000_00, 19_000_00, 21_000_00, 25_000_00, 24_000_00, 27_000_00, 22_000_00];

const TASK_FLOW = [
  { week: "w1", done: 14, overdue: 2 },
  { week: "w2", done: 18, overdue: 3 },
  { week: "w3", done: 11, overdue: 5 },
  { week: "w4", done: 21, overdue: 4 },
  { week: "w5", done: 16, overdue: 6 },
  { week: "w6", done: 23, overdue: 7 },
];

const TEAM = [
  { memberId: "u-1", memberName: "Carla Nunes", allocationPct: 118 },
  { memberId: "u-2", memberName: "Diogo Ferreira", allocationPct: 94 },
  { memberId: "u-3", memberName: "Rita Andrade", allocationPct: 72 },
  { memberId: "u-4", memberName: "Bruno Salgado", allocationPct: 61 },
  { memberId: "u-5", memberName: "Sofia Marques", allocationPct: 45 },
];

/* ------------------------------------------------------------------ *
 * Attention groups (full — management view). AUTO-xx references map each
 * group to its feeding automation (WORKFLOW_SPEC §6.1).
 * ------------------------------------------------------------------ */

function fullAttention(): AttentionGroup[] {
  return [
    {
      key: "overdueTasks", // AUTO-01
      financial: false,
      items: [
        {
          id: "t-3",
          entityType: "task",
          entityId: "t-3",
          title: "Exportar assets do logótipo",
          metaKey: "overdueTask",
          metaParams: { project: "Rebranding — Adega Vale", days: -daysFromToday(isoDate(-2)) },
          severity: "overdue",
        },
        {
          id: "t-4",
          entityType: "task",
          entityId: "t-4",
          title: "Integrar gateway de pagamento",
          metaKey: "overdueTask",
          metaParams: { project: "App Fidelização — Lumina", days: -daysFromToday(isoDate(-1)) },
          severity: "overdue",
        },
      ],
    },
    {
      key: "blockedTasks", // AUTO-01 + BR-046
      financial: false,
      items: [
        {
          id: "t-4b",
          entityType: "task",
          entityId: "t-4",
          title: "Integrar gateway de pagamento",
          metaKey: "blockedTask",
          metaParams: { reason: "A aguardar credenciais do cliente" },
          severity: "blocked",
        },
      ],
    },
    {
      key: "projectsAtRisk", // AUTO-05
      financial: false,
      items: [
        {
          id: "p-3",
          entityType: "project",
          entityId: "p-3",
          title: "App Fidelização — Lumina",
          metaKey: "projectAtRisk",
          metaParams: { progress: 25 },
          severity: "atRisk",
        },
      ],
    },
    {
      key: "lowProgressNearDelivery", // AUTO-06
      financial: false,
      items: [
        {
          id: "p-1",
          entityType: "project",
          entityId: "p-1",
          title: "Website — Solar do Douro",
          metaKey: "lowProgressNearDelivery",
          metaParams: { days: daysFromToday(isoDate(2)), progress: 40 },
          severity: "due",
        },
      ],
    },
    {
      key: "opportunitiesNoNextAction", // AUTO-03
      financial: false,
      items: [
        {
          id: "o-1",
          entityType: "opportunity",
          entityId: "o-1",
          title: "App Fidelização — Lumina",
          metaKey: "opportunityNoNextAction",
          severity: "attention",
        },
        {
          id: "o-2",
          entityType: "opportunity",
          entityId: "o-2",
          title: "Portal B2B — Metalúrgica Norte",
          metaKey: "opportunityStale",
          metaParams: { days: 16 },
          severity: "attention",
        },
      ],
    },
    {
      key: "proposalsAwaiting", // AUTO-04
      financial: false,
      items: [
        {
          id: "pr-1",
          entityType: "proposal",
          entityId: "pr-1",
          title: "Portal Interno — Lumina",
          metaKey: "proposalExpiring",
          metaParams: { days: daysFromToday(isoDate(1)) },
          severity: "due",
        },
      ],
    },
    {
      key: "overloadedMembers", // AUTO-09
      financial: false,
      items: [
        {
          id: "u-1",
          entityType: "member",
          entityId: "u-1",
          title: "Carla Nunes",
          metaKey: "overloadedMember",
          metaParams: { alloc: 118 },
          severity: "attention",
        },
      ],
    },
    {
      key: "overduePayments", // AUTO-02 — FINANCIAL (gated)
      financial: true,
      items: [
        {
          id: "pm-3",
          entityType: "payment",
          entityId: "pm-3",
          title: "Manual de marca — Adega Vale",
          metaKey: "overduePayment",
          metaParams: { amount: "6.200 €", days: -daysFromToday(isoDate(-5)) },
          severity: "overdue",
        },
      ],
    },
  ];
}

/**
 * Scoped attention for a Membro (BR-002): only their own tasks (overdue +
 * blocked). No project-health, opportunity, proposal, workload or financial
 * items — those are management concerns.
 */
function scopedAttention(): AttentionGroup[] {
  return [
    {
      key: "overdueTasks",
      financial: false,
      items: [
        {
          id: "t-3",
          entityType: "task",
          entityId: "t-3",
          title: "Exportar assets do logótipo",
          metaKey: "overdueTask",
          metaParams: { project: "Rebranding — Adega Vale", days: 2 },
          severity: "overdue",
        },
      ],
    },
    {
      key: "blockedTasks",
      financial: false,
      items: [
        {
          id: "t-4",
          entityType: "task",
          entityId: "t-4",
          title: "Integrar gateway de pagamento",
          metaKey: "blockedTask",
          metaParams: { reason: "A aguardar credenciais do cliente" },
          severity: "blocked",
        },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

function fullMetrics(): DashboardMetric[] {
  return [
    { key: "openOpportunities", value: 12, format: "count", tone: "gold", financial: false, href: "/crm/pipeline" },
    // Pipeline value is commercial (expected value of open opportunities), NOT in
    // the BR-008 financial list (contracted/received/pending, margin, payment
    // milestones, cost rates). It stays visible to Gestor — consistent with the
    // pipeline-evolution chart, which shows to all management.
    { key: "pipelineValue", value: 104_000_00, format: "currencyCents", tone: "gold", financial: false, href: "/crm/pipeline" },
    { key: "activeProjects", value: 15, format: "count", tone: "neutral", financial: false, href: "/projects" },
    { key: "projectsAtRisk", value: 2, format: "count", tone: "destructive", financial: false, href: "/projects" },
    { key: "overdueTasks", value: 7, format: "count", tone: "destructive", financial: false, href: "/tasks" },
    { key: "deliveriesNext7Days", value: 4, format: "count", tone: "warning", financial: false, href: "/calendar" },
    { key: "pendingPayments", value: 38_200_00, format: "currencyCents", tone: "warning", financial: true, href: "/finance" },
    { key: "overduePayments", value: 6_200_00, format: "currencyCents", tone: "destructive", financial: true, href: "/finance" },
    { key: "teamLoad", value: 78, format: "percent", tone: "info", financial: false, href: "/team", detail: 1 },
  ];
}

/** Membro sees only their own counts — no financials, no team-wide load. */
function scopedMetrics(): DashboardMetric[] {
  return [
    { key: "activeProjects", value: 3, format: "count", tone: "neutral", financial: false, href: "/my-work" },
    { key: "overdueTasks", value: 1, format: "count", tone: "destructive", financial: false, href: "/my-work" },
    { key: "deliveriesNext7Days", value: 2, format: "count", tone: "warning", financial: false, href: "/calendar" },
  ];
}

/* ------------------------------------------------------------------ *
 * Charts
 * ------------------------------------------------------------------ */

function buildCharts(canFinance: boolean, scoped: boolean): DashboardCharts {
  const pipeline = MONTHS.map((month, i) => ({ month, valueCents: PIPELINE[i] }));
  const taskFlow = TASK_FLOW.map((p) => ({ ...p }));

  if (scoped) {
    // Membro: only their own task throughput; no pipeline/health/financial/team charts.
    return {
      pipeline: [],
      projectsByState: [],
      taskFlow,
      contractedReceived: null,
      teamLoad: [],
    };
  }

  return {
    pipeline,
    projectsByState: [
      {
        state: "healthy",
        count: 9,
        projects: [
          { id: "p-h1", name: "Manual de marca — Adega Vale" },
          { id: "p-h2", name: "Portal Interno — Lumina" },
          { id: "p-h3", name: "Campanha Verão — Solar do Douro" },
          { id: "p-h4", name: "Identidade Visual — Cais 21" },
          { id: "p-h5", name: "App Reservas — Termas Vale" },
          { id: "p-h6", name: "Catálogo Digital — Olaria Norte" },
          { id: "p-h7", name: "Newsletter — Adega Vale" },
          { id: "p-h8", name: "Dashboard BI — Metalúrgica Norte" },
          { id: "p-h9", name: "Site Institucional — Fundação Luz" },
        ],
      },
      {
        state: "attention",
        count: 4,
        projects: [
          { id: "p-a1", name: "Portal B2B — Metalúrgica Norte" },
          { id: "p-a2", name: "Website — Solar do Douro" },
          { id: "p-a3", name: "Rebranding — Adega Vale" },
          { id: "p-a4", name: "Loja Online — Herdade do Sobral" },
        ],
      },
      {
        state: "atRisk",
        count: 2,
        projects: [
          { id: "p-r1", name: "App Fidelização — Lumina" },
          { id: "p-r2", name: "Migração ERP — Metalúrgica Norte" },
        ],
      },
    ],
    taskFlow,
    contractedReceived: canFinance
      ? MONTHS.map((month, i) => ({
          month,
          contractedCents: CONTRACTED[i],
          receivedCents: RECEIVED[i],
        }))
      : null,
    teamLoad: TEAM.map((t) => ({ ...t })),
  };
}

/* ------------------------------------------------------------------ *
 * Scope + strip
 * ------------------------------------------------------------------ */

function stripFinancial<T extends { financial: boolean }>(items: T[], canFinance: boolean): T[] {
  return canFinance ? items : items.filter((i) => !i.financial);
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface DashboardApi {
  /**
   * The management overview, scoped to the resolved user (BR-002/008). Never
   * returns financial data to a user without finance access; returns a scoped
   * (own-work) payload for Membro.
   */
  getDashboard(userId: string, role: Role, paymentsGrant: boolean): Promise<DashboardData>;
}

export const dashboardApi: DashboardApi = {
  async getDashboard(_userId, role, paymentsGrant) {
    await delay(MOCK_LATENCY_MS);

    const canFinance = canAccessFinance(role, paymentsGrant);
    const scoped = isScopedDashboard(role);

    if (scoped) {
      return {
        canSeeFinancials: false,
        scoped: true,
        metrics: scopedMetrics(),
        attention: scopedAttention(),
        charts: buildCharts(false, true),
      };
    }

    return {
      canSeeFinancials: canFinance,
      scoped: false,
      metrics: stripFinancial(fullMetrics(), canFinance),
      attention: stripFinancial(fullAttention(), canFinance).filter((g) => g.items.length > 0),
      charts: buildCharts(canFinance, false),
    };
  },
};

/** Guard used by the (server) route to refuse a totally unauthenticated read. */
export function assertDashboardAccess(role: Role | undefined): void {
  if (!role) throw new DashboardError("forbidden", "No session.");
}
