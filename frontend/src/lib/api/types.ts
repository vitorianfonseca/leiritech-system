/**
 * Shared API models for the auth surface (F1).
 *
 * The backend (FastAPI JWT auth) does not exist yet. These types describe the
 * contract the integration agent will fulfil; feature code depends only on
 * these shapes, never on the mock implementation, so the impl can be swapped
 * without touching callers.
 */

export type AuthRole = "admin" | "gestor" | "membro";

/** Machine-readable error codes returned by the auth client. */
export type AuthErrorCode =
  | "invalid_credentials"
  | "account_deactivated"
  | "rate_limited"
  | "invite_invalid"
  | "invite_expired"
  | "invite_revoked"
  | "invite_accepted"
  | "reset_invalid"
  | "reset_expired"
  | "network";

/**
 * Typed error thrown by the auth client. The `code` maps to an i18n key so the
 * UI can render a localized, user-safe message without leaking server detail.
 */
export class ApiError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
  }
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Result of a successful authentication. `role` drives the dev session cookie. */
export interface AuthResult {
  userId: string;
  role: AuthRole;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

/** Read-only invite metadata shown on the accept-invite screen (BR-007). */
export interface InviteInfo {
  email: string;
  role: AuthRole;
  invitedBy: string;
}

export interface AcceptInviteInput {
  token: string;
  name: string;
  password: string;
}
