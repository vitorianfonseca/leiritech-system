/**
 * Personal profile + preferences API client — MOCK implementation
 * (F1 / §8 /profile, WORKFLOW_SPEC §1.11).
 *
 * Backend is not wired yet. `profileApi` methods return promises exactly as the
 * real HTTP client will; the integration agent replaces the bodies with real
 * `fetch` calls WITHOUT changing the signatures. UI code depends only on the
 * `ProfileApi` interface and the models in `./profile-types`.
 *
 * All roles may read/edit their OWN profile (matrix §3) — there is no cross-user
 * access here; every method is scoped to the passed session user. `role` is
 * read-only (Admin-managed). Per-user stores are mutable module singletons so
 * edits persist for the session, keyed by user id.
 */

import type { Role, SessionUser } from "@/lib/session";
import { http, HttpError } from "@/lib/api/http";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationPreferences,
} from "@/lib/api/settings-types";
import {
  ProfileError,
  type ChangePasswordInput,
  type PersonalProfile,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
  type UserPreferences,
} from "@/lib/api/profile-types";

const MOCK_LATENCY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic seed phone per dev user so the directory reads consistently. */
const SEED_PHONE: Record<string, string> = {
  "dev-admin": "+351 912 000 001",
  "dev-gestor": "+351 912 000 002",
  "dev-membro": "+351 912 000 003",
};

/** Personal notification channel defaults for a fresh user_preferences row. */
function defaultChannels(): NotificationPreferences {
  return {
    mentions: { inApp: true, email: true },
    taskAssigned: { inApp: true, email: false },
    approvals: { inApp: true, email: true },
    paymentMilestones: { inApp: true, email: false },
    weeklyDigest: { inApp: false, email: true },
  };
}

const profileStore = new Map<string, PersonalProfile>();
const prefsStore = new Map<string, UserPreferences>();

function seedProfile(user: SessionUser): PersonalProfile {
  const existing = profileStore.get(user.id);
  if (existing) return existing;
  const seeded: PersonalProfile = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: SEED_PHONE[user.id] ?? "",
    role: user.role,
    avatarDataUrl: user.avatarUrl,
  };
  profileStore.set(user.id, seeded);
  return seeded;
}

function seedPrefs(user: SessionUser): UserPreferences {
  const existing = prefsStore.get(user.id);
  if (existing) return existing;
  const seeded: UserPreferences = {
    theme: "light",
    locale: user.locale,
    notificationChannels: defaultChannels(),
  };
  prefsStore.set(user.id, seeded);
  return seeded;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Backend `UserResponse` (camelCased by the HTTP client). */
interface RawUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
}

/**
 * Map the backend user to the editable `PersonalProfile`.
 * INTEGRATION-GAP: phone — not stored/returned by the backend; defaults to "".
 */
function toProfile(raw: RawUser): PersonalProfile {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    phone: "",
    role: raw.role,
    avatarDataUrl: raw.avatarUrl,
  };
}

export interface ProfileApi {
  getProfile(user: SessionUser): Promise<PersonalProfile>;
  updateProfile(user: SessionUser, input: UpdateProfileInput): Promise<PersonalProfile>;
  getPreferences(user: SessionUser): Promise<UserPreferences>;
  updatePreferences(user: SessionUser, input: UpdatePreferencesInput): Promise<UserPreferences>;
  changePassword(user: SessionUser, input: ChangePasswordInput): Promise<void>;
}

export const profileApi: ProfileApi = {
  // WIRED — GET /auth/me. `user` kept for signature; the token identifies the caller.
  async getProfile(user) {
    void user;
    const raw = await http.get<RawUser>("/auth/me");
    return toProfile(raw);
  },

  // WIRED — PATCH /auth/me. The backend accepts only { name, avatar_url }.
  // INTEGRATION-GAP: email/phone — the self-service endpoint does not persist
  // them, so those edits are dropped (email is validated client-side but the
  // returned value comes back unchanged from the server; phone is not stored).
  async updateProfile(user, input) {
    void user;
    const name = input.name.trim();
    const email = input.email.trim();
    if (name.length < 2) throw new ProfileError("validation", "nameRequired");
    if (!EMAIL_RE.test(email)) throw new ProfileError("validation", "emailInvalid");
    try {
      const raw = await http.patch<RawUser>("/auth/me", {
        name,
        avatarUrl: input.avatarDataUrl,
      });
      // Preserve the locally-entered phone in the returned object (not persisted).
      return { ...toProfile(raw), phone: input.phone.trim() };
    } catch (err) {
      if (err instanceof HttpError && err.status === 422) {
        throw new ProfileError("validation", "nameRequired");
      }
      throw err;
    }
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock. There is no
  // user_preferences endpoint (theme/locale/notification channels are not
  // persisted server-side yet); resolved from the session for now.
  async getPreferences(user) {
    await delay(MOCK_LATENCY_MS);
    return structuredClone(seedPrefs(user));
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock (no user_preferences write).
  async updatePreferences(user, input) {
    await delay(MOCK_LATENCY_MS);
    const current = seedPrefs(user);
    const next: UserPreferences = { ...current };
    if (input.theme) next.theme = input.theme;
    if (input.locale) next.locale = input.locale;
    if (input.notificationChannels) {
      const channels = structuredClone(current.notificationChannels);
      for (const cat of NOTIFICATION_CATEGORIES) {
        const incoming = input.notificationChannels[cat];
        if (incoming) channels[cat] = { inApp: !!incoming.inApp, email: !!incoming.email };
      }
      next.notificationChannels = channels;
    }
    prefsStore.set(user.id, next);
    return structuredClone(next);
  },

  // WIRED — POST /auth/me/password. Client-side guards preserve the mock's error
  // semantics; the backend verifies the current password against the hash.
  async changePassword(user, input) {
    void user;
    if (input.currentPassword.trim().length < 1) {
      throw new ProfileError("validation", "currentPasswordRequired");
    }
    if (input.newPassword.length < MIN_PASSWORD) {
      throw new ProfileError("validation", "passwordTooShort");
    }
    if (input.newPassword === input.currentPassword) {
      throw new ProfileError("same_as_current", "passwordSameAsCurrent");
    }
    try {
      await http.post("/auth/me/password", {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === "INVALID_CURRENT_PASSWORD" || err.status === 401) {
          throw new ProfileError("invalid_current_password", "currentPasswordInvalid");
        }
        if (err.status === 422) {
          throw new ProfileError("validation", "passwordTooShort");
        }
      }
      throw err;
    }
  },
};
