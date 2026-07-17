/**
 * Auth API client — REAL implementation (integration issue #44 / F1).
 *
 * Signatures are unchanged from the mock: UI code (TanStack Query mutations)
 * depends only on the `AuthApi` interface and the typed `ApiError` from
 * `./types`.
 *
 * Token storage is handled server-side by the /api/auth/* route handlers
 * (httpOnly refresh cookie + browser-readable access cookie), so `login`/
 * `acceptInvite` post to those handlers rather than talking to the backend
 * directly. Password reset/forgot go straight to the backend (no session).
 *
 * KNOWN BACKEND GAPS (flagged for the integration report):
 *  - There is no `GET invitation-by-token` endpoint, so `getInvite` cannot be
 *    fully wired; it returns minimal metadata and defers validation to accept.
 *  - `POST /invitations/accept` returns a user, NOT tokens — after accepting an
 *    invite the user must log in. `acceptInvite` returns identity only and does
 *    NOT establish a session.
 */

import { http, HttpError } from "./http";
import {
  ApiError,
  type AcceptInviteInput,
  type AuthResult,
  type AuthRole,
  type ForgotPasswordInput,
  type InviteInfo,
  type LoginInput,
  type ResetPasswordInput,
} from "./types";

function normalizeRole(role: string): AuthRole {
  return role === "admin" || role === "gestor" || role === "membro"
    ? role
    : "membro";
}

/** Map a backend/route-handler error (status + machine code) to an AuthErrorCode. */
function toAuthError(status: number, code: string | undefined): ApiError {
  if (status === 429) return new ApiError("rate_limited");
  switch (code) {
    case "INVALID_CREDENTIALS":
      return new ApiError("invalid_credentials");
    case "ACCOUNT_DEACTIVATED":
      return new ApiError("account_deactivated");
    case "INVALID_RESET_TOKEN":
      return new ApiError("reset_invalid");
    case "NETWORK":
      return new ApiError("network");
    default:
      if (status === 401) return new ApiError("invalid_credentials");
      if (status === 403) return new ApiError("account_deactivated");
      return new ApiError("network");
  }
}

function authErrorFromHttp(err: unknown): ApiError {
  if (err instanceof HttpError) return toAuthError(err.status, err.code);
  return new ApiError("network");
}

export interface AuthApi {
  login(input: LoginInput): Promise<AuthResult>;
  forgotPassword(input: ForgotPasswordInput): Promise<void>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
  getInvite(token: string): Promise<InviteInfo>;
  acceptInvite(input: AcceptInviteInput): Promise<AuthResult>;
}

export const authApi: AuthApi = {
  async login({ email, password }) {
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new ApiError("network");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw toAuthError(res.status, body?.error?.code);
    }
    return {
      userId: String(body.userId),
      role: normalizeRole(body.role),
    };
  },

  async forgotPassword({ email }) {
    // Always resolves for the caller — never disclose whether the email exists.
    try {
      await http.post("/auth/password/forgot", { email });
    } catch {
      /* swallow: the UI shows the same neutral confirmation regardless */
    }
  },

  async resetPassword({ token, password }) {
    try {
      await http.post("/auth/password/reset", { token, newPassword: password });
    } catch (err) {
      throw authErrorFromHttp(err);
    }
  },

  async getInvite(token) {
    // WIRED — GET /invitations/{token} (public, tokenized). Unknown token → 404;
    // a spent token (accepted/revoked/expired) → 410; both surface as invalid.
    const normalized = token.trim();
    if (!normalized) throw new ApiError("invite_invalid");
    try {
      const invite = await http.get<{
        email: string;
        role: string;
        invitedBy: string;
        status: string;
      }>(`/invitations/${encodeURIComponent(normalized)}`, { token: null });
      if (invite.status !== "pending") throw new ApiError("invite_invalid");
      return {
        email: invite.email,
        role: normalizeRole(invite.role),
        invitedBy: invite.invitedBy,
      } satisfies InviteInfo;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof HttpError && (err.status === 404 || err.status === 410 || err.status === 400)) {
        throw new ApiError("invite_invalid");
      }
      throw authErrorFromHttp(err);
    }
  },

  async acceptInvite({ token, name, password }) {
    try {
      const user = await http.post<{ id: string; role: string }>(
        "/invitations/accept",
        { token, name, password },
      );
      return { userId: user.id, role: normalizeRole(user.role) };
    } catch (err) {
      if (err instanceof HttpError && (err.status === 400 || err.status === 404)) {
        throw new ApiError("invite_invalid");
      }
      throw authErrorFromHttp(err);
    }
  },
};
