import "server-only";
import { cookies } from "next/headers";
import { ACCESS_COOKIE_KEY, LOCALE_COOKIE_KEY } from "@/lib/constants";
import { backendApiBase } from "@/lib/api/server-auth";

/**
 * Session abstraction — now backed by the real FastAPI backend (integration
 * issue #44/F1). It reads the browser-set access token cookie, calls
 * `GET /auth/me`, and maps the backend `UserResponse` into `SessionUser`.
 *
 * The return SHAPE is a hard contract consumed by the app shell and every
 * server component — it is intentionally unchanged from the foundation stub.
 * Token refresh + route protection are handled by `proxy.ts` (the Next 16
 * proxy/middleware convention), so by the time a server component calls this the
 * access cookie is fresh.
 *
 * The backend `UserResponse` has no `locale` field; locale is resolved from the
 * `locale` cookie (LocaleSwitcher) and falls back to `pt-PT`.
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

interface BackendUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  payments_grant: boolean;
  invites_grant: boolean;
  avatar_url: string | null;
}

function normalizeRole(role: string): Role {
  return role === "admin" || role === "gestor" || role === "membro"
    ? role
    : "membro";
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE_KEY)?.value;
  if (!accessToken) return null;

  let res: Response;
  try {
    res = await fetch(`${backendApiBase()}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const user = (await res.json()) as BackendUser;
  if (user.status && user.status !== "active") return null;

  const locale = store.get(LOCALE_COOKIE_KEY)?.value ?? "pt-PT";
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    paymentsGrant: user.payments_grant,
    invitesGrant: user.invites_grant,
    locale,
    avatarUrl: user.avatar_url,
  };
}
