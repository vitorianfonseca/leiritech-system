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
import { http } from "./http";
import {
  TeamError,
  canConfigureCapacity,
  canSeeFullTeam,
  type AvailabilityState,
  type FunctionCapacityConfig,
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
 * Derivation helpers
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

/* ------------------------------------------------------------------ *
 * Backend mapping (real endpoint — GET /workload)
 * ------------------------------------------------------------------ */

/** Backend `WorkloadEntry` (camelCased by the HTTP client). */
interface RawWorkloadEntry {
  userId: string;
  name: string;
  role: Role;
  weeklyCapacityHours: number;
  roleUtilizationTarget: number;
  netCapacityHours: number;
  allocatedHours: number;
  availableHours: number;
  allocationPct: number;
  billableHoursWeek: number;
  utilizationPct: number;
  availabilityState: AvailabilityState;
  overAllocated: boolean;
  availabilityOverride: string | null;
}

/** Backend `UserDirectoryEntry` (camelCased) — used to enrich avatars. */
interface RawDirectoryUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Map a backend workload entry to the client `TeamMemberWorkload`. The avatar is
 * enriched from the `/users` directory (keyed by user id); the remaining
 * enrichment fields have no source in `/workload` and are defaulted (never
 * fabricated) — see the INTEGRATION-GAP notes.
 */
function toMemberWorkload(
  e: RawWorkloadEntry,
  avatarById: Map<string, string | null>
): TeamMemberWorkload {
  return {
    userId: e.userId,
    name: e.name,
    // Enriched from GET /users (directory avatar); null when the user has none.
    avatarUrl: avatarById.get(e.userId) ?? null,
    // INTEGRATION-GAP: function — professional function (engineering/design/…)
    // is not provided by /workload; placeholder pending a members endpoint.
    function: "engineering",
    accessRole: e.role,
    availability: e.availabilityState,
    awayNote: e.availabilityOverride,
    // INTEGRATION-GAP: activeProjects/openTasks/overdueTasks — not in /workload.
    activeProjects: 0,
    openTasks: 0,
    overdueTasks: 0,
    allocatedHours: e.allocatedHours,
    // INTEGRATION-GAP: loggedHours — total logged not provided (only billable).
    loggedHours: 0,
    billableHours: e.billableHoursWeek,
    weeklyCapacityHours: e.weeklyCapacityHours,
    netCapacityHours: round1(e.netCapacityHours),
    utilizationRatio: e.allocationPct / 100,
    billableUtilization: e.utilizationPct / 100,
    // INTEGRATION-GAP: days — daily heatmap breakdown not provided by /workload.
    days: [],
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
  // WIRED — GET /workload. The backend own-scopes a Membro to their single row.
  // INTEGRATION-GAP: weekOffset — /workload has no week parameter; it always
  // returns the CURRENT ISO week. weekStart is computed for display only, so
  // week navigation shows current-week figures regardless of the offset.
  async getTeamWorkload(role, userId, weekOffset) {
    void userId;
    seedConfigs();
    const weekStart = weekStartFor(weekOffset);
    const full = canSeeFullTeam(role);
    const canConfigure = canConfigureCapacity(role);

    const [data, directory] = await Promise.all([
      http.get<{ items: RawWorkloadEntry[] }>("/workload"),
      // Directory avatars (BR-002: a Membro's directory is their own row only).
      http
        .get<{ items: RawDirectoryUser[] }>("/users")
        .catch(() => ({ items: [] as RawDirectoryUser[] })),
    ]);
    const avatarById = new Map<string, string | null>(
      directory.items.map((u) => [u.id, u.avatarUrl])
    );
    const members = data.items
      .map((e) => toMemberWorkload(e, avatarById))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));

    return {
      weekStart: isoDay(weekStart),
      weekOffset,
      members,
      // INTEGRATION-GAP: configs — per-function capacity config has no backend
      // endpoint; served from the mock defaults for an Admin caller.
      configs: canConfigure
        ? (Object.keys(DEFAULT_CONFIGS) as TeamFunction[]).map((fn) => ({
            ...configFor(fn),
          }))
        : null,
      ownOnly: !full,
      canConfigure,
    };
  },

  // INTEGRATION-GAP (audit H16, partially resolved): the REAL BR-081 axis —
  // per-ROLE (admin/gestor/membro) utilization targets — now has a working,
  // Admin-configurable backend at GET/PATCH /workload/capacity-config/{role}
  // (see workload_service.list_role_capacity_configs /
  // update_role_capacity_config) and it genuinely drives live workload
  // computation. This "function" (engineering/design/qa/management/
  // leadership) axis stays mock: no member is ever assignable to a function
  // anywhere in the data model (toMemberWorkload hardcodes "engineering" for
  // everyone, see its own INTEGRATION-GAP note) — that's a separate, deeper
  // gap than H16 ("capacity edits never influence real computation") asks for,
  // since there is no real per-function data to wire this UI to yet.
  async getFunctionConfigs(role) {
    seedConfigs();
    if (!canConfigureCapacity(role)) throw new TeamError("forbidden");
    await delay(MOCK_LATENCY_MS / 2);
    return (Object.keys(DEFAULT_CONFIGS) as TeamFunction[]).map((fn) => ({
      ...configFor(fn),
    }));
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock (no capacity-config write).
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
