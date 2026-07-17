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
  type NotificationChannelPref,
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

/** Personal notification channel defaults for an empty user_preferences row. */
function defaultChannels(): NotificationPreferences {
  return {
    mentions: { inApp: true, email: true },
    taskAssigned: { inApp: true, email: false },
    approvals: { inApp: true, email: true },
    paymentMilestones: { inApp: true, email: false },
    weeklyDigest: { inApp: false, email: true },
  };
}

/** Backend `UserPreferencesResponse` (camelCased by the HTTP client). */
interface RawPreferences {
  theme: string;
  locale: string;
  notificationChannels: Partial<Record<string, NotificationChannelPref>>;
}

/**
 * Map the backend preferences to the UI contract, merging any stored channels
 * over the category defaults so a fresh (empty) `{}` row still renders every row.
 */
function toPreferences(raw: RawPreferences): UserPreferences {
  const channels = defaultChannels();
  for (const cat of NOTIFICATION_CATEGORIES) {
    const incoming = raw.notificationChannels?.[cat];
    if (incoming) channels[cat] = { inApp: !!incoming.inApp, email: !!incoming.email };
  }
  return {
    theme: (raw.theme as UserPreferences["theme"]) ?? "light",
    locale: raw.locale,
    notificationChannels: channels,
  };
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

  // WIRED — GET /users/me/preferences. The token identifies the caller.
  async getPreferences(user) {
    void user;
    const raw = await http.get<RawPreferences>("/users/me/preferences");
    return toPreferences(raw);
  },

  // WIRED — PATCH /users/me/preferences. Only the provided fields are written;
  // notification channels are stored verbatim (the frontend owns the vocabulary).
  async updatePreferences(user, input) {
    void user;
    const body: Record<string, unknown> = {};
    if (input.theme) body.theme = input.theme;
    if (input.locale) body.locale = input.locale;
    if (input.notificationChannels) body.notificationChannels = input.notificationChannels;
    const raw = await http.patch<RawPreferences>("/users/me/preferences", body);
    return toPreferences(raw);
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
