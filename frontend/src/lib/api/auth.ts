/**
 * Auth API client — MOCK implementation (F1).
 *
 * Backend is not wired yet. This module exports a typed `authApi` object whose
 * methods return promises exactly as the real HTTP client will. The integration
 * agent replaces the bodies with real `fetch` calls to FastAPI WITHOUT changing
 * the signatures. UI code (via TanStack Query mutations) depends only on the
 * `AuthApi` interface below.
 *
 * Deterministic dev fixtures let the flows be exercised end to end:
 *   - Login accepts the seeded dev users (password: `aurea`).
 *   - `deactivated@aurea.pt` reproduces the deactivated-account path (BR-006).
 *   - Invite/reset tokens `expired` / `revoked` / `accepted` / `invalid`
 *     reproduce the failure branches; any other token is treated as valid.
 */

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

const MOCK_LATENCY_MS = 650;
const DEV_PASSWORD = "aurea";

interface DevAccount {
  userId: string;
  role: AuthRole;
  active: boolean;
}

const DEV_ACCOUNTS: Record<string, DevAccount> = {
  "rita@aurea.pt": { userId: "dev-admin", role: "admin", active: true },
  "bruno@aurea.pt": { userId: "dev-gestor", role: "gestor", active: true },
  "carla@aurea.pt": { userId: "dev-membro", role: "membro", active: true },
  "deactivated@aurea.pt": {
    userId: "dev-deactivated",
    role: "membro",
    active: false,
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    await delay(MOCK_LATENCY_MS);
    const account = DEV_ACCOUNTS[email.trim().toLowerCase()];
    if (!account || password !== DEV_PASSWORD) {
      throw new ApiError("invalid_credentials");
    }
    if (!account.active) {
      // Deactivated users cannot authenticate (BR-006).
      throw new ApiError("account_deactivated");
    }
    return { userId: account.userId, role: account.role };
  },

  async forgotPassword() {
    await delay(MOCK_LATENCY_MS);
    // Always resolves: never disclose whether an email is registered.
  },

  async resetPassword({ token }) {
    await delay(MOCK_LATENCY_MS);
    const normalized = token.trim().toLowerCase();
    if (!normalized || normalized === "invalid") {
      throw new ApiError("reset_invalid");
    }
    if (normalized === "expired") {
      throw new ApiError("reset_expired");
    }
  },

  async getInvite(token) {
    await delay(MOCK_LATENCY_MS);
    const normalized = token.trim().toLowerCase();
    if (!normalized || normalized === "invalid") {
      throw new ApiError("invite_invalid");
    }
    if (normalized === "expired") {
      throw new ApiError("invite_expired");
    }
    if (normalized === "revoked") {
      throw new ApiError("invite_revoked");
    }
    if (normalized === "accepted") {
      throw new ApiError("invite_accepted");
    }
    return {
      email: "novo.membro@aurea.pt",
      role: "membro",
      invitedBy: "Rita Andrade",
    };
  },

  async acceptInvite({ token }) {
    await delay(MOCK_LATENCY_MS);
    const normalized = token.trim().toLowerCase();
    if (!normalized || normalized === "invalid") {
      throw new ApiError("invite_invalid");
    }
    if (normalized === "expired") {
      throw new ApiError("invite_expired");
    }
    if (normalized === "revoked") {
      throw new ApiError("invite_revoked");
    }
    if (normalized === "accepted") {
      throw new ApiError("invite_accepted");
    }
    return { userId: "dev-membro", role: "membro" };
  },
};
