/**
 * Team & workload API client — MOCK implementation (F13 / issue #37).
 *
 * Backend is not wired yet. This module exports a typed `teamApi` whose methods
 * return promises exactly as the real HTTP client will; the integration agent
 * replaces the bodies with real `fetch` calls WITHOUT changing the signatures.
 * UI code (via TanStack Query) depends only on the `TeamApi` interface and the
 * models in `./team-types`.
 *
 * Everything the view shows is DERIVED here so the UI never invents capacity
 * maths:
 *  - net delivery capacity (BR-080) = (gross − non-project) × role target,
 *  - availability state (BR-082) from allocated load ÷ net capacity,
 *  - utilization rate (BR-083) = billable ÷ available hours,
 *  - over-allocation (BR-084/AUTO-09) surfaced as `sobrecarregado`.
 *
 * The member directory, project membership and per-member load echo the ids in
 * `projects.ts` / `tasks.ts` / `time.ts` so cross-surfaces line up, but this
 * module keeps its own seed so it stays independent of those clients' internal
 * scoping. Per-function capacity config is a mutable module store so the Admin
 * inline editor persists for the session (integration swaps in Settings #42).
 */

import { addDays, format, startOfWeek } from "date-fns";
import type { Role } from "@/lib/session";
import {
  TeamError,
  canConfigureCapacity,
  canSeeFullTeam,
  deriveAvailability,
  netCapacityHours,
  type FunctionCapacityConfig,
  type HeatmapDay,
  type TeamFunction,
  type TeamMemberWorkload,
  type TeamWorkload,
  type UpdateFunctionConfigInput,
} from "./team-types";

const MOCK_LATENCY_MS = 320;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const teamRoutes = {
  list: () => "/team",
} as const;

/* ------------------------------------------------------------------ *
 * Per-function capacity config (Admin-configurable — BR-080/081)
 * ------------------------------------------------------------------ */

const DEFAULT_CONFIGS: Record<TeamFunction, FunctionCapacityConfig> = {
  engineering: {
    function: "engineering",
    weeklyCapacityHours: 40,
    nonProjectHours: 5,
    utilizationTarget: 0.78,
    internalCostRateCents: 55_00,
  },
  design: {
    function: "design",
    weeklyCapacityHours: 40,
    nonProjectHours: 5,
    utilizationTarget: 0.75,
    internalCostRateCents: 50_00,
  },
  qa: {
    function: "qa",
    weeklyCapacityHours: 40,
    nonProjectHours: 6,
    utilizationTarget: 0.72,
    internalCostRateCents: 45_00,
  },
  management: {
    function: "management",
    weeklyCapacityHours: 40,
    nonProjectHours: 12,
    utilizationTarget: 0.42,
    internalCostRateCents: 65_00,
  },
  leadership: {
    function: "leadership",
    weeklyCapacityHours: 40,
    nonProjectHours: 16,
    utilizationTarget: 0.35,
    internalCostRateCents: 70_00,
  },
};

const configStore = new Map<TeamFunction, FunctionCapacityConfig>();
let configSeeded = false;

function seedConfigs(): void {
  if (configSeeded) return;
  configSeeded = true;
  for (const fn of Object.keys(DEFAULT_CONFIGS) as TeamFunction[]) {
    configStore.set(fn, { ...DEFAULT_CONFIGS[fn] });
  }
}

function configFor(fn: TeamFunction): FunctionCapacityConfig {
  seedConfigs();
  return configStore.get(fn) ?? DEFAULT_CONFIGS[fn];
}

/* ------------------------------------------------------------------ *
 * Member seed (ids aligned with projects.ts / tasks.ts / time.ts)
 * ------------------------------------------------------------------ */

interface MemberSeed {
  userId: string;
  name: string;
  avatarUrl: string | null;
  function: TeamFunction;
  accessRole: Role;
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  /** Manual PTO for the week (BR-082 `ausente`). */
  away: boolean;
  awayNote: string | null;
  /** Allocated hours Mon–Fri (drives the heatmap + carga estimada). */
  dayHours: [number, number, number, number, number];
  /** Hours logged this week. */
  loggedHours: number;
  /** Billable share of the logged hours (BR-083). */
  billableHours: number;
}

const MEMBER_SEED: MemberSeed[] = [
  {
    userId: "dev-admin",
    name: "Rita Andrade",
    avatarUrl: null,
    function: "leadership",
    accessRole: "admin",
    activeProjects: 2,
    openTasks: 3,
    overdueTasks: 0,
    away: false,
    awayNote: null,
    // net ≈ (40−16)×0.35 = 8.4h → 5h allocated → ~0.60 → disponível
    dayHours: [1, 2, 1, 1, 0],
    loggedHours: 6,
    billableHours: 2,
  },
  {
    userId: "dev-gestor",
    name: "Bruno Salgado",
    avatarUrl: null,
    function: "management",
    accessRole: "gestor",
    activeProjects: 4,
    openTasks: 6,
    overdueTasks: 1,
    away: false,
    awayNote: null,
    // net ≈ (40−12)×0.42 = 11.76h → 11h → ~0.94 → equilibrado
    dayHours: [2, 3, 2, 2, 2],
    loggedHours: 12,
    billableHours: 7,
  },
  {
    userId: "dev-membro",
    name: "Carla Nunes",
    avatarUrl: null,
    function: "design",
    accessRole: "membro",
    activeProjects: 2,
    openTasks: 5,
    overdueTasks: 1,
    away: false,
    awayNote: null,
    // net ≈ (40−5)×0.75 = 26.25h → 25h → ~0.95 → equilibrado
    dayHours: [5, 6, 5, 5, 4],
    loggedHours: 24,
    billableHours: 20,
  },
  {
    userId: "u-sofia",
    name: "Sofia Marques",
    avatarUrl: null,
    function: "design",
    accessRole: "gestor",
    activeProjects: 3,
    openTasks: 7,
    overdueTasks: 0,
    away: false,
    awayNote: null,
    // net ≈ 26.25h → 24h → ~0.91 → equilibrado
    dayHours: [5, 5, 5, 5, 4],
    loggedHours: 26,
    billableHours: 22,
  },
  {
    userId: "u-diogo",
    name: "Diogo Ferreira",
    avatarUrl: null,
    function: "engineering",
    accessRole: "membro",
    activeProjects: 3,
    openTasks: 9,
    overdueTasks: 3,
    away: false,
    awayNote: null,
    // net ≈ (40−5)×0.78 = 27.3h → 33h → ~1.21 → SOBRECARREGADO
    dayHours: [7, 7, 6, 7, 6],
    loggedHours: 34,
    billableHours: 31,
  },
  {
    userId: "u-ines",
    name: "Inês Duarte",
    avatarUrl: null,
    function: "engineering",
    accessRole: "membro",
    activeProjects: 2,
    openTasks: 6,
    overdueTasks: 1,
    away: false,
    awayNote: null,
    // net ≈ 27.3h → 27h → ~0.99 → equilibrado
    dayHours: [6, 6, 5, 5, 5],
    loggedHours: 28,
    billableHours: 24,
  },
  {
    userId: "u-tiago",
    name: "Tiago Lopes",
    avatarUrl: null,
    function: "qa",
    accessRole: "membro",
    activeProjects: 1,
    openTasks: 2,
    overdueTasks: 0,
    away: true,
    awayNote: "Férias",
    // PTO — no allocation this week → ausente
    dayHours: [0, 0, 0, 0, 0],
    loggedHours: 0,
    billableHours: 0,
  },
];

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** ISO Monday of the week `weekOffset` weeks from today. */
function weekStartFor(weekOffset: number): Date {
  const base = addDays(new Date(), weekOffset * 7);
  return startOfWeek(base, { weekStartsOn: 1 });
}

/** Local-time ISO date. Avoids the UTC day-shift `toISOString()` causes in
 *  positive-offset zones (e.g. Lisbon +01), which would slide the Mon–Fri week
 *  back to Sun–Thu. */
function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function present(seed: MemberSeed, weekStart: Date): TeamMemberWorkload {
  const cfg = configFor(seed.function);
  const net = netCapacityHours(
    cfg.weeklyCapacityHours,
    cfg.nonProjectHours,
    cfg.utilizationTarget
  );

  const days: HeatmapDay[] = seed.dayHours.map((hours, index) => ({
    index,
    date: isoDay(addDays(weekStart, index)),
    allocatedHours: hours,
  }));

  const allocatedHours = seed.dayHours.reduce((s, h) => s + h, 0);
  const utilizationRatio = net > 0 ? allocatedHours / net : allocatedHours > 0 ? 2 : 0;
  const availableHours = net; // net delivery capacity is the available-for-billing base
  const billableUtilization =
    availableHours > 0 ? seed.billableHours / availableHours : 0;

  return {
    userId: seed.userId,
    name: seed.name,
    avatarUrl: seed.avatarUrl,
    function: seed.function,
    accessRole: seed.accessRole,
    availability: deriveAvailability(utilizationRatio, seed.away),
    awayNote: seed.away ? seed.awayNote : null,
    activeProjects: seed.activeProjects,
    openTasks: seed.openTasks,
    overdueTasks: seed.overdueTasks,
    allocatedHours,
    loggedHours: seed.loggedHours,
    billableHours: seed.billableHours,
    weeklyCapacityHours: cfg.weeklyCapacityHours,
    netCapacityHours: round1(net),
    utilizationRatio,
    billableUtilization,
    days,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface TeamApi {
  /**
   * Weekly team workload. Admin/Gestor get the whole team; a Membro gets ONLY
   * their own row (BR-002). Per-function config + cost rates are returned only
   * to callers that may configure them (Admin — matrix §9 / BR-069).
   */
  getTeamWorkload(
    role: Role,
    userId: string,
    weekOffset: number
  ): Promise<TeamWorkload>;
  /** Per-function capacity config (Admin-only). */
  getFunctionConfigs(role: Role): Promise<FunctionCapacityConfig[]>;
  /** Update one function's capacity config (Admin-only — BR-081). */
  updateFunctionConfig(
    role: Role,
    fn: TeamFunction,
    input: UpdateFunctionConfigInput
  ): Promise<FunctionCapacityConfig>;
}

export const teamApi: TeamApi = {
  async getTeamWorkload(role, userId, weekOffset) {
    seedConfigs();
    await delay(MOCK_LATENCY_MS);
    const weekStart = weekStartFor(weekOffset);
    const full = canSeeFullTeam(role);
    const canConfigure = canConfigureCapacity(role);

    const rows = MEMBER_SEED
      // Membro is row-scoped to their own load (BR-002 — no existence leak).
      .filter((m) => (full ? true : m.userId === userId))
      .map((m) => present(m, weekStart))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));

    return {
      weekStart: isoDay(weekStart),
      weekOffset,
      members: rows,
      configs: canConfigure
        ? (Object.keys(DEFAULT_CONFIGS) as TeamFunction[]).map((fn) => ({
            ...configFor(fn),
          }))
        : null,
      ownOnly: !full,
      canConfigure,
    };
  },

  async getFunctionConfigs(role) {
    seedConfigs();
    if (!canConfigureCapacity(role)) throw new TeamError("forbidden");
    await delay(MOCK_LATENCY_MS / 2);
    return (Object.keys(DEFAULT_CONFIGS) as TeamFunction[]).map((fn) => ({
      ...configFor(fn),
    }));
  },

  async updateFunctionConfig(role, fn, input) {
    seedConfigs();
    if (!canConfigureCapacity(role)) throw new TeamError("forbidden");
    await delay(MOCK_LATENCY_MS);

    if (input.weeklyCapacityHours <= 0 || input.weeklyCapacityHours > 168)
      throw new TeamError("validation", "capacityRange");
    if (input.nonProjectHours < 0 || input.nonProjectHours >= input.weeklyCapacityHours)
      throw new TeamError("validation", "nonProjectRange");
    if (input.utilizationTargetPct <= 0 || input.utilizationTargetPct > 100)
      throw new TeamError("validation", "targetRange");
    if (input.internalCostRateCents < 0)
      throw new TeamError("validation", "costRange");

    const next: FunctionCapacityConfig = {
      function: fn,
      weeklyCapacityHours: input.weeklyCapacityHours,
      nonProjectHours: input.nonProjectHours,
      utilizationTarget: input.utilizationTargetPct / 100,
      internalCostRateCents: input.internalCostRateCents,
    };
    configStore.set(fn, next);
    return { ...next };
  },
};

/** Reset helper for tests / stories — not used by the UI. */
export function __resetTeamConfigs(): void {
  configSeeded = false;
  configStore.clear();
}
