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

import type { SessionUser } from "@/lib/session";
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

export interface ProfileApi {
  getProfile(user: SessionUser): Promise<PersonalProfile>;
  updateProfile(user: SessionUser, input: UpdateProfileInput): Promise<PersonalProfile>;
  getPreferences(user: SessionUser): Promise<UserPreferences>;
  updatePreferences(user: SessionUser, input: UpdatePreferencesInput): Promise<UserPreferences>;
  changePassword(user: SessionUser, input: ChangePasswordInput): Promise<void>;
}

export const profileApi: ProfileApi = {
  async getProfile(user) {
    await delay(MOCK_LATENCY_MS);
    return structuredClone(seedProfile(user));
  },

  async updateProfile(user, input) {
    await delay(MOCK_LATENCY_MS);
    const current = seedProfile(user);
    const name = input.name.trim();
    const email = input.email.trim();
    if (name.length < 2) throw new ProfileError("validation", "nameRequired");
    if (!EMAIL_RE.test(email)) throw new ProfileError("validation", "emailInvalid");
    const next: PersonalProfile = {
      ...current,
      name,
      email,
      phone: input.phone.trim(),
      avatarDataUrl: input.avatarDataUrl,
    };
    profileStore.set(user.id, next);
    return structuredClone(next);
  },

  async getPreferences(user) {
    await delay(MOCK_LATENCY_MS);
    return structuredClone(seedPrefs(user));
  },

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

  async changePassword(user, input) {
    await delay(MOCK_LATENCY_MS);
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
    // Mock: no stored credential to verify against, so a well-formed change
    // succeeds. The integration agent verifies `currentPassword` against the
    // hash and may throw ProfileError("invalid_current_password").
  },
};
