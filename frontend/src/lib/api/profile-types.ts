/**
 * Personal profile + preferences models (F1 / §8 /profile, WORKFLOW_SPEC §1.11).
 *
 * The backend (FastAPI JWT auth + `user_preferences`) is not wired yet. These
 * types describe the contract the integration agent fulfils; the profile page
 * depends only on these shapes and the mock `profileApi`, never on the impl, so
 * the mock can be swapped for real HTTP without touching callers.
 *
 * Notification channel prefs reuse the settings vocabulary so a member's
 * personal channels and the admin-managed defaults line up (single vocabulary).
 */

import type { Role } from "@/lib/session";
import type {
  NotificationCategory,
  NotificationPreferences,
} from "@/lib/api/settings-types";

/** Editable slice of the current user's personal profile. */
export interface PersonalProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** Read-only — role is Admin-managed (matrix §3), never self-serve. */
  role: Role;
  avatarDataUrl: string | null;
}

export interface UpdateProfileInput {
  name: string;
  email: string;
  phone: string;
  avatarDataUrl: string | null;
}

/**
 * Per-user preferences mapped to `user_preferences` (PRD data model).
 * `theme` + `locale` are live-applied client-side (next-themes + locale cookie);
 * they are persisted here so the server becomes the source of truth once auth is
 * wired. `notificationChannels` are the member's personal in-app/email choices.
 */
export interface UserPreferences {
  theme: "light" | "dark" | "system";
  locale: string;
  notificationChannels: NotificationPreferences;
}

export interface UpdatePreferencesInput {
  theme?: UserPreferences["theme"];
  locale?: string;
  notificationChannels?: NotificationPreferences;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export type { NotificationCategory };

/** Machine-readable error codes; each maps to an i18n key for a safe message. */
export type ProfileErrorCode =
  | "validation"
  | "invalid_current_password"
  | "same_as_current"
  | "not_found"
  | "network";

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  /** Optional dotted validation key for a field-specific message. */
  readonly detailKey?: string;
  constructor(code: ProfileErrorCode, detailKey?: string) {
    super(detailKey ?? code);
    this.name = "ProfileError";
    this.code = code;
    this.detailKey = detailKey;
  }
}
