/**
 * Dashboard API client — REAL implementation (integration issue #44 / F2).
 *
 * The backend `GET /dashboard` endpoint already returns the exact camelCase
 * `DashboardData` shape and performs all role scoping + financial stripping
 * server-side (BR-002/008) from the JWT. So the client simply fetches it; the
 * `userId`/`role`/`paymentsGrant` args are kept for signature compatibility but
 * are authoritative on the server, not the client.
 */

import type { Role } from "@/lib/session";
import { http } from "./http";
import { DashboardError, type DashboardData } from "./dashboard-types";

/* ------------------------------------------------------------------ *
 * Canonical record routes (a panel item opens its source record).
 * ------------------------------------------------------------------ */
export const recordRoutes = {
  task: (id: string) => `/tasks?task=${id}`,
  project: (id: string) => `/projects/${id}`,
  opportunity: (id: string) => `/crm/pipeline?opportunity=${id}`,
  proposal: (id: string) => `/crm/proposals?proposal=${id}`,
  member: (id: string) => `/team?member=${id}`,
  payment: (id: string) => `/finance?milestone=${id}`,
} as const;

export interface DashboardApi {
  /**
   * The management overview, scoped to the authenticated user (BR-002/008).
   * The backend never returns financial data to a user without finance access
   * and returns a scoped (own-work) payload for a Membro.
   */
  getDashboard(userId: string, role: Role, paymentsGrant: boolean): Promise<DashboardData>;
}

export const dashboardApi: DashboardApi = {
  async getDashboard() {
    return http.get<DashboardData>("/dashboard");
  },
};

/** Guard used by the (server) route to refuse a totally unauthenticated read. */
export function assertDashboardAccess(role: Role | undefined): void {
  if (!role) throw new DashboardError("forbidden", "No session.");
}
