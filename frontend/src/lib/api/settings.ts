/**
 * Settings / configuration API client — MOCK implementation (F20 / issue #42).
 *
 * Backend is not wired yet. This module exports a typed `settingsApi` whose
 * methods return promises exactly as the real HTTP client will; the integration
 * agent replaces the bodies with real `fetch` calls WITHOUT changing the
 * signatures. UI code (via TanStack Query) depends only on the `SettingsApi`
 * interface and the models in `./settings-types`.
 *
 * Config writes are Admin-only (BR-004); cost rates specifically are Admin-only
 * (BR-008/069) and are NOT handled here — capacity + costs go through
 * `teamApi.updateFunctionConfig` (#37, single source of truth).
 *
 * Member ids/names echo the session dev users + team seed so the directory lines
 * up with /team and the pipeline owners. Stores are mutable module singletons so
 * edits persist for the session.
 */

import { opportunitiesApi, loadStageMaps } from "@/lib/api/opportunities";
import { PIPELINE_STAGE_IDS } from "@/lib/api/opportunities-types";
import { http, HttpError } from "@/lib/api/http";
import type { Role } from "@/lib/session";
import {
  SettingsError,
  canAdministerSettings,
  canInviteMembers,
  NOTIFICATION_CATEGORIES,
  PRIORITY_IDS,
  type LeiritechColorToken,
  type LeiritechProfile,
  type ArchivedItem,
  type CreateTagInput,
  type ExportDataset,
  type InviteMemberInput,
  type MemberRecord,
  type MembersSnapshot,
  type NotificationPreferences,
  type PipelineStageConfig,
  type PriorityConfig,
  type Tag,
  type UpdateLeiritechInput,
  type UpdateMemberRoleInput,
  type UpdatePipelineStagesInput,
  type UpdatePriorityInput,
  type UpdateTagInput,
} from "./settings-types";

const MOCK_LATENCY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function assertAdmin(role: Role): void {
  if (!canAdministerSettings(role)) throw new SettingsError("forbidden");
}

/* ------------------------------------------------------------------ *
 * Canonical routes
 * ------------------------------------------------------------------ */

export const settingsRoutes = {
  index: () => "/settings",
  leiritech: () => "/settings/leiritech",
  members: () => "/settings/members",
  roles: () => "/settings/roles",
  pipeline: () => "/settings/pipeline",
  states: () => "/settings/states",
  tags: () => "/settings/tags",
  templates: () => "/settings/templates",
  capacity: () => "/settings/capacity",
  costs: () => "/settings/costs",
  notifications: () => "/settings/notifications",
  theme: () => "/settings/theme",
  archive: () => "/settings/archive",
  export: () => "/settings/export",
} as const;

/* ------------------------------------------------------------------ *
 * Stores
 * ------------------------------------------------------------------ */

let leiritech: LeiritechProfile = {
  name: "LeiriTech",
  tagline: "O sistema operativo interno da LeiriTech.",
  email: "geral@leiritech.pt",
  phone: "+351 220 000 000",
  website: "https://leiritech.pt",
  addressLine: "Rua da Restauração, 120",
  city: "Porto",
  postalCode: "4050-499",
  country: "Portugal",
  logoDataUrl: null,
};

const tagStore = new Map<string, Tag>();
function seedTags(): void {
  if (tagStore.size > 0) return;
  const seed: Tag[] = [
    { id: "t-1", label: "Prioritário", color: "signal", usageCount: 12 },
    { id: "t-2", label: "Novo cliente", color: "green", usageCount: 8 },
    { id: "t-3", label: "Recorrente", color: "teal", usageCount: 21 },
    { id: "t-4", label: "Em risco", color: "terracotta", usageCount: 3 },
    { id: "t-5", label: "Referência", color: "indigo", usageCount: 5 },
    { id: "t-6", label: "Interno", color: "violet", usageCount: 7 },
  ];
  for (const tag of seed) tagStore.set(tag.id, tag);
}

/** Backend `UserDirectoryEntry` (camelCased by the HTTP client). */
interface RawDirectoryUser {
  id: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  email: string | null;
  status: string | null;
  lastLoginAt: string | null;
}

/** Map a backend directory entry to the members-table `MemberRecord`. */
function toMemberRecord(raw: RawDirectoryUser): MemberRecord {
  const status = raw.status === "deactivated" ? "inactive" : "active";
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email ?? "",
    role: raw.role,
    status,
    lastActiveAt: raw.lastLoginAt ?? null,
  };
}

function activeAdminCountOf(members: MemberRecord[]): number {
  return members.filter((m) => m.role === "admin" && m.status === "active").length;
}

/** Fetch the real directory (incl. inactive), mapped + sorted for the table. */
async function fetchMembers(): Promise<MemberRecord[]> {
  const data = await http.get<{ items: RawDirectoryUser[] }>("/users", {
    query: { include_inactive: true },
  });
  return data.items
    .map(toMemberRecord)
    .sort((a, b) => {
      const order = { active: 0, invited: 1, inactive: 2 } as const;
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.name.localeCompare(b.name, "pt-PT");
    });
}

let notifications: NotificationPreferences = {
  mentions: { inApp: true, email: true },
  taskAssigned: { inApp: true, email: false },
  approvals: { inApp: true, email: true },
  paymentMilestones: { inApp: true, email: true },
  weeklyDigest: { inApp: false, email: true },
};

const priorityColors: Record<string, LeiritechColorToken> = {
  baixa: "teal",
  media: "info",
  alta: "signal",
  urgente: "terracotta",
};

const DEFAULT_STAGE_COLORS: LeiritechColorToken[] = [
  "teal",
  "info",
  "indigo",
  "signal",
  "violet",
  "green",
];
let stageConfigs: PipelineStageConfig[] | null = null;

async function ensureStageConfigs(): Promise<PipelineStageConfig[]> {
  if (stageConfigs) return stageConfigs;
  const stages = await opportunitiesApi.getPipelineStages();
  stageConfigs = stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      id: s.id,
      order: s.order,
      winProbability: s.winProbability,
      color: DEFAULT_STAGE_COLORS[i % DEFAULT_STAGE_COLORS.length],
    }));
  return stageConfigs;
}

const archived: ArchivedItem[] = [
  { id: "a-1", kind: "project", title: "Website institucional — Câmara de Alvorada", archivedAt: isoDaysAgo(34), context: "Concluído em 2025" },
  { id: "a-2", kind: "opportunity", title: "Microsite — Feira do Livro", archivedAt: isoDaysAgo(52), context: "Perdido — orçamento" },
  { id: "a-3", kind: "task", title: "Migração de conteúdos legados", archivedAt: isoDaysAgo(19), context: "Projeto Lumina Retail" },
  { id: "a-4", kind: "project", title: "App de fidelização — piloto", archivedAt: isoDaysAgo(70), context: "Cancelado pelo cliente" },
];

const EXPORT_DATASETS: ExportDataset[] = [
  { id: "companies", rowCount: 42, columns: ["nome", "setor", "estado", "criado_em"] },
  { id: "contacts", rowCount: 118, columns: ["nome", "email", "empresa", "cargo"] },
  { id: "opportunities", rowCount: 63, columns: ["titulo", "empresa", "etapa", "valor"] },
  { id: "projects", rowCount: 28, columns: ["nome", "cliente", "estado", "margem"] },
  { id: "tasks", rowCount: 540, columns: ["titulo", "projeto", "estado", "prazo"] },
  { id: "timeEntries", rowCount: 1240, columns: ["membro", "projeto", "horas", "data"] },
  { id: "members", rowCount: 8, columns: ["nome", "email", "perfil", "estado"] },
];

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface SettingsApi {
  getLeiritechProfile(): Promise<LeiritechProfile>;
  updateLeiritechProfile(role: Role, input: UpdateLeiritechInput): Promise<LeiritechProfile>;

  listTags(): Promise<Tag[]>;
  createTag(role: Role, input: CreateTagInput): Promise<Tag>;
  updateTag(role: Role, input: UpdateTagInput): Promise<Tag>;
  deleteTag(role: Role, id: string): Promise<void>;
  restoreTag(role: Role, tag: Tag): Promise<Tag>;

  getMembers(role: Role): Promise<MembersSnapshot>;
  inviteMember(role: Role, invitesGrant: boolean, input: InviteMemberInput): Promise<MemberRecord>;
  updateMemberRole(role: Role, input: UpdateMemberRoleInput): Promise<MembersSnapshot>;
  setMemberStatus(role: Role, id: string, active: boolean): Promise<MembersSnapshot>;

  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences>;

  getPriorities(): Promise<PriorityConfig[]>;
  updatePriority(role: Role, input: UpdatePriorityInput): Promise<PriorityConfig>;

  getPipelineStageConfigs(): Promise<PipelineStageConfig[]>;
  updatePipelineStages(role: Role, input: UpdatePipelineStagesInput): Promise<PipelineStageConfig[]>;

  listArchived(): Promise<ArchivedItem[]>;
  restoreArchived(role: Role, id: string): Promise<void>;

  listExportDatasets(): Promise<ExportDataset[]>;
}

export const settingsApi: SettingsApi = {
  // INTEGRATION-GAP: no backend endpoint — left on mock (no org-profile route).
  async getLeiritechProfile() {
    await delay(MOCK_LATENCY_MS);
    return { ...leiritech };
  },

  // INTEGRATION-GAP: no backend endpoint — left on mock (no org-profile route).
  async updateLeiritechProfile(role, input) {
    assertAdmin(role);
    await delay(MOCK_LATENCY_MS);
    if (!input.name.trim()) throw new SettingsError("validation", "nameRequired");
    leiritech = { ...input, name: input.name.trim() };
    return { ...leiritech };
  },

  // INTEGRATION-GAP: no backend endpoint — tags CRUD is entirely on mock.
  async listTags() {
    seedTags();
    await delay(MOCK_LATENCY_MS);
    return [...tagStore.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-PT"));
  },

  async createTag(role, input) {
    assertAdmin(role);
    seedTags();
    await delay(MOCK_LATENCY_MS);
    const label = input.label.trim();
    if (!label) throw new SettingsError("validation", "labelRequired");
    const dup = [...tagStore.values()].some(
      (t) => t.label.toLowerCase() === label.toLowerCase()
    );
    if (dup) throw new SettingsError("validation", "labelDuplicate");
    const tag: Tag = { id: uid("t"), label, color: input.color, usageCount: 0 };
    tagStore.set(tag.id, tag);
    return { ...tag };
  },

  async updateTag(role, input) {
    assertAdmin(role);
    seedTags();
    await delay(MOCK_LATENCY_MS);
    const existing = tagStore.get(input.id);
    if (!existing) throw new SettingsError("not_found");
    const label = input.label.trim();
    if (!label) throw new SettingsError("validation", "labelRequired");
    const dup = [...tagStore.values()].some(
      (t) => t.id !== input.id && t.label.toLowerCase() === label.toLowerCase()
    );
    if (dup) throw new SettingsError("validation", "labelDuplicate");
    const next: Tag = { ...existing, label, color: input.color };
    tagStore.set(next.id, next);
    return { ...next };
  },

  async deleteTag(role, id) {
    assertAdmin(role);
    seedTags();
    await delay(MOCK_LATENCY_MS);
    if (!tagStore.has(id)) throw new SettingsError("not_found");
    tagStore.delete(id);
  },

  async restoreTag(role, tag) {
    assertAdmin(role);
    seedTags();
    await delay(MOCK_LATENCY_MS / 2);
    tagStore.set(tag.id, { ...tag });
    return { ...tag };
  },

  // WIRED — GET /users?include_inactive=true. The backend directory is the real
  // source; invited users live in the invitations table and are not listed here.
  async getMembers(role) {
    assertAdmin(role);
    const members = await fetchMembers();
    return { members, activeAdminCount: activeAdminCountOf(members) };
  },

  // WIRED — POST /invitations. The grant gate is kept as defence-in-depth; the
  // backend re-checks the invite capability from the JWT.
  // INTEGRATION-GAP: name — invitations carry no name; derived from the email
  // (the real name is set by the invitee on acceptance).
  async inviteMember(role, invitesGrant, input) {
    // BR-003 / §3: inviting is permitted for admin OR a gestor with the grant.
    if (!canInviteMembers(role, invitesGrant)) throw new SettingsError("forbidden");
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new SettingsError("validation", "emailInvalid");
    try {
      const invite = await http.post<{ id: string; email: string; role: Role }>(
        "/invitations",
        { email, role: input.role }
      );
      const name = email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        id: invite.id,
        name,
        email: invite.email,
        role: invite.role,
        status: "invited",
        lastActiveAt: null,
      };
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409) throw new SettingsError("validation", "emailDuplicate");
        if (err.status === 403) throw new SettingsError("forbidden");
        if (err.status === 422) throw new SettingsError("validation", "emailInvalid");
      }
      throw err;
    }
  },

  // WIRED → PATCH /users/{id}/role (audit H15). The backend enforces the
  // last-admin guard (BR-005) with a row lock; a rejection is mapped back to
  // the same SettingsError the client-side pre-check used to throw.
  async updateMemberRole(role, input) {
    assertAdmin(role);
    const members = await fetchMembers();
    const member = members.find((m) => m.id === input.id);
    if (!member) throw new SettingsError("not_found");
    // BR-005: never demote the last active admin (client-side pre-check).
    if (
      member.role === "admin" &&
      member.status === "active" &&
      input.role !== "admin" &&
      activeAdminCountOf(members) <= 1
    ) {
      throw new SettingsError("last_admin");
    }
    try {
      await http.patch(`/users/${input.id}/role`, { role: input.role });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === "LAST_ADMIN" || err.status === 409) throw new SettingsError("last_admin");
        if (err.status === 404) throw new SettingsError("not_found");
        if (err.status === 403) throw new SettingsError("forbidden");
      }
      throw err;
    }
    return this.getMembers(role);
  },

  // WIRED — POST /users/{id}/activate | /users/{id}/deactivate. The backend
  // enforces the last-admin guard (BR-005); a rejection is mapped back to it.
  async setMemberStatus(role, id, active) {
    assertAdmin(role);
    const members = await fetchMembers();
    const member = members.find((m) => m.id === id);
    if (!member) throw new SettingsError("not_found");
    // BR-005: never deactivate the last active admin (client-side pre-check).
    if (!active && member.role === "admin" && member.status === "active" && activeAdminCountOf(members) <= 1) {
      throw new SettingsError("last_admin");
    }
    try {
      await http.post(`/users/${id}/${active ? "activate" : "deactivate"}`);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === "LAST_ADMIN" || err.status === 409) throw new SettingsError("last_admin");
        if (err.status === 404) throw new SettingsError("not_found");
        if (err.status === 403) throw new SettingsError("forbidden");
      }
      throw err;
    }
    return this.getMembers(role);
  },

  // INTEGRATION-GAP: no backend endpoint — org notification prefs left on mock.
  async getNotificationPreferences() {
    await delay(MOCK_LATENCY_MS);
    return structuredClone(notifications);
  },

  // INTEGRATION-GAP: no backend endpoint — org notification prefs left on mock.
  async updateNotificationPreferences(prefs) {
    await delay(MOCK_LATENCY_MS);
    // Defensive: only accept the known categories.
    const next = structuredClone(notifications);
    for (const cat of NOTIFICATION_CATEGORIES) {
      if (prefs[cat]) next[cat] = { inApp: !!prefs[cat].inApp, email: !!prefs[cat].email };
    }
    notifications = next;
    return structuredClone(notifications);
  },

  // INTEGRATION-GAP: no backend endpoint — priority colours left on mock.
  async getPriorities() {
    await delay(MOCK_LATENCY_MS);
    return PRIORITY_IDS.map((id) => ({ id, color: priorityColors[id] }));
  },

  // INTEGRATION-GAP: no backend endpoint — priority colours left on mock.
  async updatePriority(role, input) {
    assertAdmin(role);
    await delay(MOCK_LATENCY_MS);
    priorityColors[input.id] = input.color;
    return { id: input.id, color: input.color };
  },

  // Reads through opportunitiesApi.getPipelineStages() (wired separately to
  // GET /pipeline-stages). The presentation colour is a client-side default
  // (backend stores a hex string, not a LeiriTech colour token).
  async getPipelineStageConfigs() {
    const configs = await ensureStageConfigs();
    await delay(MOCK_LATENCY_MS);
    return configs.slice().sort((a, b) => a.order - b.order).map((s) => ({ ...s }));
  },

  // WIRED → PATCH /pipeline-stages/{id} per changed stage (audit H14). Resolves
  // the frontend's code-keyed id ("new_contact") to the backend stage UUID via
  // the shared uuid↔code cache (#57). The backend `color` column is a free-text
  // string with no hex constraint, so the LeiriTech colour token is stored
  // as-is — no hex bridge needed.
  async updatePipelineStages(role, input) {
    assertAdmin(role);
    for (const s of input.stages) {
      if (!PIPELINE_STAGE_IDS.includes(s.id)) throw new SettingsError("not_found");
      if (s.winProbability < 0 || s.winProbability > 100)
        throw new SettingsError("validation", "probabilityRange");
    }
    const sorted = input.stages.slice().sort((a, b) => a.order - b.order);
    const maps = await loadStageMaps();
    await Promise.all(
      sorted.map((s, i) => {
        const stageUuid = maps.byCode.get(s.id);
        if (!stageUuid) throw new SettingsError("not_found");
        return http.patch(`/pipeline-stages/${stageUuid}`, {
          order_index: i,
          win_probability: Math.round(s.winProbability),
          color: s.color,
        });
      })
    );
    stageConfigs = sorted.map((s, i) => ({
      id: s.id,
      order: i + 1,
      winProbability: Math.round(s.winProbability),
      color: s.color,
    }));
    return stageConfigs.map((s) => ({ ...s }));
  },

  // INTEGRATION-GAP: no backend endpoint — unified archive list left on mock.
  async listArchived() {
    await delay(MOCK_LATENCY_MS);
    return archived
      .slice()
      .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
      .map((a) => ({ ...a }));
  },

  // INTEGRATION-GAP: no backend endpoint — unified archive restore left on mock.
  async restoreArchived(role, id) {
    assertAdmin(role);
    await delay(MOCK_LATENCY_MS);
    const idx = archived.findIndex((a) => a.id === id);
    if (idx < 0) throw new SettingsError("not_found");
    archived.splice(idx, 1);
  },

  // INTEGRATION-GAP: no backend endpoint — export dataset catalog left on mock.
  async listExportDatasets() {
    await delay(MOCK_LATENCY_MS / 2);
    return EXPORT_DATASETS.map((d) => ({ ...d, columns: [...d.columns] }));
  },
};
