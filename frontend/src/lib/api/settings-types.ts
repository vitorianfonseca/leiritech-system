/**
 * Settings / configuration types (F20 / issue #42).
 *
 * The backend (FastAPI) does not exist yet. These types describe the contract
 * the integration agent will fulfil; UI code depends only on these shapes, never
 * on the mock implementation, so the impl can be swapped without touching
 * callers.
 *
 * Access (WORKFLOW_SPEC §3 / BR-004): settings configuration is Admin-only. A
 * Gestor may *use* project templates (#33) and manage personal preferences, but
 * organisation config (LeiriTech data, members, pipeline, tags, capacity, costs) is
 * Admin-only. Cost rates specifically are Admin-only (BR-008/069). A Membro has
 * no settings access at all — the route renders not-found.
 *
 * NOTE: capacity + internal cost rates are the SINGLE SOURCE `teamApi`
 * (`./team`, issue #37). The `/settings/capacity` and `/settings/costs` sections
 * read/write through `teamApi.updateFunctionConfig`, NOT through this module —
 * this file owns only genuinely new config (LeiriTech data, tags, members,
 * notifications, priorities, pipeline stage colours, archive, export).
 */

import type { Role } from "@/lib/session";

/* ------------------------------------------------------------------ *
 * Permissions (matrix §9 / BR-004)
 * ------------------------------------------------------------------ */

/** Full organisation config is Admin-only (BR-004). */
export function canAdministerSettings(role: Role): boolean {
  return role === "admin";
}

/**
 * Whether a user may invite members (WORKFLOW_SPEC §3 / BR-003). Admin always
 * can; a Gestor needs the explicit `invitesGrant`. Everything ELSE under member
 * management (role changes, deactivation, the directory) stays Admin-only
 * (BR-004/005) — this predicate gates the invite action alone.
 */
export function canInviteMembers(role: Role, invitesGrant: boolean): boolean {
  return role === "admin" || (role === "gestor" && invitesGrant);
}

/**
 * Whether a role may reach the /settings section at all. Admin + Gestor pass
 * (Gestor is limited to templates + personal preferences); Membro is blocked
 * entirely — the layout renders not-found (own profile is #43, separate).
 */
export function canAccessSettings(role: Role): boolean {
  return role === "admin" || role === "gestor";
}

/* ------------------------------------------------------------------ *
 * Colour tokens (reuse DESIGN.md tokens — never invent per-page colours)
 * ------------------------------------------------------------------ */

/**
 * A named accent that maps to an existing CSS custom property from
 * `globals.css`. Used for tags, priorities and pipeline stages so config never
 * introduces new hues.
 */
export type LeiritechColorToken =
  | "signal"
  | "teal"
  | "green"
  | "indigo"
  | "terracotta"
  | "violet"
  | "info";

export const LEIRITECH_COLOR_TOKENS: LeiritechColorToken[] = [
  "signal",
  "teal",
  "green",
  "indigo",
  "terracotta",
  "violet",
  "info",
];

/** Maps a colour token to the CSS variable defined in globals.css. */
export const LEIRITECH_COLOR_VAR: Record<LeiritechColorToken, string> = {
  signal: "var(--signal)",
  teal: "var(--chart-2)",
  green: "var(--success)",
  indigo: "var(--chart-4)",
  terracotta: "var(--chart-5)",
  violet: "var(--status-blocked)",
  info: "var(--info)",
};

/* ------------------------------------------------------------------ *
 * LeiriTech organisation profile
 * ------------------------------------------------------------------ */

export interface LeiritechProfile {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  website: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  /** Uploaded logo as a data URL (mock). Null when using the wordmark. */
  logoDataUrl: string | null;
}

export type UpdateLeiritechInput = LeiritechProfile;

/* ------------------------------------------------------------------ *
 * Tags (genuinely new config)
 * ------------------------------------------------------------------ */

export interface Tag {
  id: string;
  label: string;
  color: LeiritechColorToken;
  /** How many records currently carry the tag (drives the delete warning). */
  usageCount: number;
}

export interface CreateTagInput {
  label: string;
  color: LeiritechColorToken;
}

export interface UpdateTagInput {
  id: string;
  label: string;
  color: LeiritechColorToken;
}

/* ------------------------------------------------------------------ *
 * Members (directory + invite/deactivate — BR-005 last-admin guard)
 * ------------------------------------------------------------------ */

export type MemberStatus = "active" | "inactive" | "invited";

export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  /** ISO date of last activity, or null for a pending invite. */
  lastActiveAt: string | null;
}

export interface MembersSnapshot {
  members: MemberRecord[];
  /** Count of active admins — the UI uses this to enforce BR-005 (last admin). */
  activeAdminCount: number;
}

export interface InviteMemberInput {
  email: string;
  role: Role;
}

export interface UpdateMemberRoleInput {
  id: string;
  role: Role;
}

/* ------------------------------------------------------------------ *
 * Notification preferences
 * ------------------------------------------------------------------ */

export type NotificationCategory =
  | "mentions"
  | "taskAssigned"
  | "approvals"
  | "paymentMilestones"
  | "weeklyDigest";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "mentions",
  "taskAssigned",
  "approvals",
  "paymentMilestones",
  "weeklyDigest",
];

export interface NotificationChannelPref {
  inApp: boolean;
  email: boolean;
}

export type NotificationPreferences = Record<
  NotificationCategory,
  NotificationChannelPref
>;

/* ------------------------------------------------------------------ *
 * States & priorities
 * ------------------------------------------------------------------ */

/** Task workflow states — view-only (fixed by the state machine, WORKFLOW_SPEC §1.2). */
export type TaskStateId =
  | "a_fazer"
  | "em_curso"
  | "em_revisao"
  | "concluida"
  | "bloqueada";

export const TASK_STATE_IDS: TaskStateId[] = [
  "a_fazer",
  "em_curso",
  "em_revisao",
  "concluida",
  "bloqueada",
];

/** Badge variant per task state (DESIGN.md status zones). */
export function taskStateBadgeVariant(
  id: TaskStateId
): "outline" | "info" | "signal" | "success" | "blocked" {
  switch (id) {
    case "a_fazer":
      return "outline";
    case "em_curso":
      return "info";
    case "em_revisao":
      return "signal";
    case "concluida":
      return "success";
    case "bloqueada":
      return "blocked";
  }
}

export type PriorityId = "baixa" | "media" | "alta" | "urgente";

export const PRIORITY_IDS: PriorityId[] = ["baixa", "media", "alta", "urgente"];

export interface PriorityConfig {
  id: PriorityId;
  color: LeiritechColorToken;
}

export interface UpdatePriorityInput {
  id: PriorityId;
  color: LeiritechColorToken;
}

/* ------------------------------------------------------------------ *
 * Pipeline stage presentation config (colours — BR-012)
 *
 * Stage identity + order + win probability are owned by the pipeline (#29,
 * `opportunitiesApi.getPipelineStages`). This module adds the presentation
 * colour + persists admin edits to order/probability for the settings session
 * until the real `pipeline_stages` table is wired.
 * ------------------------------------------------------------------ */

import type { PipelineStageId } from "@/lib/api/opportunities-types";

export interface PipelineStageConfig {
  id: PipelineStageId;
  order: number;
  /** Default win probability 0–100 (BR-020). */
  winProbability: number;
  color: LeiritechColorToken;
}

export interface UpdatePipelineStagesInput {
  stages: Array<{
    id: PipelineStageId;
    order: number;
    winProbability: number;
    color: LeiritechColorToken;
  }>;
}

/* ------------------------------------------------------------------ *
 * Archive + export
 * ------------------------------------------------------------------ */

export type ArchivedKind = "project" | "opportunity" | "task";

export interface ArchivedItem {
  id: string;
  kind: ArchivedKind;
  title: string;
  /** ISO date archived. */
  archivedAt: string;
  context: string;
}

export type ExportDatasetId =
  | "companies"
  | "contacts"
  | "opportunities"
  | "projects"
  | "tasks"
  | "timeEntries"
  | "members";

export interface ExportDataset {
  id: ExportDatasetId;
  rowCount: number;
  /** Columns exported (for the CSV header + preview). */
  columns: string[];
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type SettingsErrorCode =
  | "forbidden"
  | "not_found"
  | "validation"
  | "last_admin";

/** Typed error thrown by the settings client. `code`/`detailKey` map to i18n. */
export class SettingsError extends Error {
  readonly code: SettingsErrorCode;
  readonly detailKey?: string;
  constructor(code: SettingsErrorCode, detailKey?: string) {
    super(detailKey ?? code);
    this.name = "SettingsError";
    this.code = code;
    this.detailKey = detailKey;
  }
}
