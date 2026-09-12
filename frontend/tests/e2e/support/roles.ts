import path from "node:path";

/**
 * Role fixtures for the E2E suite (issue #54).
 *
 * Several of the 25 critical flows are role-gated (WORKFLOW_SPEC §3 permission
 * matrix, BR-002 / BR-003 / BR-008), so the suite drives three real identities
 * rather than testing everything as Administrador:
 *
 *   admin   — Administrador; full access, owns member management (flow 3).
 *   gestor  — Gestor WITH payments_grant + invites_grant; the only non-admin
 *             role that may see financials (flow 24) and invite (flow 3).
 *   membro  — Membro; project-scoped. Used for the negative half of the gates
 *             (no /finance, own workload only) and for the delivery hub.
 *
 * These are the identities the dev seed already creates
 * (backend/app/database/seed.py); `scripts/bootstrap_e2e_users.py` only stamps a
 * known password on them so Playwright can drive the real login form. Nothing
 * here is a production credential: the bootstrap refuses to run outside a
 * development/test ENVIRONMENT.
 */

export type RoleKey = "admin" | "gestor" | "membro";

export interface RoleFixture {
  readonly key: RoleKey;
  readonly email: string;
  readonly name: string;
  /** Grants the seed gives this identity (BR-003). */
  readonly paymentsGrant: boolean;
  readonly invitesGrant: boolean;
}

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2ePlaywright!2026";

export const ROLES: Record<RoleKey, RoleFixture> = {
  admin: {
    key: "admin",
    email: "admin@leiritech.pt",
    name: "LeiriTech Admin",
    paymentsGrant: false,
    invitesGrant: false,
  },
  gestor: {
    key: "gestor",
    email: "beatriz@leiritech.pt",
    name: "Beatriz Lopes",
    paymentsGrant: true,
    invitesGrant: true,
  },
  membro: {
    key: "membro",
    email: "diogo@leiritech.pt",
    name: "Diogo Ferreira",
    paymentsGrant: false,
    invitesGrant: false,
  },
};

/** Where `auth.setup.ts` parks each role's signed-in storage state. */
export const AUTH_DIR = path.join(process.cwd(), "tests", "e2e", ".auth");

export function storageStateFor(role: RoleKey): string {
  return path.join(AUTH_DIR, `${role}.json`);
}
