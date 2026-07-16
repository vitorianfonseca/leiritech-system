import "server-only";
import { cookies } from "next/headers";

/**
 * Foundation-phase session abstraction.
 *
 * The backend (JWT auth, F1) is not wired yet. Until it is, the shell needs a
 * role + identity to render role-aware navigation and the user menu. This reads
 * a dev cookie (`aurea_role`) and returns a deterministic stub user.
 *
 * Feature builders / the integration agent MUST replace `getSession()` with the
 * real session read (validate the access token, load the user record) WITHOUT
 * changing this function's return shape — the shell consumes it as a contract.
 */

export type Role = "admin" | "gestor" | "membro";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Explicit per-user grants (BR-003). Ignored for admin (full access). */
  paymentsGrant: boolean;
  invitesGrant: boolean;
  /** Preferred locale from the user profile (drives i18n resolution). */
  locale: string;
  avatarUrl: string | null;
}

const DEV_USERS: Record<Role, SessionUser> = {
  admin: {
    id: "dev-admin",
    name: "Rita Andrade",
    email: "rita@aurea.pt",
    role: "admin",
    paymentsGrant: true,
    invitesGrant: true,
    locale: "pt-PT",
    avatarUrl: null,
  },
  gestor: {
    id: "dev-gestor",
    name: "Bruno Salgado",
    email: "bruno@aurea.pt",
    role: "gestor",
    paymentsGrant: true,
    invitesGrant: false,
    locale: "pt-PT",
    avatarUrl: null,
  },
  membro: {
    id: "dev-membro",
    name: "Carla Nunes",
    email: "carla@aurea.pt",
    role: "membro",
    paymentsGrant: false,
    invitesGrant: false,
    locale: "pt-PT",
    avatarUrl: null,
  },
};

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const role = store.get("aurea_role")?.value as Role | undefined;
  const user = role ? DEV_USERS[role] : DEV_USERS.admin;
  return user ?? DEV_USERS.admin;
}
